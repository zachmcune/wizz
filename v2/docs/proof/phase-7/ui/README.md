# Phase 7 — UI and touch proof pack

Evidence for the "mobile Command & Conquer" interface pass and the v1-style touch controls. Every image
here was produced by a committed harness against a real browser and the real game, and the numbers beside
them were read from the same live page at the moment of capture.

## What is in here

| Path | What it shows |
|---|---|
| `screens/<viewport>--<screen>.png` | Every screen at every viewport, in its resting state. |
| `screens/<viewport>--match--selection.png` | The in-match HUD with real units selected and the dossier populated. |
| `screens/<viewport>--match--tab-buildings.png` | The Buildings tab: structures with real atlas thumbnails and mana costs. |
| `screens/<viewport>--match--tab-defenses.png` | The Defenses tab. |
| `screens/<viewport>--match--tab-units.png` | The Units tab: trainable units for the structures you own. |
| `screens/<viewport>--match--tab-tech.png` | The Research tab, with per-item progress and completion state. |
| `screens/<viewport>--match--placement.png` | A live placement ghost over legal ground, reached by tapping a build tile. |
| `screens/<viewport>--match--collapsed.png` | The console collapsed, with the expand control and the command rows still reachable. |
| `ui-proof.json` | Every capture's size, md5, colour-bucket count, purple fraction and the measured HUD/camera numbers. |

Viewports: `phone-667x375`, `phone-844x390` (both touch), `phone-portrait-390x844` (touch),
`chromebook-1366x768`, `desktop-1920x1080`.

## What the numbers say

Read from `ui-proof.json` for the resting-state match capture at each viewport:

| Viewport | Layout | Battlefield share | Sanctum (x, y) | Map coverage | Zoom |
|---|---|---|---|---|---|
| phone-667x375 | side | 0.715 | 0.500, 0.500 | 0.923 | 1.25 |
| phone-844x390 | side | 0.799 | 0.500, 0.500 | 0.881 | 1.42 |
| phone-portrait-390x844 | bottom (collapsed) | 0.791 | 0.500, 0.403 | 0.929 | 1.58 |
| chromebook-1366x768 | side | 0.803 | 0.500, 0.500 | 0.881 | 1.95 |
| desktop-1920x1080 | side | 0.848 | 0.500, 0.500 | 0.804 | 1.85 |

`Sanctum (x, y)` is where the player's own Sanctum lands inside the HUD-free playable rect, as a fraction
of that rect. The reported bug was a base sitting low with black above it; the framing now puts it at the
centre in both axes, except on the tall portrait viewport where the map's projected diamond cannot be
centred laterally at any allowed zoom and the clamp moves it 10% up instead.

## How this pack is produced

```bash
cd v2
npx vite --host 127.0.0.1 --port 5343 --strictPort &
PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-ui-proof.ts
```

The harness drives a real Chromium through every screen at every viewport, taps the touch controls on the
phone contexts (real touch events, not synthetic clicks), arms a build tile and captures the placement
ghost, and writes `ui-proof.json` alongside the images.

`tests/ui-proof.test.ts` guards the result: every capture must exist, be unique, have real visual variety,
contain under 0.5% violet pixels (re-measured from the PNG, independently of the harness), and carry
measurements consistent with the layout contract — four categories, eight labelled commands, a 28px
minimum control size, and the Sanctum centred in the battlefield.
