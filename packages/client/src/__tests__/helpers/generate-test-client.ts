import { parseSchema } from '@ork-orm/schema-parser'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import { ClientGenerator } from '../../client-generator'

/**
 * The generated client header carries a `Generated at:` timestamp, so a byte comparison
 * against the committed fixture would differ on every run.
 */
const GENERATED_AT_LINE = /^(\s*\*\s*Generated at:).*$/m

export type TestDialect = 'postgresql' | 'sqlite'

export interface TestClientOptions {
  schemaPath?: string
  dialect?: TestDialect
  outputFileName?: string
}

/**
 * Generate an Ork client from the shared conformance schema for one dialect and
 * write it to the committed `fixtures/` location, returning the output path.
 *
 * This is invoked exactly once per dialect from `global-setup.ts`, before any
 * Vitest worker spawns. It is deliberately NOT called from inside a worker: the
 * old per-worker regeneration raced 8 workers writing the same file while others
 * imported it, which could import a stale fixture and produce a false pass
 * (see ork-tracker#52). Workers only ever import the already-written fixture.
 */
export function generateTestClient(options: TestClientOptions = {}): string {
  const schemaPath = options.schemaPath ?? join(__dirname, 'schema.prisma')
  const dialect = options.dialect ?? 'postgresql'
  const schemaContent = readFileSync(schemaPath, 'utf-8')

  const { ast: schemaAST } = parseSchema(schemaContent)

  const generator = new ClientGenerator(schemaAST, { dialect })
  const generatedCode = generator.generateClientModule()

  const outputDir = join(__dirname, '../fixtures')
  const outputFileName =
    options.outputFileName ??
    (dialect === 'postgresql' ? 'generated-test-client.ts' : `generated-test-client-${dialect}.ts`)
  const outputPath = join(outputDir, outputFileName)

  // These fixtures are committed — the type-level and query-logging suites import
  // them directly. Rewriting unconditionally left the working tree dirty after
  // every `pnpm test` purely from the header timestamp. Only write when the
  // generator produced genuinely different output, so a real codegen change still
  // shows up in the diff for review.
  const current = existsSync(outputPath) ? readFileSync(outputPath, 'utf-8') : null
  if (current === null || current.replace(GENERATED_AT_LINE, '$1') !== generatedCode.replace(GENERATED_AT_LINE, '$1')) {
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(outputPath, generatedCode, 'utf-8')
  }

  return outputPath
}
