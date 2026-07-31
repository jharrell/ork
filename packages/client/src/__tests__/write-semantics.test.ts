import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedTestData } from './helpers/seed'
import { setupTestDatabase, type TestEnvironment } from './helpers/test-container'

/**
 * Tests for write-path semantics that used to silently return or store wrong data:
 * affected-row counts, upsert conflict targets, undefined filter values, and BigInt precision.
 */
describe('Write semantics (PostgreSQL)', () => {
  let testEnv: TestEnvironment

  beforeAll(async () => {
    testEnv = await setupTestDatabase()
    await seedTestData(testEnv.kysely)
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  describe('BigInt precision', () => {
    const big = 9007199254740993n

    it('should round-trip a BigInt beyond 2^53 through create, where, and update', async () => {
      const created = await testEnv.client.user.create({
        data: { email: 'bigint-pg@example.com', score: big },
      })

      expect(created.score).toBe(big)

      const found = await testEnv.client.user.findFirst({ where: { score: big } })
      expect(found?.email).toBe('bigint-pg@example.com')

      const updated = await testEnv.client.user.update({
        where: { email: 'bigint-pg@example.com' },
        data: { score: big + 2n },
      })

      expect(updated.score).toBe(big + 2n)
      expect(await testEnv.client.user.count({ where: { score: big } })).toBe(0)
      expect(await testEnv.client.user.count({ where: { score: big + 2n } })).toBe(1)
    })
  })
})
