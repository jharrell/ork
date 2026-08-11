import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { typecheckGeneratedClient } from '../utils/typecheck.js'

describe('typecheckGeneratedClient', () => {
  const dir = resolve(__dirname, '../../test-temp-typecheck')

  beforeEach(() => {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports errors for a file that does not typecheck', async () => {
    const file = resolve(dir, 'broken.ts')
    writeFileSync(file, 'export const value: number = "not a number"\n')

    const result = await typecheckGeneratedClient(file)

    expect(result.skipped).toBe(false)
    expect(result.ok).toBe(false)
    expect(result.errorCount).toBeGreaterThan(0)
    expect(result.formatted).toContain('broken.ts')
  })

  it('passes a file that typechecks cleanly', async () => {
    const file = resolve(dir, 'clean.ts')
    writeFileSync(file, 'export const value: number = 42\n')

    const result = await typecheckGeneratedClient(file)

    expect(result.skipped).toBe(false)
    expect(result.ok).toBe(true)
    expect(result.errorCount).toBe(0)
  })
})

describe('generate command typecheck gate', () => {
  const testDir = resolve(__dirname, '../../test-temp-gate')
  const cliPath = resolve(__dirname, '../../dist/bin.js')
  const originalCwd = process.cwd()

  const runGenerate = (): Promise<{ output: string; exitCode: number }> => {
    const { promise, resolve: resolveRun } = Promise.withResolvers<{ output: string; exitCode: number }>()
    const child = spawn('node', [cliPath, 'generate'], { cwd: testDir, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (d) => (output += d.toString()))
    child.stderr.on('data', (d) => (output += d.toString()))
    child.on('close', (code) => resolveRun({ output, exitCode: code ?? 0 }))
    return promise
  }

  const writeConfig = () => {
    writeFileSync(
      resolve(testDir, 'ork.config.ts'),
      [
        "import type { OrkConfig } from '@ork-orm/config'",
        'export default {',
        "  schema: './schema.prisma',",
        "  datasource: { provider: 'sqlite', url: 'file:./dev.db' },",
        "  generator: { provider: 'ork', output: './.ork' },",
        '} satisfies OrkConfig',
        '',
      ].join('\n'),
    )
  }

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    writeConfig()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(testDir, { recursive: true, force: true })
  })

  it('exits zero for a schema whose generated client typechecks', async () => {
    writeFileSync(
      resolve(testDir, 'schema.prisma'),
      [
        'datasource db { provider = "sqlite" }',
        'generator ork { provider = "ork" }',
        'model User { id Int @id @default(autoincrement()) name String posts Post[] }',
        'model Post { id Int @id @default(autoincrement()) title String done Boolean @default(false) author User @relation(fields: [authorId], references: [id]) authorId Int }',
        '',
      ].join('\n'),
    )

    const result = await runGenerate()
    expect(result.exitCode).toBe(0)
  }, 30000)

  it('exits nonzero when a field type is unsupported', async () => {
    writeFileSync(
      resolve(testDir, 'schema.prisma'),
      [
        'datasource db { provider = "sqlite" }',
        'generator ork { provider = "ork" }',
        'enum Role { USER ADMIN }',
        'model User { id Int @id @default(autoincrement()) role Role posts Post[] }',
        'model Post { id Int @id @default(autoincrement()) title String author User @relation(fields: [authorId], references: [id]) authorId Int }',
        '',
      ].join('\n'),
    )

    const result = await runGenerate()
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toMatch(/field type 'Role' is not supported/)
  }, 30000)

  it('exits nonzero for a scalar list field', async () => {
    writeFileSync(
      resolve(testDir, 'schema.prisma'),
      [
        'datasource db { provider = "sqlite" }',
        'generator ork { provider = "ork" }',
        'model User { id Int @id @default(autoincrement()) tags String[] }',
        '',
      ].join('\n'),
    )

    const result = await runGenerate()
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toMatch(/scalar list fields/)
  }, 30000)

  it('exits nonzero for an implicit many-to-many relation', async () => {
    writeFileSync(
      resolve(testDir, 'schema.prisma'),
      [
        'datasource db { provider = "sqlite" }',
        'generator ork { provider = "ork" }',
        'model Post { id Int @id @default(autoincrement()) tags Tag[] }',
        'model Tag { id Int @id @default(autoincrement()) posts Post[] }',
        '',
      ].join('\n'),
    )

    const result = await runGenerate()
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toMatch(/implicit many-to-many/)
  }, 30000)
})
