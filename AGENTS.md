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

- **Name**: Ork ORM (early alpha; packages are published at `0.0.1-alpha.x`).
- **Goal**: A TypeScript-native reimplementation of the Prisma developer experience — keep the `.prisma` schema language and Prisma-style client, delegate query execution to Kysely.
- **Priority dialects**: PostgreSQL and SQLite. MySQL is untested scaffolding.
- **Layout**: pnpm workspace over `packages/*` (published) and `examples/*` (all `private: true`).

## Machine Setup

**The toolchain is Node 24 + pnpm 11, pinned everywhere.** Node 22 is in maintenance; 24 is the
active LTS. There is exactly one source of truth per tool:

| Tool               | Pinned in                         | Value                        |
| ------------------ | --------------------------------- | ---------------------------- |
| pnpm               | `package.json` → `packageManager` | `pnpm@11.20.0`               |
| pnpm (local shell) | `mise.toml`                       | `11`                         |
| Node (local shell) | `mise.toml`                       | `24`                         |
| Node (CI)          | `pnpm/setup` → `runtime:`         | `node@24`                    |
| Both (consumers)   | `engines` in every manifest       | `node >=24.0.0`, `pnpm >=11` |

CI deliberately does **not** pass a pnpm `version:` — `pnpm/setup` reads `packageManager`. Adding a
second pin reintroduces the drift that broke this repo before. If you bump pnpm, change
`packageManager` and `mise.toml` together.

- **Docker** — needed for the PostgreSQL Testcontainers suite in `@ork-orm/client` and for the
  `examples/basic` and `examples/kysely` demos. `examples/vite` is SQLite-only and needs no Docker.
  Without Docker, 4 client suites fail in `beforeAll` with
  `Could not find a working container runtime strategy` — that's environmental, not your change.
- A `preinstall` hook (`scripts/only-allow-pnpm.js`) rejects npm/yarn.
- `pnpm install` also runs `husky` (`prepare`), which regenerates the untracked `.husky/_` directory.
  The pre-commit hook runs `lint-staged`: `prettier --check` on `*.{md,yml,json}`, `eslint` on `*.{js,ts}`.
- Nothing else is required: no secrets, no `.env` file in the repo. The Postgres examples read
  `DATABASE_URL` from the environment (`examples/vite` falls back to `file:./dev.db`), and
  `examples/basic` starts its own throwaway container. `.env` and `.envrc.local` are gitignored,
  as is `/sandbox` (local scratch space, preserved by `pnpm clean`).

### pnpm 11 config rules

pnpm 11 no longer reads the `pnpm` field in `package.json`, and `.npmrc` is auth/registry only.
**All pnpm settings live in `pnpm-workspace.yaml`.**

- Build scripts are an explicit allow/deny map under `allowBuilds` (`onlyBuiltDependencies` and
  friends are gone). Only `better-sqlite3` is allowed to build; everything else is denied on
  purpose. `strictDepBuilds` defaults on, so an undeclared native dep **fails the install** rather
  than warning — add it to `allowBuilds` with a deliberate `true`/`false`.
- `minimumReleaseAge` defaults to 1440 (1 day) as supply-chain protection. We keep it, with
  `minimumReleaseAgeExclude` exempting `ork`, `unplugin-ork`, and `@ork-orm/*` so a freshly
  published alpha can be dogfooded immediately.

## Workspace Essentials

- Install: `pnpm install`
- Build: `pnpm build` (= `pnpm -r build`; every package builds with `tsup`, plus `examples/vite`)
- Lint: `pnpm lint` (`pnpm lint-fix` to autofix) — ESLint runs once from the root; no package defines its own `lint`.
- Format: `pnpm format` (`pnpm prettier-check` in CI-style check mode)
- Typecheck: `pnpm -r typecheck` — **build first, and it only reaches `@ork-orm/config` and
  `unplugin-ork`.** Packages resolve each other through their built `dist/`, so on a clean tree
  `unplugin` fails with `TS2307: Cannot find module '@ork-orm/client'` until `pnpm -r build` has run
  (this is why CI builds before typechecking). Coverage is partial because
  `@ork-orm/field-translator` names its script `type-check` (hyphenated, not matched) and
  `client`, `cli`, `migrate`, `schema-parser` define none. Don't treat a green typecheck as
  coverage; rely on `tsup`'s `dts` build instead.
- Test: `pnpm test` (= `pnpm -r test`; Vitest in all 7 packages, examples have no test scripts)
- Reset: `pnpm clean` — `git clean -fdx`, keeping `/.envrc.local` and `/sandbox`

**Watch: `pnpm watch`.** Runs a topological `build` across `packages/*` first, then starts every
package's `tsup --watch` in parallel. The build-first half matters: packages resolve each other
through `dist/`, so parallel watchers alone would race on a clean tree. It is scoped to
`packages/*` on purpose — an unscoped `pnpm -r run dev` also boots the `examples/vite` dev server.

## CI

