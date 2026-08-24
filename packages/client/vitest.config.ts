import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // Testcontainers can take time to start
    hookTimeout: 30000,
    include: ['src/__tests__/**/*.test.ts'],
    // Regenerate both dialect fixtures once, before any worker spawns, instead of
    // per-worker on import (which raced and could import a stale client). See #52.
    globalSetup: ['./src/__tests__/helpers/global-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**'],
  },
})
