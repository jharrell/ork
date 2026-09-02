/**
 * Parity with `ork generate`: a schema using features the client generator
 * cannot translate must abort both unplugin generation paths loudly instead of
 * emitting a client (or the silent fallback client) that lies at runtime.
 */

import fsPromises from 'node:fs/promises'

import { ClientGenerator } from '@ork-orm/client'
import { parseSchema } from '@ork-orm/schema-parser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assertSchemaIsSupported, unpluginOrk, UnsupportedSchemaError } from '../core.js'
import type { SchemaChangeInfo } from '../types.js'

const { defaultExistsSync, defaultReadFileSync } = vi.hoisted(() => {
  const DATASOURCE = `
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
`

  const mockFs: Record<string, string | null> = {
    // Scalar list field: no correct storage/transform, writes would corrupt.
    '/test/scalar-list.prisma': `${DATASOURCE}
model User {
  id    Int      @id @default(autoincrement())
  email String   @unique
  tags  String[]
}
`,
    // Implicit many-to-many: the generator would emit silently wrong SQL.
    '/test/implicit-m2m.prisma': `${DATASOURCE}
model Post {
  id    Int    @id @default(autoincrement())
  title String
  tags  Tag[]
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String @unique
  posts Post[]
}
`,
    // Control: fully supported schema must still generate a real client.
    '/test/supported.prisma': `${DATASOURCE}
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
`,
  }

  const defaultExistsSync = (path: string) => mockFs[path] != null

  const defaultReadFileSync = (path: string) => {
    const content = mockFs[path]
    if (content == null) {
      throw new Error(`File not found: ${path}`)
    }
    return content
  }

  return { defaultExistsSync, defaultReadFileSync }
})

vi.mock('fs', () => ({
  existsSync: vi.fn(defaultExistsSync),
  readFileSync: vi.fn(defaultReadFileSync),
}))

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  },
}))

vi.mock('@ork-orm/config', () => ({
  loadOrkConfig: vi.fn(async () => ({
    config: { datasource: { provider: 'sqlite', url: 'file:./dev.db' } },
    configDir: '/test',
    configPath: '/test/ork.config.ts',
  })),
  getDefaultOutputDir: vi.fn(() => '.ork'),
}))

vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}))

/**
 * `buildStart` short-circuits on unchanged schema content, so each plugin
 * instance may only be started once — capture the rejection instead of
 * asserting on repeated calls.
 */
async function startAndCapture(plugin: { buildStart?: unknown }): Promise<unknown> {
  const buildStart = plugin.buildStart as (this: unknown) => Promise<void>
  try {
    await buildStart.call({})
    return null
  } catch (error) {
    return error
  }
}

