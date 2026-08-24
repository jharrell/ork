import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

defineCorpus('unique-field lookups', { seed: true }, [
  {
    name: 'finds a row by @id',
    run: async ({ client, seed }) => {
      const alice = seed!.users[0]
      const result = await client.user.findUnique({ where: { id: alice.id } })
      expect(result?.email).toBe(alice.email)
    },
  },
  {
    name: 'finds a row by @unique field',
    run: async ({ client, seed }) => {
      const alice = seed!.users[0]
      const result = await client.user.findUnique({ where: { email: alice.email } })
      expect(result?.id).toBe(alice.id)
    },
  },
  {
    name: 'updates by @id',
    run: async ({ client, seed }) => {
      const bob = seed!.users[1]
      const updated = await client.user.update({ where: { id: bob.id }, data: { name: 'Bob By Id' } })
      expect(updated.name).toBe('Bob By Id')
    },
  },
  {
    name: 'updates by @unique field',
    run: async ({ client, seed }) => {
      const alice = seed!.users[0]
      const updated = await client.user.update({ where: { email: alice.email }, data: { name: 'Alice By Email' } })
      expect(updated.name).toBe('Alice By Email')
    },
  },
  {
    name: 'deletes by @id',
    run: async ({ client }) => {
      const throwaway = await client.user.create({ data: { email: 'lookup-del-id@example.com' } })
      const deleted = await client.user.delete({ where: { id: throwaway.id } })
      expect(deleted.email).toBe('lookup-del-id@example.com')
      expect(await client.user.findUnique({ where: { id: throwaway.id } })).toBeNull()
    },
  },
  {
    name: 'deletes by @unique field',
    run: async ({ client }) => {
      const throwaway = await client.user.create({ data: { email: 'lookup-del-email@example.com' } })
      const deleted = await client.user.delete({ where: { email: 'lookup-del-email@example.com' } })
      expect(deleted.id).toBe(throwaway.id)
      expect(await client.user.findUnique({ where: { email: 'lookup-del-email@example.com' } })).toBeNull()
    },
  },
])
