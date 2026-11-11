import { createMockJobQueue } from '~/tests/helpers/mocks/job-queue.mock'

import { HOG_INVOCATION_RESULTS_OUTPUT } from '~/common/outputs'
import { createRecordingIngestionOutputs } from '~/tests/helpers/recording-ingestion-outputs'

import { FixtureHogFlowBuilder } from '../_tests/builders/hogflow.builder'
import { createExampleHogFlowInvocation } from '../_tests/fixtures-hogflows'
import {
    HogInvocationResultsService,
    HogInvocationResultsServiceOutput,
} from '../services/monitoring/hog-invocation-results.service'
import { Run, RunIntake, keyedRunId } from './run-intake'

describe('RunIntake', () => {
    it('keeps the running row of a created run when a repeat of its key replays on the same pod', async () => {
        const kafka = createRecordingIngestionOutputs<HogInvocationResultsServiceOutput>([
            HOG_INVOCATION_RESULTS_OUTPUT,
        ])
        const rows = new HogInvocationResultsService(kafka.outputs, { HOG_INVOCATION_RESULTS_ENABLED: true })
        const intake = new RunIntake({ hogflowQueue: createMockJobQueue(), invocationResultsRowsService: rows })
        const hogFlow = new FixtureHogFlowBuilder().withTeamId(1).withSimpleWorkflow().build()
        const runId = keyedRunId(1, 'transactional-email', 'password-reset-1')
        const keyedRun = (): Run => {
            const invocation = createExampleHogFlowInvocation(hogFlow)
            invocation.id = runId
            return { invocation, claim: { fingerprint: 'same-request' } }
        }

        const [first] = await intake.launch([keyedRun()], { wait: 'committed' })
        const [repeat] = await intake.launch([keyedRun()], { wait: 'committed' })
        await rows.flush()

        expect([first.outcome, repeat.outcome]).toEqual(['created', 'replayed'])
        expect(kafka.produced(HOG_INVOCATION_RESULTS_OUTPUT)).toEqual([
            expect.objectContaining({ invocation_id: runId, status: 'running' }),
        ])
    })
})
