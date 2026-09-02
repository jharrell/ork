# Ork

[![CI](https://github.com/jharrell/ork/actions/workflows/ci.yml/badge.svg)](https://github.com/jharrell/ork/actions/workflows/ci.yml)

Ork is a TypeScript-native, Prisma-like ORM built on the [Kysely](https://kysely.dev) query builder.

> [!CAUTION]
> Ork is **early alpha** software. It is not ready for production use, and plenty of
> Prisma features are missing or incomplete — the [status table](#status) below is the
> honest map of what works today. If you try it anyway: thank you! Bug reports and
> feedback are very welcome.

## Vision

Ork wants to be your ORM du jour. We want to get there by offering the following:

1. A way to define your database schema in a clear and concise way.
2. A way to generate a fully-typed, high-level client SDK so you can work with your data quickly and easily.
3. A way to seamlessly migrate from one database schema to another.

How we get there is with the following tools:

1. The Prisma schema language you already know, with plans for a superset that adds constraints, views, procedures, and more.
2. A generated client that combines a Prisma-style API with the ability to use Kysely queries directly.
3. A migration engine that generates reasonable up and down migrations for a given schema change.
4. The ability to do any or all of the above a la carte via development plugins, TypeScript functions, and a CLI.

## Relationship to Prisma

Ork is **not** affiliated with Prisma, and it is not a code fork: it is a from-scratch
TypeScript reimplementation of the Prisma developer experience — the `.prisma` schema
language and the client API shape — with query execution delegated to Kysely. There are
no Rust engines, no WASM binaries, and no hidden layers: what the generator emits is
plain TypeScript you can read and debug.

## Strategic Pillars

While right now Ork is a dinky one-man show, we have a clear vision of a mature, community-managed project. Here are some of the tenets we want to stand by:

- Whenever possible, a project using Prisma could switch to Ork with minimal code churn.
- Ork is a TypeScript project, from top to bottom.
- Ork should get out of your way and integrate with modern tooling and workflows.
- Ork should consider and prioritize community-driven contributions.
- Ork is developed with heavy AI assistance under human review; claims in these docs are
  kept honest against a real-database test suite, and known gaps are documented rather
  than papered over.

## Status

PostgreSQL and SQLite are the priority dialects. The table below reflects the current
alpha honestly — including known bugs.

| Feature                                                      | Status                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `.prisma` schema parsing                                     | ✅ Works for mainstream schemas (some grammar gaps known) |
| CRUD (`findMany`, `create`, `update`, `delete`, `count`, …)  | ✅ Works on PostgreSQL and SQLite                         |
| `where` filters, incl. relation filters (`some`/`none`/`is`) | ✅ Works                                                  |
| Interactive `$transaction(async (tx) => …)`                  | ✅ Works                                                  |
| `$kysely` escape hatch (transaction-aware)                   | ✅ Works                                                  |
| `include` (single level, boolean flags)                      | ✅ Works on PostgreSQL and SQLite                         |
| Migrations (`diff` + `apply`)                                | ⚠️ Solid on SQLite; PostgreSQL has known re-diff bugs     |
| `select`, nested writes, multi-level `include`               | ❌ [Not yet supported](#not-yet-supported)                |
| Enums, `@map`/`@@map`, composite keys, implicit many-to-many | ❌ Not yet supported                                      |
| Aggregations, `groupBy`                                      | ❌ [Not yet supported](#not-yet-supported)                |
| MySQL                                                        | ❌ Not yet supported                                      |

### Not yet supported

This list is generated from the feature registry in `packages/client/src/unsupported.ts`. Every entry below throws.

<!-- BEGIN GENERATED: unsupported (source: packages/client/src/unsupported.ts) -->

| Feature                                                    | How it fails                                 | Workaround                                                                                                          | Tracking                                                 |
| ---------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| The 'select' option                                        | throws `OrkNotImplementedError` at runtime   | Use $kysely for partial column projections.                                                                         | —                                                        |
| Object-form include with arguments                         | throws `OrkNotImplementedError` at runtime   | Only boolean relation flags (e.g. { include: { posts: true } }) are supported.                                      | —                                                        |
| The 'include' option where relation loading is unavailable | throws `OrkNotImplementedError` at runtime   | Only findMany, findFirst, and findUnique load relations, and only on models that declare them.                      | —                                                        |
| Nested write                                               | throws `OrkNotImplementedError` at runtime   | Create, connect, or update related records in separate calls.                                                       | —                                                        |
| Cursor-based pagination ('cursor')                         | throws `OrkNotImplementedError` at runtime   | Use offset pagination ('skip' and 'take') instead.                                                                  | —                                                        |
| The 'distinct' option                                      | throws `OrkNotImplementedError` at runtime   | Use $kysely for distinct queries.                                                                                   | —                                                        |
| The 'skipDuplicates' option in createMany                  | throws `OrkNotImplementedError` at runtime   | Insert rows individually with upsert, or use $kysely.                                                               | —                                                        |
| Case-insensitive filtering (mode: 'insensitive')           | throws `OrkNotImplementedError` at runtime   | Normalize casing in the column or use $kysely.                                                                      | —                                                        |
| Filter operator                                            | throws `OrkNotImplementedError` at runtime   | Use a supported operator (equals, not, in, notIn, lt, lte, gt, gte, contains, startsWith, endsWith) or use $kysely. | —                                                        |
| Relation filter shape                                      | throws `OrkNotImplementedError` at runtime   | Use some, every, or none on list relations, or is / isNot on single relations.                                      | —                                                        |
| Aggregations (aggregate)                                   | not present on the client (TypeScript error) | Use $kysely for aggregate queries.                                                                                  | —                                                        |
| Grouping (groupBy)                                         | not present on the client (TypeScript error) | Use $kysely for grouped queries.                                                                                    | —                                                        |
| Raw queries ($queryRaw / $executeRaw)                      | not present on the client (TypeScript error) | Use $kysely.sql for raw SQL.                                                                                        | [#68](https://github.com/jharrell/ork-tracker/issues/68) |
| Scalar list field                                          | `ork generate` fails                         | Model the list as a related table, or store it as a JSON string.                                                    | [#8](https://github.com/jharrell/ork-tracker/issues/8)   |
| Implicit many-to-many relation                             | `ork generate` fails                         | Declare an explicit join model with two relation fields.                                                            | [#13](https://github.com/jharrell/ork-tracker/issues/13) |
| Field type                                                 | `ork generate` fails                         | Use a scalar type the dialect supports, or store the value as a string.                                             | —                                                        |

<!-- END GENERATED: unsupported -->

## Key Packages

- `packages/client`: Client runtime and code generation.
- `packages/schema-parser`: TypeScript-native parser for `.prisma` schemas.
- `packages/field-translator`: Database-specific field transformation for code generation.
- `packages/migrate`: Programmatic migration engine powered by Kysely.
- `packages/config`: Configuration discovery and dialect wiring.
- `packages/unplugin`: Build-tool integration that watches your schema and regenerates the client.
- `packages/cli`: CLI (`ork`) that orchestrates config, generation, and migrations.

Core libraries publish under `@ork-orm/*`, with `ork` (CLI) and `unplugin-ork` as unscoped packages.

## Getting Started (Alpha)

The CLI workflow is the most battle-tested path today.

```bash
pnpm add -D ork @ork-orm/client
npx ork init

export DATABASE_URL="file:./dev.db"

# Generate the client, apply schema changes, or run the combined dev loop
npx ork generate
npx ork migrate dev
npx ork dev
```

Then import the generated client from `.ork/`:

```ts
import { OrkClient } from './.ork/index.js'
import { PostgresDialect } from 'kysely'
import pg from 'pg'

const client = new OrkClient(new PostgresDialect({ pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }) }))

const users = await client.user.findMany({ where: { posts: { some: { published: true } } } })
```

### Vite + unplugin (experimental)

`unplugin-ork` watches `schema.prisma` and regenerates the on-disk `.ork/` client as you
work. `ork init` can detect Vite and offer to patch your `vite.config` for you.

```ts
import { defineConfig } from 'vite'
import ork from 'unplugin-ork/vite'

export default defineConfig({
  plugins: [ork()],
})
```

> [!NOTE]
> The plugin's virtual-module imports (`.ork/types`) are experimental and not yet
> visible to `tsc`. Import from the generated `.ork/` directory on disk instead.

## Development Workflow

1. Edit or create your `schema.prisma`.
2. Use `pnpm --filter @ork-orm/schema-parser test` to exercise parsing changes.
3. Run `pnpm --filter @ork-orm/client build` (or `pnpm watch`) to regenerate the client runtime.
4. Use the CLI for init/generate/migrate flows.
5. Launch the demo project to validate type generation and CRUD operations: `pnpm demo:postgres`.

## Contributing

Ork is TypeScript-first. Follow our workspace conventions:

- Node.js ≥ 24, pnpm ≥ 11.
- `pnpm lint`, `pnpm test`, and `pnpm build` at the workspace root before submitting changes.
- Database-backed tests use Testcontainers (Docker required, nothing else to set up).

## Special Thanks

Thank you to William ([@willguitaradmfar](https://github.com/willguitaradmfar)) for generously donating the `ork` npm package name.

## License

Apache-2.0 © Ork contributors.
