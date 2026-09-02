/**
 * Each case is tagged with the id it enforces; the ratchet at the bottom asserts set
 * equality with the runtime-enforced half of `UNSUPPORTED_FEATURES`.
 *
 * Cases assert error identity and `error.feature`, never the full message — the
 * registry owns the wording. The `@ts-expect-error` directives are load-bearing: each
 * case proves the compiler and the runtime both reject the input, so the offending
 * expression stays on one line where TypeScript pins the error.
 */

// `OrkNotImplementedError` comes from the built package because that is the exact
// class the generated fixtures throw (identity matters for `instanceof`). The
// registry itself is read from source, so the ratchet below is authoritative even
// when `dist/` is stale.
import { OrkNotImplementedError } from '@ork-orm/client'
import { describe, expect, it } from 'vitest'

import { UNSUPPORTED_FEATURES, type UnsupportedFeatureId } from '../../unsupported.js'
import { type CorpusCase, defineCorpus } from '../helpers/matrix'

type UnsupportedCase = CorpusCase & {
  /** The registry entry this case enforces. Feeds the completeness ratchet below. */
  feature: UnsupportedFeatureId
}

/**
 * Await a rejection and assert it is Ork's not-implemented error for `feature`.
 * `messageMatch` is for the dynamic detail only (never the whole message).
 */
async function expectNotImplemented(
  promise: Promise<unknown>,
  feature: UnsupportedFeatureId,
  messageMatch?: RegExp,
): Promise<void> {
  let caught: unknown
  let resolved = false
  try {
    await promise
    resolved = true
  } catch (error) {
    caught = error
  }

  expect(resolved, `expected the call to reject with OrkNotImplementedError('${feature}'), but it resolved`).toBe(false)
  expect(caught, `expected OrkNotImplementedError('${feature}'), got: ${String(caught)}`).toBeInstanceOf(
    OrkNotImplementedError,
  )

  const error = caught as OrkNotImplementedError
  expect(error.name).toBe('OrkNotImplementedError')
  expect(error.feature).toBe(feature)
  if (messageMatch) {
    expect(error.message).toMatch(messageMatch)
  }
}

