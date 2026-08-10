import { z } from 'zod'

import { type DatabaseProvider, SUPPORTED_PROVIDERS } from './constants.js'

/**
 * Search order used when `schema` isn't explicitly configured. `./schema.prisma` stays
 * first for back-compat; `prisma/schema.prisma` is Prisma's canonical location.
 */
export const DEFAULT_SCHEMA_SEARCH_PATHS = ['./schema.prisma', 'prisma/schema.prisma'] as const

/**
 * Ork configuration schema.
 *
 * The type annotation is written out rather than inferred: JSR's "slow types" check
 * rejects exported symbols whose type has to be inferred from an initializer, and an
 * un-annotated `z.object(...)` is exactly that. Keep this in sync with the shape below.
 */
export const OrkConfigSchema: z.ZodObject<{
  datasource: z.ZodObject<{
    provider: z.ZodEnum<[DatabaseProvider, ...DatabaseProvider[]]>
    url: z.ZodString
    shadowDatabaseUrl: z.ZodOptional<z.ZodString>
  }>
  generator: z.ZodOptional<
    z.ZodObject<{
      provider: z.ZodDefault<z.ZodString>
      output: z.ZodDefault<z.ZodString>
    }>
  >
  schema: z.ZodDefault<z.ZodString>
}> = z.object({
  datasource: z.object({
    provider: z.enum(SUPPORTED_PROVIDERS),
    url: z.string(),
    shadowDatabaseUrl: z.string().optional(),
  }),
  generator: z
    .object({
      provider: z.string().default('ork'),
      output: z.string().default('./.ork'),
    })
    .optional(),
  schema: z.string().default(DEFAULT_SCHEMA_SEARCH_PATHS[0]),
})

export type OrkConfig = z.infer<typeof OrkConfigSchema>

/**
 * Configuration loading options with priority resolution
 */
export interface ConfigLoadOptions {
  /**
   * Priority 1: Explicit config to use instead of loading from file
   * Highest priority - bypasses all file loading
   */
  config?: OrkConfig

  /**
   * Starting directory to search for config files
   * Defaults to process.cwd()
   */
  cwd?: string

  /**
   * Priority 2: Explicit config file path
   * Higher priority than auto-discovery
   */
  configFile?: string
}

/**
 * Result of configuration loading
 */
export interface ConfigLoadResult {
  config: OrkConfig
  configPath: string | null
  configDir: string
}

/**
 * Kysely creation result
 */
export interface KyselyResult {
  kysely: import('kysely').Kysely<any>
  config: OrkConfig
  configPath: string | null
  configDir: string
}
