/**
 * Core types for Ork client generation and operations
 */

import type { SchemaAST } from '@ork-orm/schema-parser'

/**
 * Configuration for the Ork client
 */
export interface OrkClientConfig {
  datasourceUrl: string
  provider: 'postgresql' | 'postgres' | 'mysql' | 'sqlite'
  enableLogging?: boolean
  maxConnections?: number
}

/**
 * Prisma-compatible datasource configuration
 */
export interface OrkDatasourceConfig {
  /** Database connection string */
  connectionString: string
  /** Prisma-compatible provider name */
  provider: 'postgresql' | 'postgres' | 'mysql' | 'sqlite'
  /** SSL configuration */
  ssl?:
    | boolean
    | {
        rejectUnauthorized?: boolean
        ca?: string
        cert?: string
        key?: string
      }
  /** Connection pool size */
  poolSize?: number
  /** Connection timeout in milliseconds */
  connectionTimeout?: number
  /** Idle timeout in milliseconds */
  idleTimeout?: number
  /** Maximum connection lifetime in milliseconds */
  maxLifetime?: number
}

/**
 * Map Prisma-style provider names to internal driver provider names
 */
export const PRISMA_PROVIDER_TO_DRIVER_PROVIDER: Record<string, string> = {
  postgresql: 'pg',
  postgres: 'pg',
  mysql: 'mysql',
  sqlite: 'sqlite',
}

/**
 * Utility function to translate Prisma-style datasource config to driver config
 */
export function translateDatasourceConfig(config: OrkDatasourceConfig): any {
  const driverProvider = PRISMA_PROVIDER_TO_DRIVER_PROVIDER[config.provider]
  if (!driverProvider) {
    throw new Error(`Unsupported provider: ${config.provider}.`)
  }

  return {
    connectionString: config.connectionString,
    provider: driverProvider,
    ssl: config.ssl,
    poolSize: config.poolSize,
    connectionTimeout: config.connectionTimeout,
    idleTimeout: config.idleTimeout,
    maxLifetime: config.maxLifetime,
  }
}

/**
 * Database interface that represents the entire schema as Kysely-compatible types
 * Note: In Ork, this should represent your Prisma models, not table names
 * Example:
 * interface MySchema extends DatabaseSchema {
 *   User: { id: number, email: string }     // model User
 *   PostTag: { id: number, postId: number } // model PostTag
 * }
 */
export interface DatabaseSchema {
  [modelName: string]: Record<string, any>
}

/**
 * Type mapping from Prisma schema types to TypeScript types
 */
export const PRISMA_TO_TS_TYPES: Record<string, string> = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  DateTime: 'Date',
  Json: 'any',
  Bytes: 'Buffer',
  BigInt: 'bigint',
  Decimal: 'number',
}

/**
 * Type mapping from Prisma schema types to Kysely column types
 */
export const PRISMA_TO_KYSELY_TYPES: Record<string, string> = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  DateTime: 'Date',
  Json: 'any',
  Bytes: 'Buffer',
  BigInt: 'bigint',
  Decimal: 'number',
}

/**
 * Configuration for code generation
 */
export interface GeneratorConfig {
  schema: SchemaAST
  outputPath: string
  clientConfig: OrkClientConfig
}

/**
 * Generated model interface
 */
export interface GeneratedModel {
  name: string
  tableName: string
  fields: GeneratedField[]
  operations: string // Generated TypeScript code for operations
}

/**
 * Generated field interface
 */
export interface GeneratedField {
  name: string
  type: string
  isOptional: boolean
  isList: boolean
  isPrimaryKey: boolean
  isUnique: boolean
  hasDefault: boolean
}
