import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

defineCorpus('undefined values in filters', { seed: true }, [
  {
    name: 'ignores undefined scalar filters instead of comparing against them',
    run: async ({ client }) => {
      const all = await client.user.findMany()
      const withUndefined = await client.user.findMany({ where: { name: undefined, id: undefined, email: undefined } })
      expect(withUndefined).toHaveLength(all.length)
    },
  },
  {
    name: 'ignores undefined operator values inside a filter object',
    run: async ({ client, seed }) => {
      const alice = seed!.users[0]
      const users = await client.user.findMany({
        where: { email: { equals: alice.email, contains: undefined, in: undefined } },
      })
      expect(users.map((u) => u.email)).toEqual([alice.email])
    },
  },
  {
    name: 'ignores undefined orderBy directions',
    run: async ({ client }) => {
      const users = await client.user.findMany({ orderBy: { email: undefined, id: 'asc' } })
      const ids = users.map((u) => u.id)
      expect(ids.length).toBeGreaterThan(1)
      expect(ids).toEqual([...ids].sort((a, b) => a - b))
    },
  },
  {
    name: 'ignores undefined values in relation filters',
    run: async ({ client }) => {
      const baseline = await client.user.findMany({ where: { posts: { some: { published: true } } } })
      const withUndefined = await client.user.findMany({
        where: { posts: { some: { published: true, title: undefined } } },
      })
      expect(baseline.length).toBeGreaterThan(0)
      expect(withUndefined.map((u) => u.email)).toEqual(baseline.map((u) => u.email))
    },
  },
])
