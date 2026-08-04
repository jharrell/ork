import { parseSchema } from '@ork-orm/schema-parser'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import { ClientGenerator } from '../../client-generator'

/**
 * The generated client header carries a `Generated at:` timestamp, so a byte comparison
 * against the committed fixture would differ on every run.
 */
const GENERATED_AT_LINE = /^(\s*\*\s*Generated at:).*$/m

export interface TestClientOptions {
  schemaPath?: string
  dialect?: 'postgresql' | 'mysql' | 'sqlite'
  outputFileName?: string
}

/**
 * Generate a Ork client from the test schema
 * Writes the generated client to a temporary location and returns the path
 */
export function generateTestClient(options: TestClientOptions = {}): string {
  const schemaPath = options.schemaPath ?? join(__dirname, 'test-schema.prisma')
  const dialect = options.dialect ?? 'postgresql'
  const schemaContent = readFileSync(schemaPath, 'utf-8')

  // Parse schema
  const { ast: schemaAST } = parseSchema(schemaContent)

  // Generate client code
  const generator = new ClientGenerator(schemaAST, { dialect })
  const generatedCode = generator.generateClientModule()

  // Write to temporary location
  const outputDir = join(__dirname, '../fixtures')
  const outputFileName =
    options.outputFileName ??
    (dialect === 'postgresql' ? 'generated-test-client.ts' : `generated-test-client-${dialect}.ts`)
  const outputPath = join(outputDir, outputFileName)

  // These fixtures are committed — `generated-test-client.ts` is imported directly by
  // the type-level and query-logging suites. Rewriting unconditionally left the working
  // tree dirty after every `pnpm test` purely from the header timestamp. Only write when
  // the generator produced genuinely different output, so a real codegen change still
  // shows up in the diff for review.
  const current = existsSync(outputPath) ? readFileSync(outputPath, 'utf-8') : null
  if (current === null || current.replace(GENERATED_AT_LINE, '$1') !== generatedCode.replace(GENERATED_AT_LINE, '$1')) {
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(outputPath, generatedCode, 'utf-8')
  }

  return outputPath
}

/**
 * Import the generated test client
 * Returns the createOrkClient function from the generated code
 */
export async function importTestClient(options: TestClientOptions = {}) {
  const clientPath = generateTestClient(options)

  // Dynamic import with cache busting
  const timestamp = Date.now()
  const module = await import(`${clientPath}?t=${timestamp}`)

  // Return createOrkClient which accepts a Dialect, not createClient which auto-loads config
  return module.createOrkClient
}