`.github/workflows/ci.yml` (push to `main`, PRs, manual) runs on ubuntu. A single
`pnpm/setup@v2` step installs pnpm (version from `packageManager`), installs Node 24, and runs
`pnpm install` automatically — there is no `actions/setup-node` and no separate install step.
Then:

`pnpm -r build` → `pnpm lint` → `pnpm -r typecheck` → `pnpm -r test`
→ `node packages/cli/dist/bin.js --help` → `cd examples/vite && node ../../packages/cli/dist/bin.js generate`

The last step means **generation against `examples/vite` is a CI smoke test** — a generator change
that breaks it fails the build. `actionlint.yml` lints workflows.

`publish.yml` is manual (`workflow_dispatch`, `tag` input, default `alpha`) and publishes to npm
plus JSR. Both jobs run in the `release` GitHub environment — add required reviewers there to
make a publish need approval. The JSR job skips `ork` (no JSR bin support — hence no
`packages/cli/jsr.json`). **Adding a new library package means adding a `jsr.json`** with `name`,
`version`, `exports`, and `license`.

### Publishing auth is OIDC — there are no tokens

Both registries authenticate with the short-lived OIDC token that `id-token: write` grants. There
is no `NPM_TOKEN`, no `registry-url`, and no `.npmrc` step anywhere. **Don't "fix" a publish
failure by adding a token** — that defeats the entire setup and re-introduces a long-lived
credential.

- **Provenance must stay the `--provenance` flag.** npm auto-generates provenance for _npm CLI_
  trusted publishes, but we publish with pnpm's native implementation, so it must be explicit —
  pnpm's own release workflow does the same. pnpm ignores `npm_config_*` env vars, so the old
  `NPM_CONFIG_PROVENANCE: 'true'` would be silently dropped and publish unattested artifacts
  **without failing**. Provenance also requires a public repo and public package; both hold here.
- **npm trusted publishers are configured per package, in the npm web UI** — seven of them, one
  per published package. npmjs.com → package → Settings → Trusted Publisher → GitHub Actions:
  organization `jharrell`, repository `ork`, workflow filename `publish.yml`, environment
  `release`, allowed action `npm publish`. A package with no trusted publisher configured will
  fail the OIDC exchange with a 404, which reads like a "package not found" error but is auth.
  After it works, set Publishing access → _Require two-factor authentication and disallow tokens_.
- **JSR needs no per-package secret.** All six `@ork-orm/*` packages already exist on jsr.io and
  are linked to `jharrell/ork`, which is what authorizes the OIDC publish.
