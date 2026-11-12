import { CyclotronV2IdempotentClaim } from '../../../src/cdp/services/cyclotron-v2/types'
import { IdempotentInvocation, IdempotentJobQueue } from '../../../src/cdp/services/job-queue/job-queue.interface'

export function createMockJobQueue(): jest.Mocked<IdempotentJobQueue> {
    // Claims behave as the cyclotron database's do: a key and its job are written together or not at all, a second
    // claim of a key waits until the first one commits or rolls back, and a lookup sees only committed claims.
    const claims = new Map<string, string>()
    const claiming = new Map<string, Promise<void>>()
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
            async (entries: IdempotentInvocation[]): Promise<CyclotronV2IdempotentClaim[]> => {
                const outcomes: CyclotronV2IdempotentClaim[] = []
                for (const { invocation, fingerprint } of entries) {
                    while (claiming.has(invocation.id)) {
                        await claiming.get(invocation.id)
                    }
                    const stored = claims.get(invocation.id)
                    if (stored !== undefined) {
                        outcomes.push({
                            outcome: stored === fingerprint ? 'replayed' : 'mismatch',
                            storedFingerprint: stored,
                        })
                        continue
                    }
                    let settle = (): void => {}
                    claiming.set(invocation.id, new Promise((resolve) => (settle = resolve)))
                    try {
                        await queue.queueInvocations([invocation])
                        claims.set(invocation.id, fingerprint)
                    } finally {
                        claiming.delete(invocation.id)
                        settle()
                    }
                    outcomes.push({ outcome: 'created' })
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
