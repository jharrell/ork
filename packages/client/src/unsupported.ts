/**
 * The single source of truth for Ork's unsupported-feature universe.
 *
 * Every place that talks about a feature Ork alpha does not implement derives from
 * `UNSUPPORTED_FEATURES` in this file:
 * - runtime throw sites in the generated client reference registry ids,
 * - the conformance corpus asserts that each entry is actually enforced,
 * - the schema-generation checks report unsupported schema constructs by id,
 * - the human-readable list in README.md is generated from this registry and its
 *   freshness is enforced by a test.
 *
 * Consequences of that arrangement, which are the point of it:
 * - Adding an entry requires adding an enforcement test for it.
 * - Implementing a feature means deleting its entry; the coverage tests then fail
 *   until the enforcement site and the generated docs block are updated too.
 *
 * See jharrell/ork-tracker#9 (every unimplemented input must throw a NotImplemented
 * error naming the feature) and jharrell/ork-tracker#58 (the unsupported-feature list
 * must be a machine-checked artifact with a single source of truth in code).
 */

/**
 * How a feature's absence is made observable to the user.
 * - `runtime-throw`: the generated client throws `OrkNotImplementedError` when the input is used.
 * - `generation-error`: client generation reports the schema construct and refuses to support it.
 * - `api-absent`: the method simply does not exist on the client surface.
 */
export type UnsupportedEnforcement = 'runtime-throw' | 'generation-error' | 'api-absent'

export type UnsupportedFeatureId =
  | 'select'
  | 'nested-include'
  | 'include-unavailable'
  | 'nested-write'
  | 'cursor-pagination'
  | 'distinct'
  | 'skip-duplicates'
  | 'case-insensitive-mode'
  | 'filter-operator'
  | 'relation-filter-shape'
  | 'aggregate'
  | 'group-by'
  | 'raw-queries'
  | 'scalar-list-fields'
  | 'implicit-many-to-many'
  | 'unsupported-field-type'

export interface UnsupportedFeature {
  readonly id: UnsupportedFeatureId
  /** Noun phrase used as the subject of the error message and the docs row. */
  readonly title: string
  /** What to do instead. Always a complete sentence. */
  readonly hint: string
  readonly enforcement: UnsupportedEnforcement
  /** jharrell/ork-tracker issue number, when one is known. */
  readonly tracking?: number
}

export const UNSUPPORTED_FEATURES: readonly UnsupportedFeature[] = [
  {
    id: 'select',
    title: "The 'select' option",
    hint: 'Use $kysely for partial column projections.',
    enforcement: 'runtime-throw',
  },
  {
    id: 'nested-include',
    title: 'Object-form include with arguments',
    hint: 'Only boolean relation flags (e.g. { include: { posts: true } }) are supported.',
    enforcement: 'runtime-throw',
  },
  {
    id: 'include-unavailable',
    title: "The 'include' option where relation loading is unavailable",
    hint: 'Only findMany, findFirst, and findUnique load relations, and only on models that declare them.',
    enforcement: 'runtime-throw',
  },
  {
    id: 'nested-write',
    title: 'Nested write',
    hint: 'Create, connect, or update related records in separate calls.',
    enforcement: 'runtime-throw',
  },
  {
    id: 'cursor-pagination',
    title: "Cursor-based pagination ('cursor')",
    hint: "Use offset pagination ('skip' and 'take') instead.",
    enforcement: 'runtime-throw',
  },
  {
    id: 'distinct',
    title: "The 'distinct' option",
    hint: 'Use $kysely for distinct queries.',
    enforcement: 'runtime-throw',
  },
  {
    id: 'skip-duplicates',
    title: "The 'skipDuplicates' option in createMany",
    hint: 'Insert rows individually with upsert, or use $kysely.',
    enforcement: 'runtime-throw',
  },
  {
    id: 'case-insensitive-mode',
    title: "Case-insensitive filtering (mode: 'insensitive')",
    hint: 'Normalize casing in the column or use $kysely.',
    enforcement: 'runtime-throw',
  },
  {
    id: 'filter-operator',
    title: 'Filter operator',
    hint: 'Use a supported operator (equals, not, in, notIn, lt, lte, gt, gte, contains, startsWith, endsWith) or use $kysely.',
    enforcement: 'runtime-throw',
  },
  {
    id: 'relation-filter-shape',
    title: 'Relation filter shape',
    hint: 'Use some, every, or none on list relations, or is / isNot on single relations.',
    enforcement: 'runtime-throw',
  },
  {
    id: 'aggregate',
    title: 'Aggregations (aggregate)',
    hint: 'Use $kysely for aggregate queries.',
    enforcement: 'api-absent',
  },
  {
    id: 'group-by',
    title: 'Grouping (groupBy)',
    hint: 'Use $kysely for grouped queries.',
    enforcement: 'api-absent',
  },
  {
    id: 'raw-queries',
    title: 'Raw queries ($queryRaw / $executeRaw)',
    hint: 'Use $kysely.sql for raw SQL.',
    enforcement: 'api-absent',
    tracking: 68,
  },
  {
    id: 'scalar-list-fields',
    title: 'Scalar list field',
    hint: 'Model the list as a related table, or store it as a JSON string.',
    enforcement: 'generation-error',
    tracking: 8,
  },
  {
    id: 'implicit-many-to-many',
    title: 'Implicit many-to-many relation',
    hint: 'Declare an explicit join model with two relation fields.',
    enforcement: 'generation-error',
    tracking: 13,
  },
  {
    id: 'unsupported-field-type',
    title: 'Field type',
    hint: 'Use a scalar type the dialect supports, or store the value as a string.',
    enforcement: 'generation-error',
  },
]

/** Built once at module load so throw sites never pay a linear scan. */
const FEATURES_BY_ID: Record<string, UnsupportedFeature | undefined> = Object.fromEntries(
  UNSUPPORTED_FEATURES.map((feature) => [feature.id, feature]),
)

/**
 * Look up a registry entry by id.
 * An unknown id is a programming error (the id type is closed), so this throws a plain `Error`.
 */
export function unsupportedFeature(id: UnsupportedFeatureId): UnsupportedFeature {
  const feature = Object.hasOwn(FEATURES_BY_ID, id) ? FEATURES_BY_ID[id] : undefined
  if (!feature) {
    throw new Error(`Unknown unsupported-feature id: ${id}. Add it to UNSUPPORTED_FEATURES in unsupported.ts.`)
  }
  return feature
}

/**
 * The one place unsupported-feature prose is assembled. Both the runtime
 * `OrkNotImplementedError` and the generator's schema-abort reasons render
 * through this, so a user sees identical wording whichever surface they hit.
 * `detail` names the concrete relation/field/operator/dialect.
 */
export function unsupportedMessage(id: UnsupportedFeatureId, detail?: string): string {
  const feature = unsupportedFeature(id)
  const tracking = feature.tracking ? ` See https://github.com/jharrell/ork-tracker/issues/${feature.tracking}.` : ''
  return `${feature.title}${detail ? ` ${detail}` : ''} is not yet supported in Ork alpha. ${feature.hint}${tracking}`
}

/**
 * Error thrown when an unimplemented Prisma feature or option is used at runtime.
 * The message always names the feature; `feature` carries the registry id so callers
 * and tests can branch on it without matching message text.
 */
export class OrkNotImplementedError extends Error {
  readonly feature: UnsupportedFeatureId

  constructor(feature: UnsupportedFeatureId, detail?: string) {
    super(unsupportedMessage(feature, detail))
    this.name = 'OrkNotImplementedError'
    this.feature = feature
  }
}