describe('unsupported schema features', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aborts the virtual-module path and names the offending scalar list field', async () => {
    const changes: SchemaChangeInfo[] = []
    const plugin = unpluginOrk.raw({
      schema: '/test/scalar-list.prisma',
      root: '/test',
      autoGenerateClient: false,
      onSchemaChange: (info) => changes.push(info),
    })

    const error = await startAndCapture(plugin)

    expect(error).toBeInstanceOf(UnsupportedSchemaError)
    const { message, fields } = error as UnsupportedSchemaError
    expect(message).toContain('Unsupported schema features — generation aborted:')
    // The exact reason wording belongs to @ork-orm/client's registry; assert the
    // line shape and the feature it describes, not its prose.
    expect(message).toMatch(/^ {2}- User\.tags: \S/m)
    expect(message.toLowerCase()).toContain('scalar list')
    expect(fields).toEqual([expect.objectContaining({ model: 'User', field: 'tags' })])

    // The abort must be reported to the caller, not silently swallowed.
    expect(changes).toHaveLength(1)
    expect(changes[0].generatedClient).toBe(false)
    expect(changes[0].errors?.[0]).toContain('User.tags')
  })

  it('serves a throwing client module instead of the silent fallback client', async () => {
    const plugin = unpluginOrk.raw({
      schema: '/test/scalar-list.prisma',
      root: '/test',
      autoGenerateClient: false,
    })

    await startAndCapture(plugin)

    const load = plugin.load as (id: string) => string | null
    const clientModule = load('virtual:ork/client')

    expect(clientModule).toContain('throw new Error')
    expect(clientModule).toContain('User.tags')
    expect(clientModule).not.toContain('__ORK_FALLBACK__')
    expect(clientModule).not.toContain('Generated Ork Client')

    // Types are unaffected by the client abort and stay usable.
    expect(load('virtual:ork/types')).toContain('interface User')
  })

  it('names every offending field for implicit many-to-many relations', async () => {
    const plugin = unpluginOrk.raw({
      schema: '/test/implicit-m2m.prisma',
      root: '/test',
      autoGenerateClient: false,
    })

    const error = await startAndCapture(plugin)

    expect(error).toBeInstanceOf(UnsupportedSchemaError)
    const { message, fields } = error as UnsupportedSchemaError
    expect(message).toMatch(/^ {2}- Post\.tags: \S/m)
    expect(message).toMatch(/^ {2}- Tag\.posts: \S/m)
    expect(message.toLowerCase()).toContain('many-to-many')
    expect(fields.map((f) => `${f.model}.${f.field}`)).toEqual(['Post.tags', 'Tag.posts'])
  })

  it('aborts the written-client path before any file is emitted', async () => {
    // Isolate the write path: let the virtual-module path through so the only
    // remaining guard is the one in writeGeneratedClient.
    // The first call (virtual-module path) is stubbed clean; the spy then falls
    // back to the real implementation, so only writeGeneratedClient's guard fires.
    const spy = vi.spyOn(ClientGenerator.prototype, 'getUnsupportedFields').mockImplementationOnce(() => [])

    const plugin = unpluginOrk.raw({
      schema: '/test/implicit-m2m.prisma',
      root: '/test',
      autoGenerateClient: true,
    })

    const error = await startAndCapture(plugin)

    expect(error).toBeInstanceOf(UnsupportedSchemaError)
    expect((error as UnsupportedSchemaError).message).toContain('Post.tags')
    expect(fsPromises.writeFile).not.toHaveBeenCalled()

    spy.mockRestore()
  })

  it('still generates a real client for a fully supported schema', async () => {
    const plugin = unpluginOrk.raw({
      schema: '/test/supported.prisma',
      root: '/test',
      autoGenerateClient: false,
    })

    const error = await startAndCapture(plugin)
    expect(error).toBeNull()

    const load = plugin.load as (id: string) => string | null
    const clientModule = load('virtual:ork/client')
    expect(clientModule).toContain('Generated Ork Client')
    expect(clientModule).not.toContain('Unsupported schema features')
    expect(clientModule).not.toContain('__ORK_FALLBACK__')
  })
})

describe('assertSchemaIsSupported', () => {
  const SCHEMA_WITH_UNSUPPORTED = `
model User {
  id     Int      @id @default(autoincrement())
  tags   String[]
  status Role
}
`

  const SUPPORTED_SCHEMA = `
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
}
`

  it('throws with one entry per unsupported field', () => {
    const generator = new ClientGenerator(parseSchema(SCHEMA_WITH_UNSUPPORTED).ast, {
      dialect: 'sqlite',
      includeTypes: true,
      esModules: true,
    })

    expect(() => assertSchemaIsSupported(generator)).toThrow(UnsupportedSchemaError)

    try {
      assertSchemaIsSupported(generator)
      expect.unreachable('expected an abort')
    } catch (error) {
      const fields = (error as UnsupportedSchemaError).fields
      expect(fields.map((f) => `${f.model}.${f.field}`)).toEqual(['User.tags', 'User.status'])
    }
  })

  it('passes a schema the generator can translate', () => {
    const generator = new ClientGenerator(parseSchema(SUPPORTED_SCHEMA).ast, {
      dialect: 'sqlite',
      includeTypes: true,
      esModules: true,
    })

    expect(() => assertSchemaIsSupported(generator)).not.toThrow()
  })
})
