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

  describe('affected-row counts', () => {
    it('should report the number of rows createMany inserted', async () => {
      expect(await testEnv.client.post.createMany({ data: [] })).toEqual({ count: 0 })

      const author = await testEnv.client.user.create({ data: { email: 'create-many@example.com' } })

      expect(
        await testEnv.client.post.createMany({
          data: [{ title: 'one', authorId: author.id }],
        }),
      ).toEqual({ count: 1 })

      expect(
        await testEnv.client.post.createMany({
          data: [
            { title: 'two', authorId: author.id },
            { title: 'three', authorId: author.id },
            { title: 'four', authorId: author.id },
          ],
        }),
      ).toEqual({ count: 3 })
    })

    it('should report the number of rows updateMany changed', async () => {
      const author = await testEnv.client.user.create({ data: { email: 'update-many@example.com' } })
      await testEnv.client.post.createMany({
        data: [
          { title: 'draft a', authorId: author.id },
          { title: 'draft b', authorId: author.id },
          { title: 'draft c', authorId: author.id },
        ],
      })

      expect(
        await testEnv.client.post.updateMany({
          where: { authorId: author.id, title: 'nothing matches' },
          data: { published: true },
        }),
      ).toEqual({ count: 0 })

      expect(
        await testEnv.client.post.updateMany({
          where: { authorId: author.id, title: 'draft a' },
          data: { published: true },
        }),
      ).toEqual({ count: 1 })

      expect(
        await testEnv.client.post.updateMany({
          where: { authorId: author.id },
          data: { content: 'bulk edit' },
        }),
      ).toEqual({ count: 3 })
    })

    it('should report the number of rows deleteMany removed', async () => {
      const author = await testEnv.client.user.create({ data: { email: 'delete-many@example.com' } })
      await testEnv.client.post.createMany({
        data: [
          { title: 'gone a', authorId: author.id },
          { title: 'gone b', authorId: author.id },
          { title: 'gone c', authorId: author.id },
        ],
      })

      expect(
        await testEnv.client.post.deleteMany({ where: { authorId: author.id, title: 'nothing matches' } }),
      ).toEqual({ count: 0 })

      expect(await testEnv.client.post.deleteMany({ where: { authorId: author.id, title: 'gone a' } })).toEqual({
        count: 1,
      })

      expect(await testEnv.client.post.deleteMany({ where: { authorId: author.id } })).toEqual({ count: 2 })
    })
  })

  describe('upsert', () => {
    it('should create when the unique field does not exist yet', async () => {
      const created = await testEnv.client.user.upsert({
        where: { email: 'upsert-new@example.com' },
        create: { email: 'upsert-new@example.com', name: 'Created' },
        update: { name: 'Updated' },
      })

      expect(created.name).toBe('Created')
      expect(await testEnv.client.user.count({ where: { email: 'upsert-new@example.com' } })).toBe(1)
    })

    it('should update through a non-primary-key unique field', async () => {
      const updated = await testEnv.client.user.upsert({
        where: { email: 'alice@example.com' },
        create: { email: 'alice@example.com', name: 'Should not be created' },
        update: { name: 'Alice Upserted' },
      })

      expect(updated.id).toBe(1)
      expect(updated.name).toBe('Alice Upserted')
      expect(await testEnv.client.user.count({ where: { email: 'alice@example.com' } })).toBe(1)
    })

    it('should update through the primary key', async () => {
      const updated = await testEnv.client.user.upsert({
        where: { id: 2 },
        create: { email: 'never-inserted@example.com' },
        update: { name: 'Bob Upserted' },
      })

      expect(updated.email).toBe('bob@example.com')
      expect(updated.name).toBe('Bob Upserted')
      expect(await testEnv.client.user.count({ where: { email: 'never-inserted@example.com' } })).toBe(0)
    })

    it('should reject a where clause without a unique field', async () => {
      await expect(
        testEnv.client.user.upsert({
          where: {},
          create: { email: 'no-unique@example.com' },
          update: { name: 'nope' },
        }),
      ).rejects.toThrow(/unique field/)
    })
  })

  describe('undefined filter values', () => {
    it('should ignore undefined scalar filters instead of comparing against them', async () => {
      const all = await testEnv.client.user.findMany()
      const withUndefined = await testEnv.client.user.findMany({
        where: { name: undefined, id: undefined, email: undefined },
      })

      expect(withUndefined).toHaveLength(all.length)
    })

    it('should ignore undefined operator values inside a filter object', async () => {
      const users = await testEnv.client.user.findMany({
        where: { email: { equals: 'alice@example.com', contains: undefined, in: undefined } },
      })

      expect(users.map((u) => u.email)).toEqual(['alice@example.com'])
    })

    it('should ignore undefined orderBy directions', async () => {
      const users = await testEnv.client.user.findMany({
        orderBy: { email: undefined, id: 'asc' },
      })

      const ids = users.map((u) => u.id)
      expect(ids.length).toBeGreaterThan(1)
      expect(ids).toEqual([...ids].sort((a, b) => a - b))
    })

    it('should ignore undefined values in relation filters', async () => {
      const baseline = await testEnv.client.user.findMany({
        where: { posts: { some: { published: true } } },
      })
      const withUndefined = await testEnv.client.user.findMany({
        where: { posts: { some: { published: true, title: undefined } } },
      })

      expect(baseline.length).toBeGreaterThan(0)
      expect(withUndefined.map((u) => u.email)).toEqual(baseline.map((u) => u.email))
    })
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
