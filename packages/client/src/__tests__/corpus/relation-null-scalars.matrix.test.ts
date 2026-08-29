import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

// Regression: `include` must return correct nested objects on both dialects.
// Previously the live include path used `jsonObjectFrom(...selectAll())`, which
// kysely rejects on SQLite, and applied no per-field transforms to nested
// scalars. The flat-LEFT-JOIN path must round-trip nulls and dialect-correct
// types identically to top-level rows — and must not corrupt parent scalars.
defineCorpus('relation null scalars', { seed: true }, [
  {
    name: 'includes a to-one relation and preserves parent + null optional scalars',
    run: async ({ client }) => {
      const users = await client.user.findMany({ include: { profile: true } })
      const bob = users.find((u) => u.email === 'bob@example.com')
      const charlie = users.find((u) => u.email === 'charlie@example.com')

      // Parent scalars must survive the join. Regression: an unqualified
      // selectAll over a LEFT JOIN collides `id` and null-fills it on a miss.
      expect(charlie?.id).toEqual(expect.any(Number))
      expect(bob?.id).toEqual(expect.any(Number))

      // bob has a profile whose bio is null; charlie has no profile at all.
      expect(bob?.profile?.bio).toBeNull()
      expect(bob?.profile?.id).toEqual(expect.any(Number))
      expect(charlie?.profile).toBeNull()
    },
  },
  {
    name: 'reads a to-one relation BigInt column back as bigint without clobbering parent dates',
    run: async ({ client }) => {
      const posts = await client.post.findMany({ include: { author: true } })
      expect(posts.length).toBeGreaterThan(0)
      for (const post of posts) {
        expect(typeof post.author?.score).toBe('bigint')
        expect(post.author?.createdAt).toBeInstanceOf(Date)
        // Parent's own createdAt must not be overwritten by the joined author's.
        expect(post.createdAt).toBeInstanceOf(Date)
        expect(post.id).toEqual(expect.any(Number))
      }
    },
  },
  {
    name: 'orders by a parent column while including a to-one relation',
    run: async ({ client }) => {
      // Regression: unqualified orderBy ref is ambiguous once a join is present.
      const posts = await client.post.findMany({
        include: { author: true },
        orderBy: { createdAt: 'asc' },
      })
      expect(posts.length).toBeGreaterThan(0)
    },
  },
  {
    name: 'includes a to-many relation as an array with transformed scalars',
    run: async ({ client }) => {
      const users = await client.user.findMany({ include: { posts: true } })
      const alice = users.find((u) => u.email === 'alice@example.com')
      const charlie = users.find((u) => u.email === 'charlie@example.com')

      expect(alice?.posts).toHaveLength(3)
      expect(charlie?.posts).toEqual([])
      for (const post of alice?.posts ?? []) {
        expect(typeof post.published).toBe('boolean')
        expect(post.createdAt).toBeInstanceOf(Date)
      }
    },
  },
])
