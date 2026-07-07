# Conventions

## Stack (pinned)

Node 20+, npm, TypeScript 5 (`strict`, `noUncheckedIndexedAccess`), Vite, vite-plugin-pwa,
PixiJS v8, Zod, idb-keyval, Vitest, ESLint. No game engine, physics lib, ECS framework, or
state-management lib — everything gameplay is hand-rolled.

## Scripts

- `npm run dev` — Vite dev server.
- `npm run build` — typecheck + production build to `dist/`.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint (includes the sim import guard).
- `npm test` — Vitest headless tests (excludes slow balance harness).
- `npm run test:slow` — AI balance harness only (~45s).
- `npm run test:full` — all tests including balance harness.
- `npm run test:e2e` — Playwright smoke test (starts dev server automatically).

Every task must end green: `npm run typecheck && npm run lint && npm test`.

## Naming

Files `kebab-case.ts`; types `PascalCase`; funcs/vars `camelCase`; data ids `snake_case`; constants `UPPER_SNAKE`.

## Coordinates

`TILE = 32` world units. Convert only through `src/core/coords.ts`
(`worldToTile`, `tileToWorld`, `worldToScreen`, `screenToWorld`). The sim uses world units only.

## Rules of thumb

- Mutate gameplay state only via commands processed in `applyCommands`.
- Small steps; keep functions short; avoid premature abstraction and new dependencies.
- Add placeholder art via `shape` in the data file; do not commit binary sprite assets.
- New player-facing controls must be declared in `src/input/actions.ts` with a desktop binding
  (`mouse` or `keyboard`); `tests/input-parity.test.ts` enforces this.
