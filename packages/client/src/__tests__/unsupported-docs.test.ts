/**
 * Keeps the human-readable "Not yet supported" list in the repo-root README.md
 * generated from `packages/client/src/unsupported.ts` instead of hand-maintained.
 *
 * The README block between the markers below is rendered from
 * `UNSUPPORTED_FEATURES`, so the docs cannot drift from the code that enforces
 * them. When the registry changes, re-run this file with `ORK_UPDATE_DOCS=1` and
 * it rewrites the block in place:
 *
 *   ORK_UPDATE_DOCS=1 pnpm --filter @ork-orm/client test unsupported-docs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { UNSUPPORTED_FEATURES, type UnsupportedEnforcement } from '../unsupported.js'

const BEGIN_MARKER = '<!-- BEGIN GENERATED: unsupported (source: packages/client/src/unsupported.ts) -->'
const END_MARKER = '<!-- END GENERATED: unsupported -->'

// Resolved from this file, not the CWD, so the assertion is identical whether
// vitest runs from the package or the workspace root.
const README_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..', 'README.md')

/** How each enforcement mode surfaces to a user, in the docs' own words. */
const FAILURE_MODE: Record<UnsupportedEnforcement, string> = {
  'runtime-throw': 'throws `OrkNotImplementedError` at runtime',
  'generation-error': '`ork generate` fails',
  'api-absent': 'not present on the client (TypeScript error)',
}

const TRACKER_ISSUE_URL = 'https://github.com/jharrell/ork-tracker/issues'

/**
 * Render the registry as a Markdown table, in registry order.
 *
 * Cells are padded to the widest cell in their column (minimum 3), which is what
 * Prettier's Markdown table printer emits. That keeps `pnpm format` a no-op on
 * the generated block, so the byte-for-byte assertion below stays honest.
 */
function renderUnsupportedTable(): string {
  const header = ['Feature', 'How it fails', 'Workaround', 'Tracking']
  const rows = UNSUPPORTED_FEATURES.map((feature) => [
    feature.title,
    FAILURE_MODE[feature.enforcement],
    feature.hint,
    feature.tracking === undefined ? '—' : `[#${feature.tracking}](${TRACKER_ISSUE_URL}/${feature.tracking})`,
  ])

  const widths = header.map((_, i) => Math.max(3, ...[header, ...rows].map((cells) => cells[i].length)))
  const line = (cells: string[]): string => `| ${cells.map((cell, i) => cell.padEnd(widths[i])).join(' | ')} |`
  const separator = widths.map((width) => '-'.repeat(width))

  return [line(header), line(separator), ...rows.map(line)].join('\n')
}

/** Marker-to-marker block, blank-line separated so Prettier leaves it alone. */
const EXPECTED_BLOCK = [BEGIN_MARKER, '', renderUnsupportedTable(), '', END_MARKER].join('\n')

describe('generated unsupported-feature docs', () => {
  it('has exactly one marker pair in README.md', () => {
    const readme = readFileSync(README_PATH, 'utf8')
    expect(readme.split(BEGIN_MARKER).length - 1, `${README_PATH} must contain exactly one BEGIN marker`).toBe(1)
    expect(readme.split(END_MARKER).length - 1, `${README_PATH} must contain exactly one END marker`).toBe(1)
  })

  it('renders the README block from UNSUPPORTED_FEATURES', () => {
    const readme = readFileSync(README_PATH, 'utf8')
    const start = readme.indexOf(BEGIN_MARKER)
    const end = readme.indexOf(END_MARKER)

    expect(start, `BEGIN marker missing from ${README_PATH}: ${BEGIN_MARKER}`).toBeGreaterThanOrEqual(0)
    expect(end, `END marker missing from or misordered in ${README_PATH}: ${END_MARKER}`).toBeGreaterThan(start)

    const actual = readme.slice(start, end + END_MARKER.length)

    if (process.env.ORK_UPDATE_DOCS) {
      writeFileSync(README_PATH, `${readme.slice(0, start)}${EXPECTED_BLOCK}${readme.slice(end + END_MARKER.length)}`)
      const updated = readFileSync(README_PATH, 'utf8')
      const rewritten = updated.slice(updated.indexOf(BEGIN_MARKER), updated.indexOf(END_MARKER) + END_MARKER.length)
      expect(rewritten).toBe(EXPECTED_BLOCK)
      return
    }

    expect(
      actual,
      [
        'The generated "Not yet supported" block in README.md is out of date.',
        'It is rendered from UNSUPPORTED_FEATURES in packages/client/src/unsupported.ts; do not edit it by hand.',
        'Regenerate it with:',
        '  ORK_UPDATE_DOCS=1 pnpm --filter @ork-orm/client test unsupported-docs',
      ].join('\n'),
    ).toBe(EXPECTED_BLOCK)
  })
})
