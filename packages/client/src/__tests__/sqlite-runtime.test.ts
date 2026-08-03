import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setupSqliteTestDatabase, type SqliteTestEnvironment } from './helpers/sqlite-test-environment'

describe('SQLite client integration', () => {
  let testEnv: SqliteTestEnvironment

  beforeAll(async () => {
    testEnv = await setupSqliteTestDatabase()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('supports basic CRUD operations', async () => {
    const created = await testEnv.client.user.create({
      data: { email: 'sqlite-alice@example.com', name: 'SQLite Alice' },
    })

    const found = await testEnv.client.user.findUnique({
      where: { id: created.id },
    })

    expect(found).toBeDefined()
    expect(found?.email).toBe('sqlite-alice@example.com')

    const updated = await testEnv.client.user.update({
      where: { id: created.id },
      data: { name: 'SQLite Alice Updated' },
    })

    expect(updated.name).toBe('SQLite Alice Updated')

    const deleted = await testEnv.client.user.delete({
      where: { id: created.id },
    })

    expect(deleted.email).toBe('sqlite-alice@example.com')

    const afterDelete = await testEnv.client.user.findUnique({
      where: { id: created.id },
    })

    expect(afterDelete).toBeNull()
  })

  it('reports real affected-row counts for createMany, updateMany and deleteMany', async () => {
    const author = await testEnv.client.user.create({ data: { email: 'sqlite-counts@example.com' } })

    expect(await testEnv.client.post.createMany({ data: [] })).toEqual({ count: 0 })
    expect(await testEnv.client.post.createMany({ data: [{ title: 'one', authorId: author.id }] })).toEqual({
      count: 1,
    })
    expect(
      await testEnv.client.post.createMany({
        data: [
          { title: 'two', authorId: author.id },
          { title: 'three', authorId: author.id },
        ],
      }),
    ).toEqual({ count: 2 })

    expect(
      await testEnv.client.post.updateMany({
        where: { authorId: author.id, title: 'nothing matches' },
        data: { published: true },
      }),
    ).toEqual({ count: 0 })
    expect(
      await testEnv.client.post.updateMany({
        where: { authorId: author.id, title: 'one' },
        data: { published: true },
      }),
    ).toEqual({ count: 1 })
    expect(await testEnv.client.post.updateMany({ where: { authorId: author.id }, data: { content: 'bulk' } })).toEqual(
      { count: 3 },
    )

    expect(await testEnv.client.post.deleteMany({ where: { authorId: author.id, title: 'one' } })).toEqual({
      count: 1,
    })
    expect(await testEnv.client.post.deleteMany({ where: { authorId: author.id } })).toEqual({ count: 2 })
  })

  it('upserts through a non-primary-key unique field', async () => {
    const created = await testEnv.client.user.upsert({
      where: { email: 'sqlite-upsert@example.com' },
      create: { email: 'sqlite-upsert@example.com', name: 'Created' },
      update: { name: 'Updated' },
    })

    expect(created.name).toBe('Created')

    const updated = await testEnv.client.user.upsert({
      where: { email: 'sqlite-upsert@example.com' },
      create: { email: 'sqlite-upsert@example.com', name: 'Created' },
      update: { name: 'Updated' },
    })

    expect(updated.id).toBe(created.id)
    expect(updated.name).toBe('Updated')
    expect(await testEnv.client.user.count({ where: { email: 'sqlite-upsert@example.com' } })).toBe(1)
  })

  it('ignores undefined values in where clauses', async () => {
    await testEnv.client.user.create({ data: { email: 'sqlite-undefined@example.com', name: 'Defined' } })

    const all = await testEnv.client.user.findMany()
    const withUndefined = await testEnv.client.user.findMany({ where: { name: undefined, id: undefined } })

    expect(withUndefined).toHaveLength(all.length)

    const filtered = await testEnv.client.user.findMany({
      where: { email: { equals: 'sqlite-undefined@example.com', contains: undefined } },
    })

    expect(filtered.map((u) => u.name)).toEqual(['Defined'])
  })

  it('matches childless parents for every relation filters', async () => {
    const childless = await testEnv.client.user.create({ data: { email: 'sqlite-childless@example.com' } })

    const users = await testEnv.client.user.findMany({
      where: { posts: { every: { title: 'no post has this title' } } },
    })

    expect(users.map((u) => u.id)).toContain(childless.id)
  })

  it('round-trips a BigInt beyond 2^53 exactly', async () => {
    const big = 9007199254740993n

    const created = await testEnv.client.user.create({
      data: { email: 'sqlite-bigint@example.com', score: big },
    })

    expect(created.score).toBe(big)

    const found = await testEnv.client.user.findFirst({ where: { score: big } })
    expect(found?.email).toBe('sqlite-bigint@example.com')

    const updated = await testEnv.client.user.update({
      where: { email: 'sqlite-bigint@example.com' },
      data: { score: big + 2n },
    })

    expect(updated.score).toBe(big + 2n)
    expect(await testEnv.client.user.count({ where: { score: big } })).toBe(0)
    expect(await testEnv.client.user.count({ where: { score: big + 2n } })).toBe(1)
  })

  it('supports $transaction with commit and rollback behavior', async () => {
    const txResult = await testEnv.client.$transaction(async (txClient: typeof testEnv.client) => {
      const user = await txClient.user.create({
        data: { email: 'sqlite-tx@example.com', name: 'SQLite Tx' },
      })

      const post = await txClient.post.create({
        data: {
          title: 'SQLite Transaction Post',
          content: 'hello',
          published: false,
          authorId: user.id,
        },
      })

      return { user, post }
    })

    const txUser = await testEnv.client.user.findUnique({
      where: { id: txResult.user.id },
    })

    expect(txUser).toBeDefined()

    await expect(
      testEnv.client.$transaction(async (txClient: typeof testEnv.client) => {
        await txClient.user.create({
          data: { email: 'sqlite-rollback@example.com', name: 'SQLite Rollback' },
        })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const rollbackUser = await testEnv.client.user.findUnique({
      where: { email: 'sqlite-rollback@example.com' },
    })

    expect(rollbackUser).toBeNull()
  })
})