const CASES: UnsupportedCase[] = [
  {
    feature: 'select',
    name: 'rejects select on findMany, findUnique, and findFirst',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `select` is deliberately absent from the generated arg types
        client.user.findMany({ select: { id: true } }),
        'select',
      )
      await expectNotImplemented(
        // @ts-expect-error - `select` is deliberately absent from the generated arg types
        client.user.findUnique({ where: { email: 'alice@example.com' }, select: { id: true } }),
        'select',
      )
      await expectNotImplemented(
        // @ts-expect-error - `select` is deliberately absent from the generated arg types
        client.user.findFirst({ select: { id: true } }),
        'select',
      )
    },
  },
  {
    feature: 'select',
    name: 'rejects select on write methods and count',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `select` is deliberately absent from the generated arg types
        client.user.create({ data: { email: 'select-on-create@example.com' }, select: { id: true } }),
        'select',
      )
      await expectNotImplemented(
        // @ts-expect-error - `select` is deliberately absent from the generated arg types
        client.user.count({ select: { id: true } }),
        'select',
      )
    },
  },
  {
    feature: 'select',
    name: 'ignores select: undefined without throwing',
    run: async ({ client }) => {
      // @ts-expect-error - `select` is deliberately absent from the generated arg types
      const users = await client.user.findMany({ select: undefined })
      expect(users.length).toBeGreaterThan(0)
      // @ts-expect-error - `select` is deliberately absent from the generated arg types
      const first = await client.user.findFirst({ select: undefined })
      expect(first).not.toBeNull()
      // @ts-expect-error - `select` is deliberately absent from the generated arg types
      const unique = await client.user.findUnique({ where: { email: 'alice@example.com' }, select: undefined })
      expect(unique).not.toBeNull()
    },
  },
  {
    feature: 'nested-include',
    name: 'rejects object-form include on a read method',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - the generated include type admits boolean relation flags only
        client.user.findMany({ include: { posts: { where: { published: true } } } }),
        'nested-include',
        /relation "posts"/,
      )
    },
  },
  {
    feature: 'include-unavailable',
    name: 'rejects include on a write method that cannot honour it',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `include` is deliberately absent from the generated write arg types
        client.user.create({ data: { email: 'include-on-create@example.com' }, include: { posts: true } }),
        'include-unavailable',
        /User\.create/,
      )
    },
  },
  {
    feature: 'nested-write',
    name: 'rejects nested writes in create',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - relation keys are deliberately absent from the generated create input
        client.user.create({ data: { email: 'nested-create@example.com', posts: { create: [{ title: 'x' }] } } }),
        'nested-write',
        /relation "posts" in User\.create/,
      )
    },
  },
  {
    feature: 'nested-write',
    name: 'rejects nested writes in update',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - relation keys are deliberately absent from the generated update input
        client.user.update({ where: { email: 'alice@example.com' }, data: { profile: { connect: { id: 1 } } } }),
        'nested-write',
        /relation "profile" in User\.update/,
      )
    },
  },
  {
    feature: 'nested-write',
    name: 'rejects nested writes in both halves of upsert',
    run: async ({ client }) => {
      await expectNotImplemented(
        client.user.upsert({
          where: { email: 'alice@example.com' },
          // @ts-expect-error - relation keys are deliberately absent from the generated create input
          create: { email: 'alice@example.com', posts: { create: [{ title: 'x' }] } },
          update: {},
        }),
        'nested-write',
        /relation "posts" in User\.create/,
      )
      await expectNotImplemented(
        client.user.upsert({
          where: { email: 'alice@example.com' },
          create: { email: 'alice@example.com' },
          // @ts-expect-error - relation keys are deliberately absent from the generated update input
          update: { posts: { create: [{ title: 'x' }] } },
        }),
        'nested-write',
        /relation "posts" in User\.update/,
      )
    },
  },
  {
    feature: 'cursor-pagination',
    name: 'rejects cursor pagination on findMany',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error -- ``cursor`` is deliberately absent from the generated arg types
        client.user.findMany({ cursor: { id: 1 } }),
        'cursor-pagination',
      )
    },
  },
  {
    feature: 'cursor-pagination',
    name: 'rejects cursor pagination on findFirst',
    run: async ({ client }) => {
      await expectNotImplemented(
        //// @ts-expect-error - `cursor` is deliberately absent from the generated arg types
        client.user.findFirst({ cursor: { id: 1 } }),
        'cursor-pagination',
      )
    },
  },
  {
    feature: 'distinct',
    name: 'rejects distinct on findMany',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `distinct` is deliberately absent from the generated arg types
        client.user.findMany({ distinct: ['email'] }),
        'distinct',
      )
    },
  },
  {
    feature: 'distinct',
    name: 'rejects distinct on findFirst',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `distinct` is deliberately absent from the generated arg types
        client.user.findFirst({ distinct: ['email'] }),
        'distinct',
      )
    },
  },
  {
    feature: 'skip-duplicates',
    name: 'rejects skipDuplicates: true in createMany',
    run: async ({ client }) => {
      await expectNotImplemented(
        client.user.createMany({
          data: [{ email: 'skip-duplicates-true@example.com' }],
          // @ts-expect-error - `skipDuplicates` is deliberately absent from the generated createMany args
          skipDuplicates: true,
        }),
        'skip-duplicates',
      )
    },
  },
  {
    feature: 'skip-duplicates',
    name: 'ignores skipDuplicates: false without throwing',
    run: async ({ client }) => {
      const result = await client.user.createMany({
        data: [{ email: 'skip-duplicates-false@example.com' }],
        // @ts-expect-error - `skipDuplicates` is deliberately absent from the generated createMany args
        skipDuplicates: false,
      })
      expect(result).toEqual({ count: 1 })
    },
  },
  {
    feature: 'case-insensitive-mode',
    name: 'rejects mode: "insensitive" in a top-level string filter',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `mode` is deliberately absent from the generated string filters
        client.user.findMany({ where: { email: { contains: 'alice', mode: 'insensitive' } } }),
        'case-insensitive-mode',
        /on field "email"/,
      )
    },
  },
  {
    feature: 'case-insensitive-mode',
    name: 'rejects mode: "insensitive" nested under AND, OR, and NOT',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `mode` is deliberately absent from the generated string filters
        client.user.findMany({ where: { AND: [{ email: { contains: 'alice', mode: 'insensitive' } }] } }),
        'case-insensitive-mode',
        /on field "email"/,
      )
      await expectNotImplemented(
        // @ts-expect-error - `mode` is deliberately absent from the generated string filters
        client.user.findMany({ where: { OR: [{ name: { contains: 'alice', mode: 'insensitive' } }] } }),
        'case-insensitive-mode',
        /on field "name"/,
      )
      await expectNotImplemented(
        // @ts-expect-error - `mode` is deliberately absent from the generated string filters
        client.user.findMany({ where: { NOT: [{ email: { contains: 'alice', mode: 'insensitive' } }] } }),
        'case-insensitive-mode',
        /on field "email"/,
      )
    },
  },
  {
    feature: 'filter-operator',
    name: 'rejects an unknown filter operator',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `search` is not a supported filter operator
        client.user.findMany({ where: { email: { search: 'alice' } } }),
        'filter-operator',
        /'search' on field "email"/,
      )
    },
  },
  {
    feature: 'filter-operator',
    name: 'rejects a typo of a supported filter operator instead of matching everything',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `startsWiths` is a typo of `startsWith`, not an operator
        client.user.findMany({ where: { email: { startsWiths: 'alice' } } }),
        'filter-operator',
        /'startsWiths' on field "email"/,
      )
    },
  },
  {
    feature: 'filter-operator',
    name: 'rejects Prisma\'s nested "not" filter-object form',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - `not` does not admit a nested filter object
        client.user.findMany({ where: { email: { not: { contains: 'alice' } } } }),
        'filter-operator',
        /'not' with a nested filter object on field "email"/,
      )
    },
  },
  {
    feature: 'filter-operator',
    name: 'accepts and ignores mode: "default", which is Prisma\'s default casing mode',
    run: async ({ client }) => {
      const baseline = await client.user.findMany({ where: { email: { contains: 'alice' } } })
      expect(baseline.length).toBeGreaterThan(0)
      // @ts-expect-error - `mode` is deliberately absent from the generated string filters
      const withMode = await client.user.findMany({ where: { email: { contains: 'alice', mode: 'default' } } })
      expect(withMode.map((user) => user.email)).toEqual(baseline.map((user) => user.email))
    },
  },
  {
    feature: 'relation-filter-shape',
    name: 'rejects a list-relation filter without some, every, or none',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - list relation filters admit some/every/none only
        client.user.findMany({ where: { posts: { where: { published: true } } } }),
        'relation-filter-shape',
        /on relation "posts"/,
      )
    },
  },
  {
    feature: 'relation-filter-shape',
    name: 'rejects a single-relation filter without is or isNot',
    run: async ({ client }) => {
      await expectNotImplemented(
        // @ts-expect-error - single relation filters admit is/isNot only
        client.user.findMany({ where: { profile: { bio: 'Software developer from San Francisco' } } }),
        'relation-filter-shape',
        /on relation "profile"/,
      )
    },
  },
  {
    feature: 'raw-queries',
    name: 'does not expose $queryRaw or $executeRaw on the client',
    run: async ({ client }) => {
      expect('$queryRaw' in client).toBe(false)
      expect('$executeRaw' in client).toBe(false)
    },
  },
  {
    feature: 'aggregate',
    name: 'does not expose aggregate on a model delegate',
    run: async ({ client }) => {
      expect('aggregate' in client.user).toBe(false)
    },
  },
  {
    feature: 'group-by',
    name: 'does not expose groupBy on a model delegate',
    run: async ({ client }) => {
      expect('groupBy' in client.user).toBe(false)
    },
  },
]

