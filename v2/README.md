# v2 — Arcane Dominion rebuild

This folder is the **new, separately built codebase** for Arcane Dominion v2.

**Phase 0 (current state): docs and audit artifacts only. No game code has been written yet.**

| Path | What it is |
|---|---|
| [`docs/FEATURE_INVENTORY.md`](docs/FEATURE_INVENTORY.md) | Complete checklist of every v1 feature, each pointing at the v1 file that implements it. This is the "nothing gets lost" contract. |
| [`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md) | Architecture, AI redesign, visual direction, recommended rule changes with reasoning, measured performance baselines, test/proof strategy, phased plan with done-criteria, audit findings and evidence index. |
| [`docs/baseline-screenshots/`](docs/baseline-screenshots/) | 58 baseline screenshots of the **current** game at 667×375, 844×390, 1366×768 and 1920×1080. |
| [`docs/baseline-perf.json`](docs/baseline-perf.json) | Raw frame-pacing measurements behind §2.2 of the plan. |
| [`audit/`](audit/) | The throwaway harnesses used to produce the audit. Not shipped. Kept runnable so every number in the plan can be reproduced. |

## Important

The current game lives in the repository root (`src/`, `data/`, `tests/`, `e2e/`) and is **untouched**
by this work. Nothing in `v2/` is imported by it, and `v2/audit/*.test.ts` is deliberately outside
vitest's `tests/**` glob so the existing CI is unaffected.

- The v1 game keeps building and deploying to Cloudflare Pages exactly as before.
- The v2 app will get its **own** Vite config, its own build output, and its own Pages project
  (recommended: `wizz-aw8-v2`) so the live game is never at risk.
- `v2` will reuse the existing Railway relay unchanged by emitting the same `Command` wire format
  (see plan §4.3 D8).

## Reproducing the audit

```bash
# from the repo root, with v1 dependencies installed
npm run dev -- --host 127.0.0.1 --port 5173   # keep running

node v2/audit/audit-baseline.mjs      # 36 screenshots + frame pacing
node v2/audit/audit-baseline-2.mjs    # lobby / gallery / HUD states
node v2/audit/audit-baseline-3.mjs    # HUD geometry + build flow
node v2/audit/audit-ui-overlap.mjs    # hit-testing / overlap proof
node v2/audit/audit-render-cost.mjs   # canvas size, DOM count, long tasks
```

The simulation-side harnesses live in `v2/audit/*.test.ts` and were run by temporarily copying them
into `tests/`; they import `../src/...` so they must sit next to that tree to resolve. Copy them in,
run with `npx vitest run tests/audit-*.test.ts`, then remove them — they are kept out of `tests/` so
v1 CI never picks them up.
