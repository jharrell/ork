import { generateTestClient } from './generate-test-client'

/**
 * Vitest globalSetup: regenerate BOTH dialect fixtures from the shared
 * `schema.prisma` exactly once, in the main process, before any worker spawns.
 *
 * This is the fix for the fixture-regeneration race called out in ork-tracker#52:
 * previously each worker regenerated the fixture on import, so 8 workers wrote and
 * read the same files concurrently and a run could import a stale client (false
 * pass). Generating up front here means workers only ever import a settled file.
 */
export default function setup(): void {
  generateTestClient({ dialect: 'postgresql' })
  generateTestClient({ dialect: 'sqlite' })
}
