/**
 * Tests for the client generator with FieldTranslator integration
 */

import type { AttributeAST, FieldAST, SchemaAST, Span } from '@ork-orm/schema-parser'
import { describe, expect, it } from 'vitest'

import { ClientGenerator } from '../client-generator.js'

const dummySpan: Span = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }

function makeAttr(
  name: string,
  args: Array<{ name?: string; value: string | number | boolean | Array<string | number | boolean> }> = [],
): AttributeAST {
  return {
    type: 'Attribute',
    span: dummySpan,
    name,
    args: args.map((a) => ({
      type: 'AttributeArgument',
      span: dummySpan,
      name: a.name,
      value: a.value,
    })),
  }
}

function makeField(
  name: string,
  fieldType: string,
  opts: { isOptional?: boolean; isList?: boolean; attributes?: AttributeAST[] } = {},
): FieldAST {
  return {
    type: 'Field',
    span: dummySpan,
    name,
    fieldType,
    isOptional: opts.isOptional ?? false,
    isList: opts.isList ?? false,
    attributes: opts.attributes ?? [],
  }
}

function makeSchema(models: Array<{ name: string; fields: FieldAST[]; attributes?: AttributeAST[] }>): SchemaAST {
  return {
    type: 'Schema',
    span: dummySpan,
    datasources: [],
    generators: [],
    enums: [],
    types: [],
    views: [],
    models: models.map((m) => ({
      type: 'Model',
      span: dummySpan,
      name: m.name,
      attributes: m.attributes ?? [],
      fields: m.fields,
    })),
  }
}

describe('ClientGenerator', () => {
  const mockSchema = makeSchema([
    {
      name: 'User',
      fields: [
        makeField('id', 'Int', { attributes: [makeAttr('id')] }),
        makeField('email', 'String'),
        makeField('isActive', 'Boolean'),
        makeField('createdAt', 'DateTime'),
      ],
    },
  ])

  it('should generate client with SQLite transformations by default', () => {
    const generator = new ClientGenerator(mockSchema)
    const output = generator.generateClientModule()

    expect(output).toContain('Database dialect: sqlite')

    // Should contain SQLite boolean transformations (? 1 : 0)
    expect(output).toContain('? 1 : 0')

    // Should contain DateTime transformations
    expect(output).toContain('toISOString()')
  })

  it('should generate client with PostgreSQL transformations when specified', () => {
    const generator = new ClientGenerator(mockSchema, {
      dialect: 'postgresql',
    })
    const output = generator.generateClientModule()

    expect(output).toContain('Database dialect: postgresql')

    // PostgreSQL doesn't need boolean transformation
    expect(output).not.toContain('? 1 : 0')
  })

  it('should generate client with MySQL transformations when specified', () => {
    const generator = new ClientGenerator(mockSchema, {
      dialect: 'mysql',
    })
    const output = generator.generateClientModule()

    expect(output).toContain('Database dialect: mysql')

    // MySQL uses TINYINT for booleans, so should have transformations
    expect(output).toContain('? 1 : 0')
  })

  it('should detect dialect from config', () => {
    const generator = new ClientGenerator(mockSchema, {
      config: {
        database: {
          provider: 'postgresql',
          url: 'postgresql://localhost/test',
        },
      },
    })
    const output = generator.generateClientModule()

    expect(output).toContain('Database dialect: postgresql')
  })

  it('should generate CRUD operations with transformations', () => {
    const generator = new ClientGenerator(mockSchema)
    const output = generator.generateClientModule()

    // Should have all CRUD operations
    expect(output).toContain('async findMany<T extends')
    expect(output).toContain('async findUnique<T extends')
    expect(output).toContain('async create(')
    expect(output).toContain('async update(')
    expect(output).toContain('async delete(')

    // Should have transformation methods
    expect(output).toContain('prepareCreateData(')
    expect(output).toContain('prepareUpdateData(')
    expect(output).toContain('transformSelectResult(')
    expect(output).toContain('transformWhereValue_')
  })

  it('keys timestamp defaults on attributes, not field names', () => {
    const schema = makeSchema([
      {
        name: 'Post',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
          makeField('title', 'String'),
          makeField('createdAt', 'DateTime', { attributes: [makeAttr('default')] }),
          makeField('updatedAt', 'DateTime', { attributes: [makeAttr('updatedAt')] }),
        ],
      },
    ])
    const output = new ClientGenerator(schema).generateClientModule()

    // @default(now()) fills in only when the caller passed no value (explicit wins).
    expect(output).toContain('if (data.createdAt === undefined) { prepared.createdAt = new Date().toISOString() }')
    // @updatedAt is always refreshed by the client.
    expect(output).toContain('prepared.updatedAt = new Date().toISOString()')
    // The old field-name-based hack is gone.
    expect(output).not.toContain('data.createdAt ? new Date(data.createdAt)')
  })

  it('should generate client class with model operations', () => {
    const generator = new ClientGenerator(mockSchema)
    const output = generator.generateClientModule()

    expect(output).toContain('export class OrkClient extends OrkClientBase')
    expect(output).toContain('declare readonly user: UserOperations')
    expect(output).toContain('super(dialect, { modelFactory: createModelOperations, log: options?.log })')
    expect(output).toContain('const createModelOperations = (kysely: Kysely<DatabaseSchema>) => ({')
  })

  it('should generate factory function', () => {
    const generator = new ClientGenerator(mockSchema)
    const output = generator.generateClientModule()

    expect(output).toContain('export function createOrkClient(dialect: Dialect, options?: OrkClientOptions): OrkClient')
  })

  it('should generate relation include types and logic', () => {
    const schemaWithRelations = makeSchema([
      {
        name: 'User',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
          makeField('name', 'String'),
          makeField('posts', 'Post', { isList: true }),
        ],
      },
      {
        name: 'Post',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
          makeField('title', 'String'),
          makeField('userId', 'Int'),
          makeField('user', 'User', {
            attributes: [
              makeAttr('relation', [
                { name: 'fields', value: ['userId'] },
                { name: 'references', value: ['id'] },
              ]),
            ],
          }),
        ],
      },
    ])

    const generator = new ClientGenerator(schemaWithRelations)
    const output = generator.generateClientModule()

    // Should generate include types
    expect(output).toContain('export interface PostInclude')
    expect(output).toContain('user?: boolean')

    // Should include include parameter in operations
    expect(output).toContain('include?: PostInclude')

    // Should generate include logic
    expect(output).toContain('.$if(')
    expect(output).toContain('leftJoin(')
    expect(output).toContain('transformSelectResultWithIncludes(')

    // Should handle relation transformation
    expect(output).toContain('relations.find')
  })
})
