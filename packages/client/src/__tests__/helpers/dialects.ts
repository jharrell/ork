import { PostgreSqlContainer } from '@testcontainers/postgresql'
import Database from 'better-sqlite3'
import { Dialect, Kysely, PostgresDialect, sql, SqliteDialect } from 'kysely'
import { Pool } from 'pg'

import { createOrkClient as createPostgresClient, type OrkClient } from '../fixtures/generated-test-client'
import { createOrkClient as createSqliteClient } from '../fixtures/generated-test-client-sqlite'

export type DialectName = 'postgresql' | 'sqlite'

/**
 * Kysely over the harness tables. The corpus and seed only ever address these
 * three tables; their column shapes are unvalidated at this boundary (the client
 * under test owns typing), so `unknown` columns are the honest description.
 */
export interface TestDatabase {
  User: Record<string, unknown>
  Profile: Record<string, unknown>
  Post: Record<string, unknown>
  ApiKey: Record<string, unknown>
}
export type TestKysely = Kysely<TestDatabase>

/**
 * The generated Ork client under test. Both dialect fixtures are generated from
 * the SAME `schema.prisma`, so they are structurally identical and one type
 * describes either.
 */
export type OrkTestClient = OrkClient

/**
 * A live conformance environment for one dialect: a real database (a PostgreSQL
 * Testcontainer or an in-memory SQLite), a Kysely instance, the generated Ork
 * client, and the underlying Kysely `Dialect` (needed by suites that build their
 * own clients, e.g. query logging).
 */
export interface DialectContext {
  dialect: DialectName
  kysely: TestKysely
  client: OrkTestClient
  kyselyDialect: Dialect
  cleanup: () => Promise<void>
}

export interface DialectAdapter {
  name: DialectName
  setup: () => Promise<DialectContext>
}

/**
 * The dialects the matrix runs by default. PostgreSQL needs Docker; contributors
 * without a container runtime can set `ORK_SKIP_PG=1` to run the SQLite half
 * only. CI never sets it, so the PostgreSQL side is always enforced there.
 */
export function activeDialects(): DialectName[] {
  return process.env.ORK_SKIP_PG ? ['sqlite'] : ['postgresql', 'sqlite']
}

async function setupPostgres(): Promise<DialectContext> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('ork_test')
    .withUsername('test')
    .withPassword('test')
    .start()

  const pool = new Pool({
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  })

  const kyselyDialect = new PostgresDialect({ pool })
  const kysely = new Kysely<TestDatabase>({ dialect: kyselyDialect })

  await applyPostgresSchema(kysely)

  return {
    dialect: 'postgresql',
    kysely,
    client: createPostgresClient(kyselyDialect),
    kyselyDialect,
    cleanup: async () => {
      await kysely.destroy()
      await container.stop()
    },
  }
}

async function setupSqlite(): Promise<DialectContext> {
  const database = new Database(':memory:')
  const kyselyDialect = new SqliteDialect({ database })
  const kysely = new Kysely<TestDatabase>({ dialect: kyselyDialect })

  await applySqliteSchema(kysely)

  return {
    dialect: 'sqlite',
    kysely,
    client: createSqliteClient(kyselyDialect),
    kyselyDialect,
    cleanup: async () => {
      await kysely.destroy()
      database.close()
    },
  }
}

export const adapters: Record<DialectName, DialectAdapter> = {
  postgresql: { name: 'postgresql', setup: setupPostgres },
  sqlite: { name: 'sqlite', setup: setupSqlite },
}

/**
 * DDL mirroring `schema.prisma` for PostgreSQL. Kept hand-written (rather than
 * driven through the migrate engine) so the client corpus is isolated from
 * migrate's own bugs.
 */
async function applyPostgresSchema(kysely: TestKysely): Promise<void> {
  await sql`
    CREATE TABLE "User" (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      score BIGINT NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "publishedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `.execute(kysely)

  await sql`
    CREATE TABLE "Profile" (
      id SERIAL PRIMARY KEY,
      bio TEXT,
      "userId" INTEGER UNIQUE NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
    )
  `.execute(kysely)

  await sql`
    CREATE TABLE "Post" (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      published BOOLEAN NOT NULL DEFAULT false,
      "authorId" INTEGER NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE CASCADE
    )
  `.execute(kysely)

  await sql`
    CREATE TABLE "ApiKey" (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL
    )
  `.execute(kysely)
}

/**
 * DDL mirroring `schema.prisma` for SQLite. BigInt is stored as TEXT to match the
 * generated client's transforms; DATETIME columns default to CURRENT_TIMESTAMP.
 */
async function applySqliteSchema(kysely: TestKysely): Promise<void> {
  await sql`
    CREATE TABLE "User" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      score TEXT NOT NULL DEFAULT '0',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `.execute(kysely)

  await sql`
    CREATE TABLE "Profile" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bio TEXT,
      "userId" INTEGER UNIQUE NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
    )
  `.execute(kysely)

  await sql`
    CREATE TABLE "Post" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      published BOOLEAN NOT NULL DEFAULT 0,
      "authorId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE CASCADE
    )
  `.execute(kysely)

  await sql`
    CREATE TABLE "ApiKey" (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL
    )
  `.execute(kysely)
}
