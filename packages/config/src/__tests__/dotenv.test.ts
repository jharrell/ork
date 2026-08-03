import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadOrkConfig } from '../config-loader.js'

describe('loadOrkConfig .env support', () => {
  let dir: string

  afterEach(() => {
    delete process.env.ORK_TEST_ENV_LOADS
    delete process.env.ORK_TEST_ENV_PRECEDENCE
    rmSync(dir, { recursive: true, force: true })
  })

  it('loads DATABASE_URL from .env', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ork-config-dotenv-'))
    writeFileSync(join(dir, '.env'), 'ORK_TEST_ENV_LOADS=file:./from-dotenv.db\n')
    writeFileSync(
      join(dir, 'ork.config.mjs'),
      'export default { datasource: { provider: "sqlite", url: process.env.ORK_TEST_ENV_LOADS } }\n',
    )

    const { config } = await loadOrkConfig({ cwd: dir })
    expect(config.datasource.url).toBe('file:./from-dotenv.db')
  })

  it('prefers a real env var over the same key in .env', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ork-config-dotenv-'))
    writeFileSync(join(dir, '.env'), 'ORK_TEST_ENV_PRECEDENCE=file:./from-dotenv.db\n')
    writeFileSync(
      join(dir, 'ork.config.mjs'),
      'export default { datasource: { provider: "sqlite", url: process.env.ORK_TEST_ENV_PRECEDENCE } }\n',
    )
    process.env.ORK_TEST_ENV_PRECEDENCE = 'file:./from-real-env.db'

    const { config } = await loadOrkConfig({ cwd: dir })
    expect(config.datasource.url).toBe('file:./from-real-env.db')
  })
})
