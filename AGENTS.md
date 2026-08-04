# Development Quick Reference

Context for contributors and coding agents working on Ork.

`CLAUDE.md` is a symlink to this file — edit `AGENTS.md` only.

## Start Here

1. **README.md** — vision, honest feature-status table, and getting-started flows.
2. **ARCHITECTURE.md** — how code generation works, package dependencies, and the template system.
3. **CONTRIBUTING.md** — prerequisites and the short setup/build/test loop.

The README's Status table is the source of truth for what currently works; keep it
honest when you change behavior.

## Project Snapshot

- **Name**: Ork ORM
- **Goal**: A TypeScript-native reimplementation of the Prisma developer experience — keep the `.prisma` schema language and Prisma-style client, delegate query execution to Kysely.
- **Priority dialects**: PostgreSQL and SQLite. MySQL is untested scaffolding.

## Machine Setup

- **Node** >= 20; `mise.toml` pins the version used locally (`mise install`). CI runs Node 22.
- **pnpm** >= 10 — required. A `preinstall` hook (`scripts/only-allow-pnpm.js`) rejects npm/yarn.
- **Docker** — only needed for the Testcontainers-backed PostgreSQL suites and the `examples/basic` demo.
- `pnpm install` also runs `husky` (`prepare`), which regenerates the untracked `.husky/_` directory.
- Nothing else is required: no secrets, no `.env` file in the repo. The Postgres examples read
  `DATABASE_URL` from the environment (`examples/vite` falls back to `file:./dev.db`), and
  `examples/basic` starts its own throwaway container. `.env` and `.envrc.local` are gitignored,
  as is `/sandbox` (local scratch space, preserved by `pnpm clean`).

## Workspace Essentials

- Install: `pnpm install`
- Build: `pnpm build` or `pnpm -r build`
- Watch: `pnpm watch`
- Lint: `pnpm lint` (`pnpm lint-fix` to autofix)
- Format: `pnpm format` (`pnpm prettier-check` in CI-style check mode)
- Typecheck: `pnpm -r typecheck` — note only some packages define the script, so this is not full coverage
- Test: `pnpm test` (database-backed suites use Testcontainers and require Docker)
- Reset: `pnpm clean` — `git clean -fdx`, keeping `/.envrc.local` and `/sandbox`

## Key Packages

- `@ork-orm/client`: Prisma-like client runtime backed by Kysely; exposes `$kysely`. Also hosts the
  client generator (`src/client-generator.ts`).
- `@ork-orm/schema-parser`: Pure TypeScript parser for `.prisma` files, produces AST for generators.
- `@ork-orm/field-translator`: Build-time, dialect-specific field transformation codegen consumed by
  the client generator (zero runtime overhead).
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
   (if you touched field transformations, rebuild `@ork-orm/field-translator` first)
3. **Rebuild CLI**: `pnpm --filter ork build`
4. **Regenerate example client**: `cd examples/basic && node ../../packages/cli/dist/bin.js generate`
5. **Test**: `cd examples/basic && pnpm demo` (needs Docker — it spins up a Postgres container)

**⚠️ Do NOT use `pnpm generate` in example directories during development!** It won't pick up your changes. Use the direct node invocation instead.

## Common Patterns & Gotchas

Read `ARCHITECTURE.md` section "Common Patterns" for:

- How field transformations are generated and embedded
- Variable substitution in templates (watch for multiple occurrences!)
- Column qualification in JOIN queries (must use `Table.column` syntax)
- Kysely API constraints and best practices
