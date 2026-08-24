import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

defineCorpus('scalars, transactions and loud filters', { seed: false }, [
  {
    name: 'round-trips a BigInt beyond 2^53 exactly',
    run: async ({ client }) => {
      const big = 9007199254740993n
      const created = await client.user.create({ data: { email: 'bigint@example.com', score: big } })
      expect(created.score).toBe(big)
      const found = await client.user.findFirst({ where: { score: big } })
      expect(found?.email).toBe('bigint@example.com')
      const updated = await client.user.update({ where: { email: 'bigint@example.com' }, data: { score: big + 2n } })
      expect(updated.score).toBe(big + 2n)
      expect(await client.user.count({ where: { score: big } })).toBe(0)
      expect(await client.user.count({ where: { score: big + 2n } })).toBe(1)
    },
  },
  {
    name: 'accepts an explicit value for a DateTime @default field and defaults only when absent',
    run: async ({ client }) => {
      const explicit = new Date('2020-01-02T03:04:05.000Z')
      const withExplicit = await client.user.create({
        data: { email: 'published-explicit@example.com', publishedAt: explicit },
      })
      expect(withExplicit.publishedAt).toBeInstanceOf(Date)
      expect(withExplicit.publishedAt.toISOString()).toBe('2020-01-02T03:04:05.000Z')
      const withDefault = await client.user.create({ data: { email: 'published-default@example.com' } })
      expect(withDefault.publishedAt).toBeInstanceOf(Date)
      expect(withDefault.publishedAt.getTime()).toBeGreaterThan(0)
    },
  },
  {
    name: 'supports $transaction with commit and rollback behavior',
    run: async ({ client }) => {
      const txResult = await client.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email: 'tx-commit@example.com', name: 'Tx' } })
        const post = await tx.post.create({
          data: { title: 'Tx Post', content: 'hello', published: false, authorId: user.id },
        })
        return { user, post }
      })
      expect(await client.user.findUnique({ where: { id: txResult.user.id } })).not.toBeNull()
      await expect(
        client.$transaction(async (tx) => {
          await tx.user.create({ data: { email: 'tx-rollback@example.com', name: 'Rollback' } })
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')
      expect(await client.user.findUnique({ where: { email: 'tx-rollback@example.com' } })).toBeNull()
    },
  },
  {
    name: 'throws on an unrecognized relation-filter shape instead of matching all rows',
    run: async ({ client }) => {
      await expect(client.user.findMany({ where: { posts: { title: 'no such shape' } } })).rejects.toThrow(
        /Unsupported filter shape for relation "posts"/,
      )
    },
  },
])
