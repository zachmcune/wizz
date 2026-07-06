# AGENTS.md

Arcane Dominion — a mobile-first PWA real-time strategy game (TypeScript + Vite + PixiJS,
tested with Vitest). It is a static, client-only single-player app; there is no backend or
database to run.

## Cursor Cloud specific instructions

- Single service only: the Vite dev server. Standard scripts are in `package.json` and the
  `README.md` quick start; use those rather than duplicating commands here:
  - `npm run dev` — dev server on `http://localhost:5173/` (bound to localhost only; add
    `-- --host` if you need to reach it from another device/emulator).
  - `npm run lint` / `npm run typecheck` / `npm test` / `npm run build`.
- `npm run build` runs `tsc --noEmit` first, then `vite build`; a type error fails the build
  even though the app itself is JS-agnostic at runtime.
- Tests run headless in Node via `vitest.config.ts` (kept separate from `vite.config.ts` to
  avoid the `vite-plugin-pwa` plugin-type clash). `tests/balance.test.ts` runs AI-vs-AI
  matches and takes several seconds — that is expected, not a hang.
- Determinism guard: ESLint forbids `src/sim/**` from importing render/ui/audio/input/storage
  layers or using `Math.random`, `Date.now`, `window`, `document`, `performance`. Keep the
  simulation core pure/headless or `npm run lint` will fail.
- The game is landscape/touch-first but works with mouse: from the main menu click
  "Skirmish (1v1)", then click a unit to select and click elsewhere to issue a move command.
