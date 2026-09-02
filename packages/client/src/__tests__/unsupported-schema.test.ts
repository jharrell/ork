/**
 * Conformance suite for the schema-surface half of Ork's unsupported-feature
 * registry: the entries whose `enforcement` is `'generation-error'`.
 *
 * These features cannot be caught at query time — the generator would have to
 * emit a client that lies about storage or compiles to nonsense SQL. Instead
 * `ClientGenerator.getUnsupportedFields()` reports them and `ork generate` fails.
 * Each case here builds the smallest schema that provokes one registry entry and
 * asserts the report is tagged with that entry's id; the ratchet at the bottom
 * asserts SET EQUALITY with the registry, so a new `generation-error` entry
 * cannot land without a case and a case cannot outlive its entry.
 *
 * The `makeAttr`/`makeField`/`makeSchema` helpers mirror the ones in
 * `client-generator.test.ts`; they are duplicated rather than shared because a
 * hand-built `SchemaAST` is the point of both files and neither owns the other.
 */

import type { AttributeAST, FieldAST, SchemaAST, Span } from '@ork-orm/schema-parser'
import { describe, expect, it } from 'vitest'

import { ClientGenerator } from '../client-generator.js'
import { UNSUPPORTED_FEATURES, unsupportedFeature, type UnsupportedFeatureId } from '../unsupported.js'

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

/** `id Int @id @default(autoincrement())`, present in every fixture schema below. */
function idField(): FieldAST {
  return makeField('id', 'Int', { attributes: [makeAttr('id'), makeAttr('default', [{ value: 'autoincrement()' }])] })
}

/** Both dialects support the same scalar set, so every case is asserted on both. */
const DIALECTS = ['postgresql', 'sqlite'] as const

interface SchemaCase {
  /** The registry entry this case enforces. Feeds the completeness ratchet below. */
  feature: UnsupportedFeatureId
  name: string
  schema: SchemaAST
  /** The `model.field` the report must point at. */
  model: string
  field: string
}

const CASES: SchemaCase[] = [
  {
    feature: 'scalar-list-fields',
    name: 'reports a scalar list field, which has no correct storage yet',
    schema: makeSchema([{ name: 'Post', fields: [idField(), makeField('tags', 'String', { isList: true })] }]),
    model: 'Post',
    field: 'tags',
  },
  {
    feature: 'implicit-many-to-many',
    name: 'reports an implicit many-to-many relation, which has no join table',
    schema: makeSchema([
      { name: 'Post', fields: [idField(), makeField('categories', 'Category', { isList: true })] },
      { name: 'Category', fields: [idField(), makeField('posts', 'Post', { isList: true })] },
    ]),
    model: 'Post',
    field: 'categories',
  },
  {
    feature: 'unsupported-field-type',
    name: 'reports a field type the dialect cannot translate',
    schema: makeSchema([{ name: 'Upload', fields: [idField(), makeField('payload', 'Bytes')] }]),
    model: 'Upload',
    field: 'payload',
  },
]

describe.each(DIALECTS)('unsupported schema features [%s]', (dialect) => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      const reported = new ClientGenerator(testCase.schema, { dialect }).getUnsupportedFields()

      const entry = reported.find((item) => item.model === testCase.model && item.field === testCase.field)
      expect(entry, `${testCase.model}.${testCase.field} must be reported as unsupported`).toBeDefined()
      expect(entry?.feature).toBe(testCase.feature)

      // `reason` is rendered from the registry entry, so generation errors and
      // runtime errors say the same thing about the same feature.
      const registryEntry = unsupportedFeature(testCase.feature)
      expect(entry?.reason).toContain(registryEntry.title)
      expect(entry?.reason).toContain(registryEntry.hint)
    })
  }

  it('reports nothing for a schema built entirely from supported features', () => {
    const schema = makeSchema([
      {
        name: 'User',
        fields: [
          idField(),
          makeField('email', 'String', { attributes: [makeAttr('unique')] }),
          makeField('name', 'String', { isOptional: true }),
          makeField('score', 'BigInt'),
          makeField('settings', 'Json', { isOptional: true }),
          makeField('createdAt', 'DateTime', { attributes: [makeAttr('default', [{ value: 'now()' }])] }),
          makeField('active', 'Boolean'),
          makeField('posts', 'Post', { isList: true }),
        ],
      },
      {
        name: 'Post',
        fields: [
          idField(),
          makeField('title', 'String'),
          makeField('authorId', 'Int'),
          makeField('author', 'User', {
            attributes: [
              makeAttr('relation', [
                { name: 'fields', value: ['authorId'] },
                { name: 'references', value: ['id'] },
              ]),
            ],
          }),
        ],
      },
    ])

    expect(new ClientGenerator(schema, { dialect }).getUnsupportedFields()).toEqual([])
  })
})

describe('unsupported-schema coverage ratchet', () => {
  it('covers exactly the generation-time entries of UNSUPPORTED_FEATURES', () => {
    const enforcedHere = UNSUPPORTED_FEATURES.filter((feature) => feature.enforcement === 'generation-error').map(
      (feature) => feature.id,
    )
    const covered = [...new Set(CASES.map((testCase) => testCase.feature))]

    const missing = enforcedHere.filter((id) => !covered.includes(id))
    const orphaned = covered.filter((id) => !enforcedHere.includes(id))

    const guidance = [
      "This suite must cover the 'generation-error' half of UNSUPPORTED_FEATURES exactly.",
      missing.length > 0
        ? `Not enforced by any case: ${missing.join(', ')}. Add a case to CASES in this file whose schema provokes ` +
          'the report (or, if the generator now supports the feature, drop its entry from UNSUPPORTED_FEATURES in ' +
          'packages/client/src/unsupported.ts).'
        : '',
      orphaned.length > 0
        ? `Tagged by a case but not a generation error in the registry: ${orphaned.join(', ')}. Either the feature ` +
          'shipped (delete the case) or the id was renamed or re-classified (update the tag, and note that ' +
          "'runtime-throw' and 'api-absent' ids belong in corpus/unsupported-inputs.matrix.test.ts instead)."
        : '',
    ]
      .filter(Boolean)
      .join('\n')

    expect({ missing, orphaned }, guidance).toEqual({ missing: [], orphaned: [] })
  })
})
