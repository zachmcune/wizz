# Preview deploy proof — v2 served at `/v2/`

Captured from the **deployed Cloudflare Pages branch preview**, not from a local dev server:

| URL | What it is |
|---|---|
| <https://cursor-rebuild-v2-5642.wizz-aw8.pages.dev/> | v1, unchanged |
| <https://cursor-rebuild-v2-5642.wizz-aw8.pages.dev/v2/> | v2, the playable app shell |
| <https://cursor-rebuild-v2-5642.wizz-aw8.pages.dev/v2/spectate.html> | v2's AI-vs-AI spectate harness |

## What was done

On `/v2/`: **Skirmish → Start match** (2 players, human vs the Phase 5 AI on Duel Glade), then
~30 s of real match time with a selection drag and a move order.

## Files

`v2-menu-*`, `v2-lobby-*`, `v2-match-start-*`, `v2-match-30s-*` at
**1366x768** (Chromebook) and **390x844** (phone).

The in-game captures show the v2 HUD (selection panel, mana/units/power, match clock, command bar,
minimap) over the v2 isometric render — a surface v1 does not have at all, which is what proves these
bytes are the v2 bundle rather than v1's HTML through the Pages SPA fallback.

## Reproducing

```bash
node v2/scripts/capture-preview-proof.mjs https://cursor-rebuild-v2-5642.wizz-aw8.pages.dev
```

The script fails on any console error, page error or response >= 400, and asserts the document's
script tag points at `/v2/assets/`.
