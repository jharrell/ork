# Development Quick Reference

Context for contributors and coding agents working on Ork.

## Start Here

1. **README.md** — vision, honest feature-status table, and getting-started flows.
2. **ARCHITECTURE.md** — how code generation works, package dependencies, and the template system.

The README's Status table is the source of truth for what currently works; keep it
honest when you change behavior.

## Project Snapshot

- **Name**: Ork ORM
- **Goal**: A TypeScript-native reimplementation of the Prisma developer experience — keep the `.prisma` schema language and Prisma-style client, delegate query execution to Kysely.
- **Priority dialects**: PostgreSQL and SQLite. MySQL is untested scaffolding.

## Workspace Essentials

- Install: `pnpm install`
- Build: `pnpm build` or `pnpm -r build`
- Watch: `pnpm watch`
- Lint: `pnpm lint`
- Test: `pnpm test` (database-backed suites use Testcontainers and require Docker)

## Key Packages

- `@ork-orm/client`: Prisma-like client runtime backed by Kysely; exposes `$kysely`.
- `@ork-orm/schema-parser`: Pure TypeScript parser for `.prisma` files, produces AST for generators.
- `@ork-orm/migrate`: Programmatic migrations via Kysely (`diff`, `apply`, history APIs).
- `@ork-orm/config`: Config discovery and dialect creation (PostgreSQL, SQLite priority).
- `unplugin-ork`: Build-tool integration that watches the schema and regenerates the on-disk `.ork/` client.
- `ork`: ESM-only CLI wrapping config, generation, and migrations.

## Development Notes

- Prioritize PostgreSQL and SQLite support while structuring code for additional Kysely dialects.
- Keep schema parsing, client generation, and migrations TypeScript-native — no Rust engine integration.
- Tests live alongside packages (`src/__tests__`) and as functional suites under `packages/client`.

## Code Generation Workflow (IMPORTANT!)

When making changes to the client generator:

1. **Edit source**: Modify `packages/client/src/client-generator.ts`
2. **Rebuild client package**: `pnpm --filter @ork-orm/client build`
3. **Rebuild CLI**: `pnpm --filter ork build`
4. **Regenerate example client**: `cd examples/basic && node ../../packages/cli/dist/bin.js generate`
5. **Test**: `cd examples/basic && pnpm demo`

**⚠️ Do NOT use `pnpm generate` in example directories during development!** It won't pick up your changes. Use the direct node invocation instead.

## Common Patterns & Gotchas

Read `ARCHITECTURE.md` section "Common Patterns" for:

- How field transformations are generated and embedded
- Variable substitution in templates (watch for multiple occurrences!)
- Column qualification in JOIN queries (must use `Table.column` syntax)
- Kysely API constraints and best practices
