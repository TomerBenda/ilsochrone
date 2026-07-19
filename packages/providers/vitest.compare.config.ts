import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/compare-ors.test.ts'],
    environment: 'node',
    testTimeout: 600_000,
  },
});
