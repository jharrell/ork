import { expect } from 'vitest'

import { defineCorpus } from '../helpers/matrix'

// Corpus for ork-tracker#72 — "SQLite BigInt stored as TEXT: gt/lt/orderBy
// compare lexicographically". SQLite has no native BigInt, so the client stores
// it as TEXT; without a CAST, range filters and orderBy compare strings
// ('9' > '10') and silently return wrong rows/order. The generated client now
// wraps BigInt column refs in `cast(... as integer)` for comparisons — the
// template comes from the field-translator (`generateComparisonReference`).
defineCorpus('BigInt range filters and ordering', { seed: false }, [
  {
    name: 'orderBy on a BigInt column sorts numerically, not lexicographically (#72)',
    run: async ({ client }) => {
      await client.user.create({ data: { email: 'ord-2@example.com', name: 'ord', score: 2n } })
      await client.user.create({ data: { email: 'ord-100@example.com', name: 'ord', score: 100n } })
      await client.user.create({ data: { email: 'ord-10@example.com', name: 'ord', score: 10n } })

      const rows = await client.user.findMany({ where: { name: 'ord' }, orderBy: { score: 'asc' } })
      // Lexicographic order would be 10, 100, 2; numeric order is 2, 10, 100.
      expect(rows.map((r) => r.score)).toEqual([2n, 10n, 100n])
    },
  },
  {
    name: 'gt/lt on a BigInt column filter numerically, not lexicographically (#72)',
    run: async ({ client }) => {
      await client.user.create({ data: { email: 'rng-9@example.com', name: 'rng', score: 9n } })
      await client.user.create({ data: { email: 'rng-10@example.com', name: 'rng', score: 10n } })
      await client.user.create({ data: { email: 'rng-90@example.com', name: 'rng', score: 90n } })

      // gt 9 is numerically {10, 90}; lexicographically '10' < '9', so the bug drops 10.
      const gt = await client.user.findMany({ where: { name: 'rng', score: { gt: 9n } } })
      expect(gt.map((r) => r.score).sort((a, b) => Number(a - b))).toEqual([10n, 90n])

      // lt 10 is numerically {9}; lexicographically '9' > '10', so the bug drops 9.
      const lt = await client.user.findMany({ where: { name: 'rng', score: { lt: 10n } } })
      expect(lt.map((r) => r.score)).toEqual([9n])
    },
  },
])
