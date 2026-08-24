import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

defineCorpus('upsert', { seed: false }, [
  {
    name: 'creates when the unique field does not exist yet',
    run: async ({ client }) => {
      const created = await client.user.upsert({
        where: { email: 'upsert-new@example.com' },
        create: { email: 'upsert-new@example.com', name: 'Created' },
        update: { name: 'Updated' },
      })
      expect(created.name).toBe('Created')
      expect(await client.user.count({ where: { email: 'upsert-new@example.com' } })).toBe(1)
    },
  },
  {
    name: 'updates through a non-primary-key unique field',
    run: async ({ client }) => {
      const seeded = await client.user.create({ data: { email: 'upsert-unique@example.com', name: 'Created' } })
      const updated = await client.user.upsert({
        where: { email: 'upsert-unique@example.com' },
        create: { email: 'upsert-unique@example.com', name: 'Should not be created' },
        update: { name: 'Updated' },
      })
      expect(updated.id).toBe(seeded.id)
      expect(updated.name).toBe('Updated')
      expect(await client.user.count({ where: { email: 'upsert-unique@example.com' } })).toBe(1)
    },
  },
  {
    name: 'updates through the primary key',
    run: async ({ client }) => {
      const seeded = await client.user.create({ data: { email: 'upsert-pk@example.com', name: 'Original' } })
      const updated = await client.user.upsert({
        where: { id: seeded.id },
        create: { email: 'upsert-never@example.com' },
        update: { name: 'By PK' },
      })
      expect(updated.email).toBe('upsert-pk@example.com')
      expect(updated.name).toBe('By PK')
      expect(await client.user.count({ where: { email: 'upsert-never@example.com' } })).toBe(0)
    },
  },
  {
    name: 'rejects a where clause without a unique field',
    run: async ({ client }) => {
      await expect(
        client.user.upsert({ where: {}, create: { email: 'upsert-no-unique@example.com' }, update: { name: 'nope' } }),
      ).rejects.toThrow(/unique field/)
    },
  },
])
