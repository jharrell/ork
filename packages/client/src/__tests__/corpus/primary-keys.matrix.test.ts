import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

// Corpus for ork-tracker#54 — "@id values silently dropped from
// create()/update() data". The generated client used to strip EVERY @id field
// before insert; now a @default id is optional-not-forbidden: an explicit value
// is honored, an omitted one falls through to the database default.
defineCorpus('primary-key write semantics', { seed: false }, [
  {
    name: 'honors an explicit @id value on create instead of dropping it (#54)',
    run: async ({ client }) => {
      const explicitId = 90210
      const created = await client.user.create({
        data: { id: explicitId, email: 'explicit-id@example.com' },
      })
      expect(created.id).toBe(explicitId)

      const found = await client.user.findUnique({ where: { id: explicitId } })
      expect(found?.email).toBe('explicit-id@example.com')
    },
  },
  {
    name: 'round-trips a String @id on create (#54)',
    run: async ({ client }) => {
      const created = await client.apiKey.create({ data: { id: 'key_abc123', label: 'ci' } })
      expect(created.id).toBe('key_abc123')

      const found = await client.apiKey.findUnique({ where: { id: 'key_abc123' } })
      expect(found?.label).toBe('ci')
    },
  },
  {
    name: 'still autoincrements when no @id value is provided',
    run: async ({ client }) => {
      const created = await client.user.create({ data: { email: 'no-id@example.com' } })
      expect(created.id).toEqual(expect.any(Number))
    },
  },
])
