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

| Viewport | Layout | Battlefield share | Sanctum (x, y) | Map coverage | Zoom | Smallest control |
|---|---|---|---|---|---|---|
| phone-667x375 | side | 0.715 | 0.500, 0.500 | 0.923 | 0.94 | 30px |
| phone-844x390 | side | 0.757 | 0.500, 0.500 | 0.869 | 0.98 | 30px |
| phone-portrait-390x844 | bottom (collapsed) | 0.791 | 0.500, 0.403 | 0.929 | 1.18 | 30px |
| chromebook-1366x768 | side | 0.803 | 0.500, 0.500 | 0.881 | 1.85 | 32px |
| desktop-1920x1080 | side | 0.838 | 0.500, 0.410 | 0.804 | 1.85 | 34px |

`Sanctum (x, y)` is where the player's own Sanctum lands inside the HUD-free playable rect, as a fraction
of that rect. The reported bug was a base sitting low with black above it; the framing now puts it at the
centre, with two documented exceptions where the map's projected diamond cannot be centred at any allowed
zoom and the clamp moves it up instead — 0.403 on the tall portrait viewport and 0.410 on desktop. Both
still put the base inside the middle 60% of the battlefield.

The zoom is derived from the viewport rather than fixed: it targets roughly the same world span across the
playable rect's short side, then rises only as far as needed to centre the base (capped below `MAX_ZOOM` so
a pinch-in still has somewhere to go). That is why a phone lands near 1.0 and a Chromebook near 1.85, and
it is what stopped a large window from zooming out far enough to frame the whole board with empty ground
around it.

## How this pack is produced

```bash
cd v2
npx vite --host 127.0.0.1 --port 5343 --strictPort &
PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-ui-proof.ts
```

The harness drives a real Chromium through every screen at every viewport, taps the touch controls on the
phone contexts (real touch events, not synthetic clicks), arms a build tile and captures the placement
ghost, and writes `ui-proof.json` alongside the images.

Runtime is about seven minutes locally on SwiftShader, and the two browser gate suites
(`tests/ui-camera.test.ts`, `tests/touch/browser-touch.test.ts`) add ~5 more minutes to the v2 CI job. That
is why they run in the same step as the rest of the unit suite rather than a separate one — they need the
same dev server.

`tests/ui-proof.test.ts` guards the result: every capture must exist, be unique, have real visual variety,
contain under 0.5% violet pixels (re-measured from the PNG, independently of the harness), and carry
measurements consistent with the layout contract — four categories, eight labelled commands, a 28px
minimum control size, and the Sanctum centred in the battlefield.
