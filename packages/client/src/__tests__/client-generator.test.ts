/**
 * Tests for the client generator with FieldTranslator integration
 */

import type { AttributeAST, FieldAST, SchemaAST, Span } from '@ork-orm/schema-parser'
import { describe, expect, it } from 'vitest'

import { ClientGenerator } from '../client-generator.js'
import { unsupportedMessage } from '../unsupported.js'

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

/** How many times the generated module contains `snippet`. */
function emitCount(output: string, snippet: string): number {
  return output.split(snippet).length - 1
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

  it('re-exports OrkNotImplementedError so generated-client consumers can catch it', () => {
    const output = new ClientGenerator(mockSchema).generateClientModule()

    expect(output).toContain("import { OrkClientBase, OrkNotImplementedError } from '@ork-orm/client'")
    expect(output).toContain('export { OrkNotImplementedError }')
  })

  it('emits each unsupported-input guard exactly once regardless of model count', () => {
    const threeModels = makeSchema([
      {
        name: 'User',
        fields: [makeField('id', 'Int', { attributes: [makeAttr('id')] }), makeField('email', 'String')],
      },
      {
        name: 'Post',
        fields: [makeField('id', 'Int', { attributes: [makeAttr('id')] }), makeField('title', 'String')],
      },
      { name: 'Tag', fields: [makeField('id', 'Int', { attributes: [makeAttr('id')] }), makeField('label', 'String')] },
    ])
    const output = new ClientGenerator(threeModels).generateClientModule()

    for (const helper of [
      'function isFilterObject',
      'function assertNoSelect',
      'function assertNoIncludeOption',
      'function assertSupportedFindArgs',
      'function assertBooleanInclude',
      'function assertNoNestedWrites',
    ]) {
      expect(emitCount(output, helper), helper).toBe(1)
    }
  })

  it('guards select and include on every write and count method', () => {
    const output = new ClientGenerator(mockSchema).generateClientModule()

    for (const method of ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', 'count']) {
      expect(output).toContain(`assertNoIncludeOption(args, 'User.${method}')`)
    }

    // findMany, findFirst and count refuse cursor + distinct; findUnique accepts neither option in Prisma.
    expect(emitCount(output, 'assertSupportedFindArgs(args, { cursor: true, distinct: true })')).toBe(3)
    expect(emitCount(output, 'assertSupportedFindArgs(args, { cursor: false, distinct: false })')).toBe(1)
  })

  it('routes runtime refusals through registry ids instead of hand-written prose', () => {
    const schemaWithRelations = makeSchema([
      {
        name: 'User',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
          makeField('email', 'String'),
          makeField('posts', 'Post', { isList: true }),
        ],
      },
      {
        name: 'Post',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
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
    const output = new ClientGenerator(schemaWithRelations).generateClientModule()

    // The registry owns every message; the generator only names ids and details.
    expect(output).not.toContain('is not yet supported')
    expect(output).toContain("assertNoNestedWrites(data, ['posts'], 'User.create')")
    expect(output).toContain("assertNoNestedWrites(data, ['posts'], 'User.update')")
    expect(output).toContain("throw new OrkNotImplementedError('skip-duplicates')")
    expect(output).toContain("throw new OrkNotImplementedError('cursor-pagination')")
    expect(output).toContain("OrkNotImplementedError('relation-filter-shape', 'on relation \"posts\"')")
    expect(output).toContain("OrkNotImplementedError('case-insensitive-mode'")
    expect(output).not.toContain('Unsupported filter shape for relation')

    // An unrecognized key inside a field filter used to be dropped silently.
    expect(output).toContain("throw new OrkNotImplementedError('filter-operator',")
    expect(output).toContain("case 'mode':")
    // Caller mistakes stay plain errors — they are not unimplemented features.
    expect(output).toContain("throw new Error('Unknown relation \"' + field + '\" in where clause')")
  })

  it('declares no option that always throws', () => {
    const output = new ClientGenerator(mockSchema).generateClientModule()

    // Phantom declarations: the type promised an option the runtime refuses.
    expect(output).not.toContain('skipDuplicates?: boolean')
    // ...but the runtime guard stays for untyped and Prisma-migrating callers.
    expect(output).toContain('(args as Record<string, unknown>).skipDuplicates')
    expect(output).not.toContain('not?: BaseFilter<T> | T')
    expect(output).toContain('not?: T')
    // Dead `any`-typed interface implemented by nothing.
    expect(output).not.toContain('ModelCRUDOperations')
  })

  it('reports schema-level unsupported features with registry ids and actionable reasons', () => {
    const schema = makeSchema([
      {
        name: 'User',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
          makeField('tags', 'String', { isList: true }),
          makeField('avatar', 'Bytes'),
        ],
      },
    ])

    const unsupported = new ClientGenerator(schema).getUnsupportedFields()

    expect(unsupported).toEqual([
      {
        model: 'User',
        field: 'tags',
        feature: 'scalar-list-fields',
        reason: unsupportedMessage('scalar-list-fields', '(String[])'),
      },
      {
        model: 'User',
        field: 'avatar',
        feature: 'unsupported-field-type',
        reason: unsupportedMessage('unsupported-field-type', "'Bytes' on the 'sqlite' dialect"),
      },
    ])
    // The registry owns the prose; these assert the concrete offender reaches the message.
    expect(unsupported[0].reason).toContain('String[]')
    expect(unsupported[1].reason).toContain("'Bytes'")
  })

  it('reports implicit many-to-many relations as unsupported', () => {
    const schema = makeSchema([
      {
        name: 'User',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
          makeField('groups', 'Group', { isList: true }),
        ],
      },
      {
        name: 'Group',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
          makeField('users', 'User', { isList: true }),
        ],
      },
    ])

    const unsupported = new ClientGenerator(schema).getUnsupportedFields()

    expect(unsupported).toEqual([
      {
        model: 'User',
        field: 'groups',
        feature: 'implicit-many-to-many',
        reason: unsupportedMessage('implicit-many-to-many', 'to Group'),
      },
      {
        model: 'Group',
        field: 'users',
        feature: 'implicit-many-to-many',
        reason: unsupportedMessage('implicit-many-to-many', 'to User'),
      },
    ])
  })

  it('does not mistake a self-relation with an explicit foreign key for implicit many-to-many', () => {
    const hierarchy = makeAttr('relation', [{ value: 'CategoryHierarchy' }])
    const schema = makeSchema([
      {
        name: 'Category',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
          makeField('parentId', 'Int', { isOptional: true }),
          makeField('parent', 'Category', {
            isOptional: true,
            attributes: [
              makeAttr('relation', [
                { value: 'CategoryHierarchy' },
                { name: 'fields', value: ['parentId'] },
                { name: 'references', value: ['id'] },
              ]),
            ],
          }),
          makeField('children', 'Category', { isList: true, attributes: [hierarchy] }),
        ],
      },
    ])

    expect(new ClientGenerator(schema).getUnsupportedFields()).toEqual([])
  })

  it('reports a self-referential implicit many-to-many relation', () => {
    const follows = makeAttr('relation', [{ value: 'Follows' }])
    const schema = makeSchema([
      {
        name: 'User',
        fields: [
          makeField('id', 'Int', { attributes: [makeAttr('id')] }),
          makeField('followers', 'User', { isList: true, attributes: [follows] }),
          makeField('following', 'User', { isList: true, attributes: [follows] }),
        ],
      },
    ])

    expect(new ClientGenerator(schema).getUnsupportedFields().map((u) => `${u.model}.${u.field}`)).toEqual([
      'User.followers',
      'User.following',
    ])
  })
})
