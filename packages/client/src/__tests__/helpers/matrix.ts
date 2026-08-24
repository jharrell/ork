import { afterAll, beforeAll, describe, it } from 'vitest'

import {
  activeDialects,
  adapters,
  type DialectContext,
  type DialectName,
  type OrkTestClient,
  type TestKysely,
} from './dialects'
import { type SeedData, seedTestData } from './seed'

/**
 * State handed to every corpus case. `client` and `kysely` are the live objects
 * for the dialect currently under test; `seed` is populated only when the corpus
 * was defined with `{ seed: true }`.
 */
export interface CorpusContext {
  dialect: DialectName
  client: OrkTestClient
  kysely: TestKysely
  seed: SeedData | null
}

export interface CorpusCase {
  name: string
  /**
   * Dialects on which this behavior is a known, tracked gap and must be skipped.
   * Reference the tracking issue in a comment; remove the entry when the bugfix
   * lands (alpha.3's DoD: every fix arrives with its corpus case going green).
   */
  skip?: DialectName[]
  run: (ctx: CorpusContext) => Promise<void>
}

export interface CorpusOptions {
  /** Seed the canonical users/profiles/posts (see seed.ts) before the cases run. */
  seed?: boolean
}

/**
 * Register a corpus of Prisma-semantics cases and run each against every active
 * dialect (real PostgreSQL via Testcontainers and in-memory SQLite). This is the
 * mechanical enforcement of alpha.3's "correct or loud" DoD: a behavior asserted
 * here must hold identically on both dialects or be explicitly `skip`ped with a
 * tracking reference.
 */
export function defineCorpus(title: string, options: CorpusOptions, cases: CorpusCase[]): void {
  describe.each(activeDialects())(`${title} [%s]`, (dialect) => {
    let env: DialectContext
    const ctx: CorpusContext = {
      dialect,
      // Assigned in beforeAll, which Vitest runs before any case executes. Cast
      // via unknown so the shared context stays precisely typed for the cases.
      client: undefined as unknown as OrkTestClient,
      kysely: undefined as unknown as TestKysely,
      seed: null,
    }

    beforeAll(async () => {
      env = await adapters[dialect].setup()
      ctx.client = env.client
      ctx.kysely = env.kysely
      if (options.seed) {
        ctx.seed = await seedTestData(env.client)
      }
    })

    afterAll(async () => {
      await env?.cleanup()
    })

    for (const testCase of cases) {
      const register = testCase.skip?.includes(dialect) ? it.skip : it
      register(testCase.name, async () => {
        await testCase.run(ctx)
      })
    }
  })
}
