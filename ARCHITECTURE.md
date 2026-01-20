# Ork Architecture

This document describes the internal architecture of Ork, focusing on how code generation works and how the various packages interact.

## Overview

Ork is a TypeScript-native ORM built on top of Kysely. It uses compile-time code generation to create type-safe database clients with zero runtime overhead. The architecture consists of several packages that work together to parse Prisma schemas, generate database-specific transformations, and produce a fully type-safe client.

## Package Dependency Graph

```
┌─────────────────┐
│ schema-parser   │  Parses Prisma schema files into AST
└────────┬────────┘
         │
         ├──────────────┐
         │              │
         ▼              ▼
┌─────────────────┐  ┌──────────────────┐
│ field-translator│  │ client           │  Generates client code with operations
└────────┬────────┘  └────────┬─────────┘
         │                    │
         └──────────┬─────────┘
                    │
                    ▼
           ┌────────────────┐
           │      cli       │  Command-line interface
           └────────────────┘
                    │
                    ▼
           ┌────────────────┐
           │ .ork/      │  Generated client code (output)
           │   index.ts     │
           └────────────────┘
```

**Key Dependencies:**

- `@ork-orm/schema-parser`: Standalone - parses Prisma schema files
- `@ork-orm/field-translator`: Depends on `schema-parser` - generates database-specific type transformations
- `@ork-orm/client`: Depends on `schema-parser` and `field-translator` - generates the complete client
- `ork`: Depends on all above - provides the `ork generate` command
- `@ork-orm/migrate`: Depends on `schema-parser` and `field-translator` - handles database migrations

## Code Generation Flow

### High-Level Flow

```
schema.prisma
     │
     ▼
schema-parser
     │
     ├─────────────────────┐
     │                     │
     ▼                     ▼
field-translator    client-generator
(transformation)     (template system)
                          │
     │                    │
     └─────────┬──────────┘
               │
               ▼
    generated/index.ts
    (type-safe client)
```

### Detailed Flow

#### 1. Schema Parsing (`@ork-orm/schema-parser`)

The schema parser converts a Prisma schema file into a Document Model Meta Format (DMMF) representation:

```prisma
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
```

Becomes a structured AST with models, fields, attributes, and relationships.

#### 2. Field Translation (`@ork-orm/field-translator`)

For each database dialect (PostgreSQL, MySQL, SQLite), the field translator generates **code snippets** for converting between TypeScript types and database types.

**Example:** For a PostgreSQL `String?` field:

```typescript
// Generated transformation code:
value !== null ? String(value) : null
```

**Important:** The field translator generates these as **code strings** with a placeholder variable name (typically `value` or `data.fieldName`). These will be embedded into templates later.

**Location:** `packages/field-translator/src/generators/{dialect}.ts`

#### 3. Client Generation (`@ork-orm/client`)

The client generator is the heart of code generation. It takes the parsed schema and field transformations and produces the final client code.

##### Template System

The generator uses **string template interpolation** to create the client code:

```typescript
// Simplified example from client-generator.ts
private generateTransformWhereValue(model: Model): string {
  const cases = model.fields.map(field => {
    const transformation = this.fieldTranslator.getTransformation(field)

    return `    if (fieldName === '${field.name}') {
      return ${transformation.code.replaceAll('data.' + field.name, 'value')}
    }`
  })

  return `  private transformWhereValue(fieldName: string, value: unknown): unknown {
${cases.join('\n')}
    return value
  }`
}
```

**Key Insight:** The transformation code from field-translator contains variable references that must be substituted correctly in the template.

##### Variable Substitution

When embedding field transformation code into templates, variable names must be replaced:

**❌ Common Pitfall:**

```typescript
transformation.code.replace('data.fieldName', 'value')
// Only replaces FIRST occurrence!
```

**✅ Correct:**

```typescript
transformation.code.replaceAll('data.fieldName', 'value')
// Replaces ALL occurrences
```

**Why this matters:** Field transformation code may contain multiple references to the same variable:

```typescript
data.name !== null ? String(data.name) : null
//         ↑ first occurrence    ↑ second occurrence
```

