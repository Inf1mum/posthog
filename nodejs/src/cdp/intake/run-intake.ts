import { v5 as uuidv5 } from 'uuid'

import { CyclotronV2IdempotentOutcome } from '~/cdp/services/cyclotron-v2/types'
import { IdempotentJobQueue } from '~/cdp/services/job-queue/job-queue.interface'
import { HogInvocationResultsService } from '~/cdp/services/monitoring/hog-invocation-results.service'
import { CyclotronJobInvocationHogFlow } from '~/cdp/types'

export type Run = {
    invocation: CyclotronJobInvocationHogFlow
    // Present when the caller sent an idempotency key. The run's id is then `keyedRunId` of that key.
    claim?: { fingerprint: string }
}

export type Recalled = { status: 'absent' } | { status: 'replayed' | 'mismatch'; runId: string }

export type Committed = { runId: string; outcome: CyclotronV2IdempotentOutcome }

export type RunIntakeDeps = {
    hogflowQueue: IdempotentJobQueue
    invocationResultsRowsService: HogInvocationResultsService
}

// Never change the namespace or the name's encoding: a retry inside the claim's window would get another id and
// send a second time.
const KEYED_RUN_ID_NAMESPACE = 'c2b7f0a4-4c3e-4b8e-9d4f-6a1f3e5d2b90'

/** The run id of a keyed run, the same for every retry of the key. `scope` keeps one key apart across callers. */
export const keyedRunId = (teamId: number, scope: string, key: string): string =>
    uuidv5(JSON.stringify([teamId, scope, key]), KEYED_RUN_ID_NAMESPACE)

export class RunIntake {
    constructor(private deps: RunIntakeDeps) {}

    async recall(run: Run): Promise<Recalled> {
        if (!run.claim) {
            return { status: 'absent' }
        }
        const runId = run.invocation.id
        const stored = await this.deps.hogflowQueue.findIdempotencyKey(runId)
        if (!stored) {
            return { status: 'absent' }
        }
        return { status: stored.fingerprint === run.claim.fingerprint ? 'replayed' : 'mismatch', runId }
    }

    // A keyed run claims its key in the job's own transaction, so a repeat creates no second job.
    async launch(runs: Run[], _options: { wait: 'committed' }): Promise<Committed[]> {
        const invocations = runs.map((run) => run.invocation)
        // Queued before the insert serializes the invocations, because queueLifecycleRow stamps
        // `state.firstScheduledAt` and only a stamp set before serialization reaches cyclotron.
        for (const invocation of invocations) {
            this.deps.invocationResultsRowsService.queueLifecycleRow(invocation, 'running')
        }
        let outcomes: CyclotronV2IdempotentOutcome[]
        try {
            outcomes = await this.insert(runs)
        } catch (error) {
            this.dropRowsOf(invocations)
            throw error
        }
        // Only a created job runs, so a repeat leaves no 'running' row behind.
        this.dropRowsOf(invocations.filter((_, i) => outcomes[i] !== 'created'))
        return invocations.map((invocation, i) => ({ runId: invocation.id, outcome: outcomes[i] }))
    }

    private async insert(runs: Run[]): Promise<CyclotronV2IdempotentOutcome[]> {
        const outcomes: CyclotronV2IdempotentOutcome[] = runs.map(() => 'created')
        const keyed = runs.flatMap((run, i) => (run.claim ? [{ i, fingerprint: run.claim.fingerprint }] : []))
        const keyless = runs.filter((run) => !run.claim).map((run) => run.invocation)
        if (keyless.length > 0) {
            await this.deps.hogflowQueue.queueInvocations(keyless)
        }
        if (keyed.length > 0) {
            const claimed = await this.deps.hogflowQueue.queueInvocationsIdempotently(
                keyed.map(({ i, fingerprint }) => ({ invocation: runs[i].invocation, fingerprint }))
            )
            keyed.forEach(({ i }, k) => (outcomes[i] = claimed[k]))
        }
        return outcomes
    }

    private dropRowsOf(invocations: CyclotronJobInvocationHogFlow[]): void {
        this.deps.invocationResultsRowsService.dropQueuedRowsFor(invocations.map((invocation) => invocation.id))
    }
}
