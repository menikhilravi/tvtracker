import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts: the app config loads the React and
// PWA plugins, none of which these tests need. The suite covers pure logic only
// — no DOM, no network, no Supabase — so it stays fast and has nothing to mock.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