defineCorpus('unsupported inputs', { seed: true }, CASES)

describe('unsupported-input coverage ratchet', () => {
  it('covers exactly the runtime-enforced entries of UNSUPPORTED_FEATURES', () => {
    const enforcedHere = UNSUPPORTED_FEATURES.filter(
      (feature) => feature.enforcement === 'runtime-throw' || feature.enforcement === 'api-absent',
    ).map((feature) => feature.id)
    const covered = [...new Set(CASES.map((testCase) => testCase.feature))]

    const missing = enforcedHere.filter((id) => !covered.includes(id))
    const orphaned = covered.filter((id) => !enforcedHere.includes(id))

    const guidance = [
      'This corpus must cover the runtime-enforced half of UNSUPPORTED_FEATURES exactly.',
      missing.length > 0
        ? `Not enforced by any case: ${missing.join(', ')}. Add a case to CASES in this file tagged with that id ` +
          'and provoke the throw (or, if the feature now works, drop its entry from UNSUPPORTED_FEATURES in ' +
          'packages/client/src/unsupported.ts).'
        : '',
      orphaned.length > 0
        ? `Tagged by a case but not runtime-enforced in the registry: ${orphaned.join(', ')}. Either the feature ` +
          'shipped (delete the case) or the id was renamed or re-classified (update the tag, and note that ' +
          "'generation-error' ids belong in unsupported-schema.test.ts instead)."
        : '',
    ]
      .filter(Boolean)
      .join('\n')

    expect({ missing, orphaned }, guidance).toEqual({ missing: [], orphaned: [] })
  })
})
