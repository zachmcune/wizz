import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts to avoid the vite-plugin-pwa plugin-type clash with
// vitest's bundled Vite. Tests run headless in Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
