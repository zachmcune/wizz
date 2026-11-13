import { defineConfig } from 'vitest/config';

// v2 test config, separate from the v1 root config so the two suites never mix.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
});
