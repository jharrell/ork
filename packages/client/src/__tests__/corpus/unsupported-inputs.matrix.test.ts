import { OrkNotImplementedError } from '@ork-orm/client'
import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

defineCorpus('unimplemented inputs and negative tests', { seed: true }, [
  {
    name: 'throws OrkNotImplementedError on select in findMany',
    run: async ({ client }) => {
      // @ts-expect-error - select is not in the type definition yet
      await expect(client.user.findMany({ select: { id: true } })).rejects.toThrow(OrkNotImplementedError)
      // @ts-expect-error - select is not in the type definition yet
      await expect(client.user.findMany({ select: { id: true } })).rejects.toThrow(
        /The 'select' option is not yet supported in Ork alpha/,
      )
    },
  },
  {
    name: 'throws OrkNotImplementedError on select in findUnique',
    run: async ({ client }) => {
      // @ts-expect-error - select is not in the type definition yet
      await expect(client.user.findUnique({ where: { id: 1 }, select: { id: true } })).rejects.toThrow(
        OrkNotImplementedError,
      )
      // @ts-expect-error - select is not in the type definition yet
      await expect(client.user.findUnique({ where: { id: 1 }, select: { id: true } })).rejects.toThrow(
        /The 'select' option is not yet supported in Ork alpha/,
      )
    },
  },
  {
    name: 'throws OrkNotImplementedError on select in findFirst',
    run: async ({ client }) => {
      // @ts-expect-error - select is not in the type definition yet
      await expect(client.user.findFirst({ select: { id: true } })).rejects.toThrow(OrkNotImplementedError)
      // @ts-expect-error - select is not in the type definition yet
      await expect(client.user.findFirst({ select: { id: true } })).rejects.toThrow(
        /The 'select' option is not yet supported in Ork alpha/,
      )
    },
  },
  {
    name: 'ignores select: undefined without throwing',
    run: async ({ client }) => {
      // @ts-expect-error - select is not in the type definition yet
      const users = await client.user.findMany({ select: undefined })
      expect(users.length).toBeGreaterThan(0)
      // @ts-expect-error - select is not in the type definition yet
      const user = await client.user.findFirst({ select: undefined })
      expect(user).not.toBeNull()
      // @ts-expect-error - select is not in the type definition yet
      const unique = await client.user.findUnique({ where: { id: 1 }, select: undefined })
      expect(unique).not.toBeNull()
    },
  },
  {
    name: 'throws OrkNotImplementedError on object-form include with arguments (e.g. where/select)',
    run: async ({ client }) => {
      // @ts-expect-error - object form include is not yet supported
      await expect(client.user.findMany({ include: { posts: { where: { published: true } } } })).rejects.toThrow(
        OrkNotImplementedError,
      )
      // @ts-expect-error - object form include is not yet supported
      await expect(client.user.findMany({ include: { posts: { where: { published: true } } } })).rejects.toThrow(
        /Nested include options for relation "posts" is not yet supported in Ork alpha/,
      )
    },
  },
  {
    name: 'throws OrkNotImplementedError on nested writes in create',
    run: async ({ client }) => {
      await expect(
        client.user.create({
          // @ts-expect-error - nested create is not yet supported
          data: { email: 'nested-write@example.com', posts: { create: [{ title: 'Nested' }] } },
        }),
      ).rejects.toThrow(OrkNotImplementedError)
      await expect(
        client.user.create({
          // @ts-expect-error - nested create is not yet supported
          data: { email: 'nested-write-2@example.com', posts: { create: [{ title: 'Nested' }] } },
        }),
      ).rejects.toThrow(/Nested write on relation "posts" in User\.create is not yet supported in Ork alpha/)
    },
  },
  {
    name: 'throws OrkNotImplementedError on nested writes in update',
    run: async ({ client }) => {
      await expect(
        client.user.update({
          where: { email: 'alice@example.com' },
          // @ts-expect-error - nested connect is not yet supported
          data: { profile: { connect: { id: 1 } } },
        }),
      ).rejects.toThrow(OrkNotImplementedError)
      await expect(
        client.user.update({
          where: { email: 'alice@example.com' },
          // @ts-expect-error - nested connect is not yet supported
          data: { profile: { connect: { id: 1 } } },
        }),
      ).rejects.toThrow(/Nested write on relation "profile" in User\.update is not yet supported in Ork alpha/)
    },
  },
  {
    name: 'throws OrkNotImplementedError on nested writes in upsert',
    run: async ({ client }) => {
      await expect(
        client.user.upsert({
          where: { email: 'alice@example.com' },
          create: { email: 'alice@example.com' },
          // @ts-expect-error - nested write in update is not yet supported
          update: { posts: { create: [{ title: 'Upsert Post' }] } },
        }),
      ).rejects.toThrow(OrkNotImplementedError)
      await expect(
        client.user.upsert({
          where: { email: 'alice@example.com' },
          // @ts-expect-error - nested write in create is not yet supported
          create: { email: 'alice@example.com', posts: { create: [{ title: 'Upsert Post' }] } },
          update: {},
        }),
      ).rejects.toThrow(OrkNotImplementedError)
    },
  },
  {
    name: 'throws OrkNotImplementedError on mode: "insensitive" in string filters',
    run: async ({ client }) => {
      await expect(
        // @ts-expect-error - mode insensitive is not supported
        client.user.findMany({ where: { email: { contains: 'alice', mode: 'insensitive' } } }),
      ).rejects.toThrow(OrkNotImplementedError)
      await expect(
        // @ts-expect-error - mode insensitive is not supported
        client.user.findMany({ where: { email: { contains: 'alice', mode: 'insensitive' } } }),
      ).rejects.toThrow(
        /Case-insensitive filter \(mode: "insensitive"\) on field "email" is not yet supported in Ork alpha/,
      )
    },
  },
  {
    name: 'throws OrkNotImplementedError on cursor-based pagination',
    run: async ({ client }) => {
      // @ts-expect-error - cursor pagination is not yet supported
      await expect(client.user.findMany({ cursor: { id: 1 } })).rejects.toThrow(OrkNotImplementedError)
      // @ts-expect-error - cursor pagination is not yet supported
      await expect(client.user.findMany({ cursor: { id: 1 } })).rejects.toThrow(
        /Cursor-based pagination \('cursor'\) is not yet supported in Ork alpha/,
      )
    },
  },
  {
    name: 'throws OrkNotImplementedError on distinct in findMany and findFirst',
    run: async ({ client }) => {
      // @ts-expect-error - distinct is not yet supported
      await expect(client.user.findMany({ distinct: ['email'] })).rejects.toThrow(OrkNotImplementedError)
      // @ts-expect-error - distinct is not yet supported
      await expect(client.user.findMany({ distinct: ['email'] })).rejects.toThrow(
        /Distinct queries \('distinct'\) is not yet supported in Ork alpha/,
      )
      // @ts-expect-error - distinct is not yet supported
      await expect(client.user.findFirst({ distinct: ['email'] })).rejects.toThrow(OrkNotImplementedError)
    },
  },
  {
    name: 'throws OrkNotImplementedError on skipDuplicates: true in createMany',
    run: async ({ client }) => {
      await expect(
        client.user.createMany({
          data: [{ email: 'skip-dup@example.com' }],
          skipDuplicates: true,
        }),
      ).rejects.toThrow(OrkNotImplementedError)
      await expect(
        client.user.createMany({
          data: [{ email: 'skip-dup@example.com' }],
          skipDuplicates: true,
        }),
      ).rejects.toThrow(/The 'skipDuplicates' option in createMany is not yet supported in Ork alpha/)
    },
  },
  {
    name: 'verifies phantom raw methods $queryRaw and $executeRaw do not exist on client instance',
    run: async ({ client }) => {
      expect('$queryRaw' in client).toBe(false)
      expect('$executeRaw' in client).toBe(false)
    },
  },
])
