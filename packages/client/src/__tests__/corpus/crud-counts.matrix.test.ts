import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

defineCorpus('CRUD and affected-row counts', { seed: false }, [
  {
    name: 'performs a create / findUnique / update / delete round-trip',
    run: async ({ client }) => {
      const created = await client.user.create({ data: { email: 'crud-alice@example.com', name: 'Alice' } })

      const found = await client.user.findUnique({ where: { id: created.id } })
      expect(found?.email).toBe('crud-alice@example.com')

      const updated = await client.user.update({ where: { id: created.id }, data: { name: 'Alice Updated' } })
      expect(updated.name).toBe('Alice Updated')

      const deleted = await client.user.delete({ where: { id: created.id } })
      expect(deleted.email).toBe('crud-alice@example.com')

      expect(await client.user.findUnique({ where: { id: created.id } })).toBeNull()
    },
  },
  {
    name: 'reports real affected-row counts for createMany, updateMany and deleteMany',
    run: async ({ client }) => {
      const author = await client.user.create({ data: { email: 'crud-counts@example.com' } })

      expect(await client.post.createMany({ data: [] })).toEqual({ count: 0 })
      expect(await client.post.createMany({ data: [{ title: 'one', authorId: author.id }] })).toEqual({ count: 1 })
      expect(
        await client.post.createMany({
          data: [
            { title: 'two', authorId: author.id },
            { title: 'three', authorId: author.id },
          ],
        }),
      ).toEqual({ count: 2 })

      expect(
        await client.post.updateMany({
          where: { authorId: author.id, title: 'nothing matches' },
          data: { published: true },
        }),
      ).toEqual({ count: 0 })
      expect(
        await client.post.updateMany({ where: { authorId: author.id, title: 'one' }, data: { published: true } }),
      ).toEqual({ count: 1 })
      expect(await client.post.updateMany({ where: { authorId: author.id }, data: { content: 'bulk' } })).toEqual({
        count: 3,
      })

      expect(await client.post.deleteMany({ where: { authorId: author.id, title: 'one' } })).toEqual({ count: 1 })
      expect(await client.post.deleteMany({ where: { authorId: author.id } })).toEqual({ count: 2 })
    },
  },
])
