import { defineConfig } from 'vitest/config';

// v2 test config, separate from the v1 root config so the two suites never mix.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
    /**
     * THE BROWSER SUITES ARE SERIALISED, AND IT IS NOT A TUNING DETAIL.
     *
     * The files under `tests/touch/` and `tests/ui-camera.test.ts` / `tests/ui-phase4.test.ts` each launch
     * their own Chromium and drive a WebGL canvas through SwiftShader, which is CPU-bound. Vitest's default
     * runs files in parallel up to the core count, so on a 4-core CI runner several Playwright sessions
     * competed and a single `page.screenshot` measured **173 seconds** — reported as a timeout rather than
     * as a slow machine. The run below therefore uses `singleThread` for the files that open a browser,
     * which the `npm run test:browser-gates` script selects.
     *
     * Pure unit suites stay parallel and are unaffected.
     */
  },
});
