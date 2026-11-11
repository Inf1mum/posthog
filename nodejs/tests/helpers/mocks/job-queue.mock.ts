import { CyclotronV2IdempotentOutcome } from '../../../src/cdp/services/cyclotron-v2/types'
import { IdempotentInvocation, IdempotentJobQueue } from '../../../src/cdp/services/job-queue/job-queue.interface'

export function createMockJobQueue(): jest.Mocked<IdempotentJobQueue> {
    // Claims behave as the cyclotron database's do: a key and its job are written together or not at all, and a
    // lookup sees only claims whose job write finished.
    const claims = new Map<string, string>()
    const claiming = new Map<string, string>()
    const queue = {
        queueInvocations: jest.fn().mockResolvedValue(undefined),
        queueInvocationResults: jest.fn().mockResolvedValue(undefined),
        startAsProducer: jest.fn().mockResolvedValue(undefined),
        startAsConsumer: jest.fn().mockResolvedValue(undefined),
        stopConsumer: jest.fn().mockResolvedValue(undefined),
        stopProducer: jest.fn().mockResolvedValue(undefined),
        isHealthy: jest.fn(),
        dequeueInvocations: jest.fn().mockResolvedValue(undefined),
        cancelInvocations: jest.fn().mockResolvedValue(undefined),
        heartbeatInvocations: jest.fn().mockResolvedValue(undefined),
        deferInvocations: jest.fn().mockResolvedValue(undefined),
        queueInvocationsIdempotently: jest.fn(
            async (entries: IdempotentInvocation[]): Promise<CyclotronV2IdempotentOutcome[]> => {
                const outcomes: CyclotronV2IdempotentOutcome[] = []
                for (const { invocation, fingerprint } of entries) {
                    const stored = claims.get(invocation.id) ?? claiming.get(invocation.id)
                    if (stored !== undefined) {
                        outcomes.push(stored === fingerprint ? 'replayed' : 'mismatch')
                        continue
                    }
                    claiming.set(invocation.id, fingerprint)
                    try {
                        await queue.queueInvocations([invocation])
                        claims.set(invocation.id, fingerprint)
                    } finally {
                        claiming.delete(invocation.id)
                    }
                    outcomes.push('created')
                }
                return outcomes
            }
        ),
        findIdempotencyKey: jest.fn((id: string) => {
            const fingerprint = claims.get(id)
            return Promise.resolve(fingerprint === undefined ? null : { fingerprint })
        }),
    }
    return queue as jest.Mocked<IdempotentJobQueue>
}