If you only replace the first occurrence, you get:

```typescript
value !== null ? String(data.name) : null // ❌ 'data' is not defined!
```

##### Column Qualification

When generating queries that involve JOINs, column names in WHERE clauses must be qualified with table names to avoid ambiguity:

**❌ Ambiguous:**

```typescript
query.where('id', '=', userId) // Which table's 'id'?
```

**✅ Qualified:**

```typescript
query.where('User.id', '=', userId) // Clear!
```

The `applyWhereConditions` method in client-generator handles this by prefixing all field names with the table name:

```typescript
const qualifiedField = `${tableName}.${field}`
currentQuery = currentQuery.where(qualifiedField, '=', value)
```

#### 4. Generated Client Structure

The generated client (`generated/index.ts`) contains:

1. **Type definitions** - TypeScript interfaces for models
2. **Model delegates** - Objects like `client.user` with CRUD methods
3. **Field transformations** - Embedded transformation logic (zero runtime overhead)
4. **Query builders** - Methods like `findUnique`, `findMany`, `create`, `update`, `delete`
5. **Relation loading** - Logic for `include` to fetch related records

**Example of generated code:**

```typescript
export class OrkClient {
  user: UserDelegate
  post: PostDelegate

  constructor(dialect: Dialect) {
    this.user = new UserDelegate(dialect)
    this.post = new PostDelegate(dialect)
  }
}

class UserDelegate {
  async findUnique(args: { where: WhereUnique, include?: Include }) {
    let query = this.kysely.selectFrom('User')

    // Apply WHERE conditions
    query = this.applyWhereConditions(query, args.where)

    // Handle includes (relations)
    if (args.include?.profile) {
      query = query
        .leftJoin('Profile', 'User.userId', 'Profile.id')
        .selectAll('User')
        .select(['Profile.id as profile_id', ...])
    }

    // Transform result
    const row = await query.executeTakeFirst()
    return this.transformRow(row)
  }

  private transformWhereValue(fieldName: string, value: unknown): unknown {
    if (fieldName === 'name') {
      return value !== null ? String(value) : null
    }
    // ... more fields
  }
}
```

## Development Build Process

When making changes to the generator:

1. **Edit source code** in `packages/client/src/client-generator.ts`
2. **Rebuild package**: `pnpm --filter @ork-orm/client build`
3. **Rebuild CLI** (if needed): `pnpm --filter ork build`
4. **Regenerate test clients**: In example directories, run generation
5. **Test**: Run example demos to verify changes

**Build Order Matters:** You must rebuild client before CLI, and regenerate clients before running tests.

## Key Files

### Generator Core

- `packages/client/src/client-generator.ts` - Main code generation logic (~1500 lines), includes type generation
- `packages/client/src/client.ts` - Base client class (`OrkClientBase`)
- `packages/client/src/types.ts` - Type definitions and mappings
- `packages/client/src/client-factory.ts` - Convenience factory for config-based client creation

### Field Translation

- `packages/field-translator/src/generators/postgresql.ts` - PostgreSQL transformations
- `packages/field-translator/src/generators/mysql.ts` - MySQL transformations
- `packages/field-translator/src/generators/sqlite.ts` - SQLite transformations

### Schema Parsing

- `packages/schema-parser/src/parser.ts` - Prisma schema parser
- `packages/schema-parser/src/lexer.ts` - Tokenization
- `packages/schema-parser/src/types.ts` - AST type definitions
- `packages/schema-parser/src/codegen.ts` - Code generation from AST

### CLI

- `packages/cli/src/bin.ts` - CLI entry point
- `packages/cli/src/commands/init.ts` - Project initialization command
- `packages/cli/src/commands/generate.ts` - Client generation command
- `packages/cli/src/commands/migrate.ts` - Migration commands (dev, status, history, rollback)

## Common Patterns

### 1. Generating Methods for Each Model

```typescript
for (const model of schema.models) {
  const methods = this.generateModelMethods(model)
  // ... emit to output
}
```

### 2. Field Transformation Lookup

