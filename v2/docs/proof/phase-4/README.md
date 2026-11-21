# Phase 4 — the real UI

Every screen, wired to the live simulation. Obsidian & Brass is locked in as the only style; every
component consumes `src/ui/tokens.css` and nothing else.

Entry: `app.html` → `src/app/app.ts`. The Phase 3 renderer harness at `index.html` is untouched so the
Phase 3 proofs stay reproducible.

---

## The screens

| Screen | What is live |
|---|---|
| **Main menu** | A **real 3D scene** — the game renderer running on a real match, camera orbiting the player's base. Not a picture, not placeholder boxes. |
| **Lobby** | 2–4 players, human/AI per slot, faction per slot, AI difficulty, team assignment for 3+, map picker, speed. Start builds a real match. |
| **Match HUD** | Resources, clock, selection with live HP, minimap, six commands, and build/train/research panels that issue real `Command`s. |
| **Research tree** | Dependency graph by prerequisite depth, plus the **Astral Spire's four unlocks read from the building definition**. |
| **Settings** | Display, audio, controls. Persisted, applied immediately. |
| **Pause** | Overlay with resume / restart / settings / quit. |
| **Results** | Reads the real winner from `state.winnerTeam`; per-player scoreboard. |
| **Sandbox** | **All 10 tabs**, each issuing real `dev*` commands against a live match. |
| **Entity Designs** | Every unit at 8 facings and every structure, drawn live from the atlas on canvas — no image files. |

---

## The four issues from the style proofs

### 1. Selected-unit panel covered half the phone screen

**Cause:** the selection readout was a second full-width band. Measured alone it was ~30% of a 667×375
screen; the whole HUD measured **86%**.

**Fix, structural rather than cosmetic:** the selection readout became a **segment of the top bar**, so
it adds no band of height and cannot overlap anything. Combined with a capped command bar, the HUD is now
**two edge-pinned bands**.

| Viewport | HUD area | Limit |
|---|---|---|
| 667×375 | **17.5%** | 18% |
| 844×390 | 16.8% | — |
| 1366×768 | 17.7% | — |
| 1920×1080 | 7.6% | — |

Gated by `tests/ui-phase4.test.ts`, which measures the **union** of HUD element rects (not the sum, so
overlap cannot hide inside an inflated number). Verified by raising the command bar to 120px: it failed
at **41.1%**.

### 2. The WASD hint overlapped the Move button

**Cause:** the hint and the zoom cluster were `position:absolute`, so they floated over whatever was
underneath.

**Fix:** the HUD is a CSS grid with one named area per zone. Grid cells cannot overlap, so this class of
bug is prevented by construction. Absolute positioning is used nowhere in the HUD.

A second, separate bug surfaced from the measurement: the hint's grid row was stretching to **150px**
at Chromebook, which is why that viewport read 33% before the fix.

**Gate:** every pair of sibling HUD zones is rect-intersected at all four viewports (containment is
excluded by design — the selection lives *inside* the top bar). Verified by absolutely positioning the
hint over the command bar: it failed with `.hud-cmd / .hud-hint = 221x18` at Chromebook.

### 3. The menu art was placeholder grey boxes

**Cause:** the previous menu drew five rotated `<div>`s.

**Fix:** `mountMenu` builds a real match and runs the **actual game renderer** on it, orbiting the camera
around the player's base. The menu art is therefore literally the game's own 3D art — same atlas, same
materials, same lighting. It falls back to a code-drawn composition only if WebGL is unavailable.

### 4. Units still bunched at phone size

**Cause:** measured on a dense fight, **92% of units overlapped another sprite**. Sprites are drawn at
2.9× collision radius for legibility, but separation used the raw collision sum — so two units could be
"safely" 16 units apart while their 46-unit-wide sprites interpenetrated completely.

**Fix:** the separation radius now tracks the **drawn** size (`VISUAL_SEPARATION = 2.6`), and the
neighbour query radius was widened to match (without that, the multiplier had no effect at all — the
pairs were never even found). Idle resolution speed went 8 → 26 units/sec so a crowd fans out in about a
second instead of never. Overlapped units may briefly use 45% extra speed to extricate, which is bounded
and only applies while they are actually overlapping.

Hit boxes are unchanged: `radius` is untouched, so combat, splash and selection behave identically.

**Gate:** 24 units ordered to a **single point** (the case that actually produces a pile — two lines
meeting never overlap at all, measured 0% at every multiplier). After 12s: **29%** deeply
interpenetrating with separation, **54%** with it disabled. The 40% threshold is set between those two
measurements so it passes the real build and fails the broken one.

---

## v1 regressions

| v1 bug | v2 gate |
|---|---|
| [E16] coach card intercepted the Place button on phones | At the build control's own centre, `elementFromPoint` must return the control or a descendant — asserted at all four viewports |
| [E17] `.cmd-card` collapsed to 0px | `.hud-cmd` height > 8px at all four viewports |

---

## Proof

| Artifact | Contents |
|---|---|
| [`screens/`](screens/) | **37 captures**: 9 screens × 4 viewports, plus a phone-only massed battle |
| [`phase4-full-flow.webm`](phase4-full-flow.webm) | **25.1s, 627 frames**: menu → lobby → match → research → pause → results, driven through the app's own API |
| [`phase4-proof.json`](phase4-proof.json) | Per-capture md5, colour-bucket count, purple fraction, chrome pixel count |
| [`hud-geometry.json`](hud-geometry.json) | Per-viewport HUD area, overlap pairs, overflow |

Every capture is checked for zero page errors, a non-blank frame (>8 colour buckets), and **no purple in
chrome** — measured in chrome regions only, because the gallery and battlefield legitimately show the
game's violet Arcane art.

**Result: 37 screenshots, 0 purple violations, 0 errors.**

---

## Not done

- **Phase 5 is not started.** The AI in a match is a minimal stub (`simpleBot`): it trains cheap units
  and attack-moves at the enemy. It is enough for the match to be real, not enough to be an opponent.
- **No fog reveal** wired to a viewer flag yet; the sandbox's Reveal tab currently reports that honestly
  rather than pretending.
- **The Cloudflare Pages deploy still builds v1**, so `/app.html` is not publicly reachable. That is a
  Phase 8 task.
- **The live UI gates need a browser and a dev server.** They skip without one; CI runs them (the v2 job
  starts Vite and sets `PROOF_BASE`).
