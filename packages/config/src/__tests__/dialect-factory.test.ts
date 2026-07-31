import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { Kysely, sql } from 'kysely'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { createKyselyDialect } from '../dialect-factory.js'
import { OrkConfigSchema } from '../types.js'

describe('createKyselyDialect sqlite path resolution', () => {
  it('resolves file: URLs relative to baseDir, inside the project subdir, not the process cwd', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ork-sqlite-baseDir-'))
    const projectDir = join(root, 'myproject')
    mkdirSync(projectDir)

    const config = OrkConfigSchema.parse({ datasource: { provider: 'sqlite', url: 'file:./dev.db' } })
    const dialect = await createKyselyDialect(config, projectDir)
    const db = new Kysely<any>({ dialect })
    await sql`select 1`.execute(db)
    await db.destroy()

    expect(existsSync(join(projectDir, 'dev.db'))).toBe(true)
    expect(existsSync(join(root, 'dev.db'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'dev.db'))).toBe(false)

    rmSync(root, { recursive: true, force: true })
  })

  it('does not treat :memory: as a relative path', async () => {
    const config = OrkConfigSchema.parse({ datasource: { provider: 'sqlite', url: 'file::memory:' } })
    // A nonexistent baseDir would fail to resolve if ':memory:' were treated as a real path.
    const dialect = await createKyselyDialect(config, '/nonexistent/dir')
    const db = new Kysely<any>({ dialect })
    await sql`select 1`.execute(db)
    await db.destroy()
  })
})