```typescript
const transformation = this.fieldTranslator.getTransformation(field)
// transformation.code contains the code string to embed
```

### 3. Template Assembly

```typescript
private generateMethod(model: Model): string {
  return `
    async findUnique(args: FindUniqueArgs) {
      ${this.generateQueryLogic(model)}
    }
  `
}
```

### 4. Handling Relations

Relations are handled during query building by:

1. Detecting `include` in the args
2. Adding appropriate JOINs to the Kysely query
3. Selecting related fields with prefixes
4. Transforming the flat row result back into nested objects

## Testing Strategy

1. **Unit tests**: Test individual generator functions (e.g., `generateTransformWhereValue`)
2. **Integration tests**: Generate a client and verify the generated code structure
3. **Runtime tests**: Execute operations against a real database (Testcontainers)

Example directories like `examples/basic` serve as both integration tests and documentation.

## Performance Characteristics

- **Zero runtime overhead**: All type transformations are generated at compile time
- **No code execution during generation**: Pure string templating (no eval/Function constructor)
- **Small bundle size**: Only generated code for models in your schema
- **Tree-shakeable**: Unused model operations can be removed by bundlers

## Design Principles

### Developer Experience

- **ESM-only packages**: Target modern bundlers and runtime environments with native ESM output
- **Code transparency**: Keep generation artifacts accessible for debugging (no hidden binaries or opaque caches)
- **Debuggable schema parser**: Surface rich error messages with source locations when parsing `.prisma` files
- **Task automation**: Integrate with `pnpm` workspace tooling and watch modes for quick iteration
- **Consistent configuration**: Centralize config discovery (`ork.config.ts`, `.config/ork.ts`, explicit options) and dialect creation in `@ork-orm/config`
- **Testing harness**: Provide functional tests that spin up clients against real databases and unit tests for parser, client, and migration primitives

### Non-Functional Requirements

- **Performance parity**: Achieve query execution performance competitive with Prisma for supported databases by leveraging Kysely's optimized SQL generation
- **Reliability**: Ensure migrations run transactionally (when supported) with clear rollback guidance and deterministic SQL output
- **Extensibility**: Architect packages so new directives, providers, and CLI commands can be added without invasive changes
- **Maintainability**: Favor explicit TypeScript types, modular package boundaries, and shared utilities in `@ork-orm/internals`-style packages
- **Licensing and openness**: Preserve Apache-2.0 compatibility and avoid dependencies that would restrict redistribution

### Core Capabilities

- **Prisma schema compatibility**: Accept `.prisma` files without modification, including datasource, generator, and data model blocks
- **Type-safe client API**: Generate a Prisma-like client with CRUD operations (`findMany`, `create`, `update`, etc.) that map directly to Kysely queries while preserving familiar argument shapes
- **Relation loading**: Support `include` to fetch related records, parsing `@relation` attributes in schemas and generating properly typed relation fields, with relation filtering available via `where`. Architecture must accommodate nested writes without requiring a rewrite
- **Kysely integration**: Wrap a user-supplied Kysely dialect and expose the instance via `$kysely` for advanced scenarios; no hidden engines or connection pools
- **Programmatic migrations**: Provide `diff()` and `apply()` APIs that operate through Kysely, detect destructive changes, and track migration history
- **CLI workflow**: Offer `ork init`, `ork generate`, `ork migrate`, and validation commands that orchestrate config loading, schema parsing, and code generation
- **Vite-first generation**: Ship `unplugin-ork` to watch schemas, emit virtual `.ork/types` modules, and hot-update generated types in dev mode
- **Manual fallback path**: Allow type generation without the plugin (CLI command + explicit imports) to support non-Vite environments
- **Datasource support**: Provide first-class support for PostgreSQL and SQLite, with a clear path to additional Kysely dialects
- **Zod-style directives**: Recognize and preserve custom directives such as `@ork.validate(...)` within the AST for future runtime hooks

## Future Considerations

- **Incremental generation**: Only regenerate changed models
- **Plugin system**: Allow custom field transformations
- **Multi-file output**: Split large schemas across multiple files
- **Source maps**: Map generated code back to schema locations
