import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { findSchemaFile } from '../config-loader.js'
import { OrkConfigSchema } from '../types.js'

describe('findSchemaFile', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('finds ./schema.prisma at the config dir root (back-compat)', () => {
    dir = mkdtempSync(join(tmpdir(), 'ork-schema-discovery-'))
    writeFileSync(join(dir, 'schema.prisma'), '')

    const config = OrkConfigSchema.parse({ datasource: { provider: 'sqlite', url: 'file:./dev.db' } })
    expect(findSchemaFile(config, dir)).toBe(join(dir, 'schema.prisma'))
  })

  it('falls back to prisma/schema.prisma when the root schema is absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'ork-schema-discovery-'))
    mkdirSync(join(dir, 'prisma'))
    writeFileSync(join(dir, 'prisma', 'schema.prisma'), '')

    const config = OrkConfigSchema.parse({ datasource: { provider: 'sqlite', url: 'file:./dev.db' } })
    expect(findSchemaFile(config, dir)).toBe(join(dir, 'prisma', 'schema.prisma'))
  })
})