- **JSR still fails on slow types, in two packages.** `jsr publish --dry-run` is clean for
  `client`, `config`, `migrate`, and `unplugin`; `schema-parser` (49) and `field-translator` (6)
  still report `missing-explicit-type` / `missing-explicit-return-type` — **55 total** — so the
  job stays `continue-on-error`. Tracked in
  [ork-tracker#47](https://github.com/jharrell/ork-tracker/issues/47). Adding
  `--allow-slow-types` to the publish step makes it pass today (verified via dry-run) at the cost
  of JSR's type-check performance and generated docs; the durable fix is explicit types on the
  exported API. When you add an export to a clean package, annotate it or you re-break that package.

## Key Packages

| Package                     | Dir                         | Workspace deps                          | Notes                                                                                                                                                                 |
| --------------------------- | --------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ork-orm/schema-parser`    | `packages/schema-parser`    | —                                       | Pure TS `.prisma` lexer/parser → AST. `src/parser.ts` (~800 lines) is the core.                                                                                       |
| `@ork-orm/field-translator` | `packages/field-translator` | schema-parser                           | Build-time, dialect-specific transformation **code strings** in `src/generators/{postgresql,mysql,sqlite}.ts`. Zero runtime overhead.                                 |
| `@ork-orm/config`           | `packages/config`           | —                                       | Config discovery (`ork.config.ts`, `.config/ork.ts`) and dialect/Kysely factories.                                                                                    |
| `@ork-orm/client`           | `packages/client`           | config, field-translator, schema-parser | Runtime base (`src/client.ts`, exposes `$kysely`) **and** the generator, `src/client-generator.ts` (~2000 lines, single file — no `generators/` or `templates/` dir). |
| `@ork-orm/migrate`          | `packages/migrate`          | field-translator, schema-parser         | `diff`/`apply`/history. `src/OrkMigrate.ts` is ~3700 lines — the largest file in the repo.                                                                            |
| `unplugin-ork`              | `packages/unplugin`         | all of the above                        | Vite/webpack/rollup/esbuild entries. `src/core.ts` (~780 lines) writes the on-disk `.ork/` client and manages virtual modules.                                        |
| `ork`                       | `packages/cli`              | schema-parser, migrate, client, config  | ESM-only CLI, `bin` → `dist/bin.js`. Commands in `src/commands/`.                                                                                                     |

All packages are `type: module`, ESM-only, built by `tsup`.

## Tests

- Every suite lives in `packages/<pkg>/src/__tests__/`. Counts: client 9, unplugin 7, config 4,
  cli 3, schema-parser 2, migrate 2, field-translator 2. No `.spec.ts`, no tests in `examples/*`.
- Run one package: `pnpm --filter @ork-orm/client test`
- Run one file: `pnpm --filter @ork-orm/client exec vitest run src/__tests__/sqlite-runtime.test.ts`
- **Docker-backed**: `packages/client/src/__tests__/helpers/test-container.ts` spins up
  `postgres:16-alpine` via Testcontainers. Client tests use a 30s `testTimeout`/`hookTimeout` for this.
- **SQLite-backed**: `packages/client/src/__tests__/sqlite-runtime.test.ts` via `better-sqlite3`
  (the only entry in root `pnpm.onlyBuiltDependencies`).
- Per-package Vitest quirks worth knowing: `cli` uses a single-fork pool with `retry: 1` and v8
  coverage thresholds at 80%; `unplugin` has `src/__tests__/setup.ts` and forces `NO_COLOR=1`;
  `migrate` uses stock Vitest defaults. There is no Vitest workspace/project config.

## Examples

| Example           | Needs Docker                 | Purpose                                                                                                  |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `examples/basic`  | yes (Postgres Testcontainer) | End-to-end Prisma-style CRUD demo. `pnpm demo` (`tsx demo.ts`); also `pnpm demo:postgres` from the root. |
| `examples/kysely` | yes (Postgres Testcontainer) | Low-level demo driving `OrkClientBase.$kysely` with hand-written types.                                  |
| `examples/vite`   | no (SQLite)                  | `unplugin-ork` dev-loop demo. Scripts: `dev`, `build`, `preview`, `generate`, `generate:local`.          |

`examples/basic` and `examples/kysely` both require `DATABASE_URL` in the environment.
Only `examples/vite` defines a `build` script, so `pnpm -r build` touches it and skips the other
two; `pnpm -r test` skips all three.

## Code Generation Workflow (IMPORTANT!)

When making changes to the client generator:

1. **Edit source**: Modify `packages/client/src/client-generator.ts`
2. **Rebuild client package**: `pnpm --filter @ork-orm/client build`
   (if you touched field transformations, rebuild `@ork-orm/field-translator` first)
3. **Rebuild CLI**: `pnpm --filter ork build` — the CLI bundles its workspace deps, so a stale
   `packages/cli/dist/` silently generates with the _old_ generator.
4. **Regenerate example client**:
   `cd examples/basic && DATABASE_URL="postgresql://u:p@localhost:5432/db" node ../../packages/cli/dist/bin.js generate`
   — `DATABASE_URL` must be set even just to generate; config validation rejects a missing
   `datasource.url` before codegen runs. Any syntactically valid URL works for generation alone.
5. **Test**: `cd examples/basic && pnpm demo` (needs Docker — it spins up a Postgres container)

**⚠️ Do NOT use `pnpm generate` in example directories during development!** Those scripts resolve
the installed `ork` bin and can pick up stale output. Use the direct node invocation instead —
`examples/vite` ships it as `pnpm generate:local`.

The CLI path is `bin.ts` → `registerGenerateCommand` → `GenerateCommand.execute`
(`packages/cli/src/commands/generate.ts`) → `parseSchema` → `ClientGenerator.generateClientModule()`.
It writes **a single `index.ts`** into the output dir (default `./.ork`, overridable via `-o` or
`generator.output`). There is no separate emitted types file on the CLI path.

`unplugin-ork` is **not** a second generator — it imports the same `ClientGenerator`
(`packages/unplugin/src/core.ts`) — but it duplicates the config/schema/output orchestration and
adds virtual-module and production-build layers on top. Generator changes must be sanity-checked
against both paths.

## Common Patterns & Gotchas

Read `ARCHITECTURE.md` section "Common Patterns" for the full narrative. The load-bearing ones,
still true in the current source:

- **Variable substitution uses `replaceAll`, never `replace`** — transformation code strings
  reference the same variable more than once (`client-generator.ts` ~1499-1603).
- **JOIN column qualification** — relation joins and `where` fields must be emitted as
  `Table.column` (`client-generator.ts` ~1268-1278 and ~1393-1397).
- **Dialect fallback is SQLite.** `ClientGenerator` defaults to SQLite when no dialect or config is
  supplied (`client-generator.ts` ~25-43), and `unplugin` falls back the same way. A "works on my
  machine" PostgreSQL bug is often a dialect that was never actually detected.
- **Build order matters**: field-translator → client → cli. Skipping a link leaves stale `dist/`.

## Known Rough Edges

All verified on a clean checkout. Pre-existing — not caused by your change, and don't propagate them.

- **Script naming is inconsistent** across packages (`typecheck` vs `type-check` vs absent), which
  is why recursive typecheck under-covers.
- **`unplugin-ork` has no `publishConfig`** — the only package without one. It still publishes
  because `pnpm -r publish` passes `--access public` on the command line. Don't copy it as the template.
- **The root package and the CLI are both named `ork`.** `pnpm --filter ork <cmd>` matches both and
  will recurse unexpectedly; use a path filter (`--filter './packages/cli'`) for the CLI.
- **`pnpm lint` is warning-noisy** — 14 warnings, 0 errors. Keep the error count at zero.
