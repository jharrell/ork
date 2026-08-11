import path from 'node:path'

import type * as TS from 'typescript'
import type { CompilerOptions, Diagnostic } from 'typescript'

/**
 * Result of typechecking a generated client file.
 */
export interface TypecheckResult {
  /** True when the emitted file has no type errors (or the check was skipped). */
  ok: boolean
  /** Number of type errors found in the emitted file. */
  errorCount: number
  /** Human-readable, pre-formatted diagnostics ready to print. */
  formatted: string
  /** True when TypeScript was not available and the check could not run. */
  skipped: boolean
}

/**
 * Compiler options that mirror what a strict consumer project sees. The
 * generated client resolves `@ork-orm/*` and `kysely` through the consumer's
 * `node_modules`, so module resolution is rooted at the emitted file.
 */
function compilerOptions(ts: typeof TS): CompilerOptions {
  return {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    resolveJsonModule: true,
  }
}

/**
 * Typecheck a single generated client file with the TypeScript compiler API.
 *
 * TypeScript is an optional peer dependency; when it cannot be resolved the
 * check is skipped (reported via {@link TypecheckResult.skipped}) rather than
 * failing generation.
 */
export async function typecheckGeneratedClient(filePath: string): Promise<TypecheckResult> {
  let ts: typeof TS
  try {
    // Dynamic import: `typescript` is an optional peer dependency and may be
    // absent at runtime — a static import would crash the whole CLI on load.
    const mod = await import('typescript')
    ts = mod.default ?? (mod as unknown as typeof TS)
  } catch {
    return { ok: true, errorCount: 0, formatted: '', skipped: true }
  }

  const resolved = path.resolve(filePath)
  const program = ts.createProgram([resolved], compilerOptions(ts))

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d): d is Diagnostic & { file: NonNullable<Diagnostic['file']> } => d.file != null)
    .filter((d) => path.resolve(d.file.fileName) === resolved)

  if (diagnostics.length === 0) {
    return { ok: true, errorCount: 0, formatted: '', skipped: false }
  }

  const formatHost: TS.FormatDiagnosticsHost = {
    getCanonicalFileName: (fileName: string) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => ts.sys.newLine,
  }

  return {
    ok: false,
    errorCount: diagnostics.length,
    formatted: ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost),
    skipped: false,
  }
}
