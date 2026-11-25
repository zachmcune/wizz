import { defineConfig } from '@playwright/test';

// Playwright config for the v2 BROWSER proofs — the multiplayer two-context match and any future end-to-end
// evidence. Separate from the Vitest configuration on purpose:
//
//   • Vitest runs the simulation, unit and component tests, and the Phase 4 UI gates (which it drives with its
//     own Playwright import inside a Vitest test).
//   • This config runs only `*.spec.ts` files under `tests/`, i.e. the specs that need a real relay and a real
//     dev server rather than a mocked transport.
//
// The timeout is generous because these specs open a WebSocket, start a match and sample a running simulation;
// a 30 s default measures the harness rather than the product. `MP_PLAY_SECONDS` controls how long the match is
// allowed to run, so a quick local check and a fuller proof run use the same spec.
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,
  // A single worker: these specs bind real ports and a shared relay room namespace, and two concurrent matches
  // in one room id would collide.
  workers: 1,
  fullyParallel: false,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: [['line']],
  use: {
    trace: 'off',
    video: 'off',
  },
});
