import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Output-assertion tests match on plain strings; keep colors off so results
    // don't depend on the caller's FORCE_COLOR/TERM.
    env: { NO_COLOR: '1' },
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
