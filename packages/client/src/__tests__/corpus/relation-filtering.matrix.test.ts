import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

defineCorpus('relation filtering', { seed: true }, [
  {
    name: 'filters users with some published posts',
    run: async ({ client }) => {
      const users = await client.user.findMany({ where: { posts: { some: { published: true } } } })
      expect(users).toHaveLength(2)
      expect(users.map((u) => u.email)).toEqual(expect.arrayContaining(['alice@example.com', 'bob@example.com']))
    },
  },
  {
    name: 'filters users where every post is published',
    run: async ({ client }) => {
      const users = await client.user.findMany({ where: { posts: { every: { published: true } } } })
      expect(users.map((u) => u.email).sort()).toEqual(['bob@example.com', 'charlie@example.com'])
    },
  },
  {
    name: 'matches childless parents for every, even with an impossible condition',
    run: async ({ client }) => {
      const users = await client.user.findMany({ where: { posts: { every: { title: 'no post has this title' } } } })
      expect(users.map((u) => u.email)).toEqual(['charlie@example.com'])
    },
  },
  {
    name: 'filters users with no published posts',
    run: async ({ client }) => {
      const users = await client.user.findMany({ where: { posts: { none: { published: true } } } })
      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('charlie@example.com')
    },
  },
  {
    name: 'handles complex nested conditions in some',
    run: async ({ client }) => {
      const users = await client.user.findMany({
        where: { posts: { some: { AND: [{ published: true }, { title: { contains: 'TypeScript' } }] } } },
      })
      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('alice@example.com')
    },
  },
  {
    name: 'filters users with a profile matching a condition',
    run: async ({ client }) => {
      const users = await client.user.findMany({ where: { profile: { is: { bio: { contains: 'developer' } } } } })
      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('alice@example.com')
    },
  },
  {
    name: 'filters users with a profile not matching a condition',
    run: async ({ client }) => {
      const users = await client.user.findMany({ where: { profile: { isNot: { bio: { contains: 'developer' } } } } })
      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('bob@example.com')
    },
  },
  {
    name: 'filters users with a null profile',
    run: async ({ client }) => {
      const users = await client.user.findMany({ where: { profile: { is: null } } })
      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('charlie@example.com')
    },
  },
  {
    name: 'combines relation and scalar filters using AND',
    run: async ({ client }) => {
      const users = await client.user.findMany({
        where: { AND: [{ email: { endsWith: '@example.com' } }, { posts: { some: { published: true } } }] },
      })
      expect(users).toHaveLength(2)
    },
  },
  {
    name: 'combines relation and scalar filters using OR',
    run: async ({ client }) => {
      const users = await client.user.findMany({
        where: { OR: [{ name: null }, { posts: { some: { title: { contains: 'Prisma' } } } }] },
      })
      expect(users).toHaveLength(2)
      const emails = users.map((u) => u.email)
      expect(emails).toContain('alice@example.com')
      expect(emails).toContain('charlie@example.com')
    },
  },
])
