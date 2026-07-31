# unplugin-ork

Build-tool integration for Ork: watches your `schema.prisma` and regenerates the
`.ork/` client on change, so your types stay in sync while you work.

> [!NOTE]
> The plugin's virtual-module imports (`.ork/types`) are experimental and are not yet
> visible to `tsc`. Import from the generated `.ork/` directory on disk instead — the
> plugin keeps it up to date.

## Features

- Regenerates the on-disk `.ork/` client whenever your schema changes.
- Optional auto-migration on schema change (off by default; `safe` mode gates destructive DDL).
- Works with Vite, Webpack, Rollup, and esbuild via [unplugin](https://github.com/unjs/unplugin).

## Installation

```bash
npm install -D unplugin-ork
```

## Usage

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import ork from 'unplugin-ork/vite'

export default defineConfig({
  plugins: [
    ork({
      schema: './schema.prisma', // optional, defaults to './schema.prisma'
      debug: true, // optional, enables logging
    }),
  ],
})
```

### Webpack

```js
// webpack.config.mjs (the Ork packages are ESM-only)
import OrkPlugin from 'unplugin-ork/webpack'

export default {
  plugins: [
    OrkPlugin({
      schema: './schema.prisma',
    }),
  ],
}
```

### Rollup

```ts
// rollup.config.ts
import ork from 'unplugin-ork/rollup'

export default {
  plugins: [
    ork({
      schema: './schema.prisma',
    }),
  ],
}
```

### esbuild

```ts
// build.ts
import { build } from 'esbuild'
import ork from 'unplugin-ork/esbuild'

build({
  plugins: [
    ork({
      schema: './schema.prisma',
    }),
  ],
})
```

## Client Usage

The plugin writes the generated client to `.ork/` in your project. Import it from disk:

```typescript
import { PostgresDialect } from 'kysely'
import pg from 'pg'

import { OrkClient } from './.ork/index.js'

const client = new OrkClient(new PostgresDialect({ pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }) }))

const user = await client.user.findUnique({
  where: { id: 1 },
})
```

## Options

```typescript
interface OrkPluginOptions {
  /** Path to schema.prisma file (default: './schema.prisma') */
  schema?: string

  /** Directory for generated types (default: './.ork') */
  outputDir?: string

  /** Watch for schema changes (default: true in dev) */
  watch?: boolean

  /** Enable debug logging (default: false) */
  debug?: boolean

  /** Disable all output (default: false) */
  silent?: boolean

  /** Preserve terminal output instead of clearing on regeneration */
  preserveLogs?: boolean

  /** Automatically write the generated client to disk (default: true) */
  autoGenerateClient?: boolean

  /** Automatically apply migrations on schema change (default: false) */
  autoMigrate?: boolean

  /** Migration safety mode (default: 'safe') */
  autoMigrateMode?: 'safe' | 'force'

  /** Optional hook fired after schema changes are processed */
  onSchemaChange?: (info: {
    reason: string
    schemaPath: string
    generatedClient: boolean
    migrated: boolean
    migrationSkippedReason?: string
    errors?: string[]
  }) => void

  /** Project root directory (default: process.cwd()) */
  root?: string
}
```

## License

Apache-2.0
