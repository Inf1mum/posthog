import { HealthCheckResult } from '../../../types'
import { CyclotronJobInvocation, CyclotronJobInvocationResult, CyclotronJobQueueKind } from '../../types'
import { CyclotronV2IdempotentOutcome } from '../cyclotron-v2/types'

export type ConsumeBatchFn = (invocations: CyclotronJobInvocation[]) => Promise<{ backgroundTask: Promise<any> }>

/**
 * Common interface for job queue backends (Kafka, postgres-v2).
 * Each consumer gets the specific implementation it needs — no shared router.
 */
export interface JobQueue {
    startAsProducer(): Promise<void>
    startAsConsumer(queue: CyclotronJobQueueKind, consumeBatch: ConsumeBatchFn): Promise<void>
    stopConsumer(): Promise<void>
    stopProducer(): Promise<void>
    isHealthy(): HealthCheckResult
    queueInvocations(invocations: CyclotronJobInvocation[]): Promise<void>
    queueInvocationResults(results: CyclotronJobInvocationResult[]): Promise<void>
    dequeueInvocations(invocations: CyclotronJobInvocation[]): Promise<void>
    heartbeatInvocations(invocations: CyclotronJobInvocation[]): Promise<void>
    deferInvocations(deferrals: { invocation: CyclotronJobInvocation; scheduledAt: Date }[]): Promise<void>
}

export type IdempotentInvocation = { invocation: CyclotronJobInvocation; fingerprint: string }

/** A queue that can claim an idempotency key in the same transaction as the job it queues. */
export interface IdempotentJobQueue extends JobQueue {
    queueInvocationsIdempotently(entries: IdempotentInvocation[]): Promise<CyclotronV2IdempotentOutcome[]>
    findIdempotencyKey(id: string): Promise<{ fingerprint: string } | null>
}
