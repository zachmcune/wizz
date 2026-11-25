# Phase 4 polish pass

Fixes for the four issues found reviewing the Phase 4 proofs at `03d138a`, plus a full audit of every
screen. No new features; the goal was that nothing in the UI is clipped, misplaced, raw or unreadable.

---

## (1) Chromebook: the command bar floated under the top bar

**Cause.** The HUD grid declared its rows as `top, cmd, hint, 1fr` — so the command bar was row 2 and a
flexible spacer sat *below* it. Measured at 1366×768: the bar occupied **y=131–203 of 768**, leaving
**565px of dead space** beneath it.

**Fix.** The spacer moved into the middle of the grid (`top, 1fr, cmd`), so the command bar is anchored
to the bottom and can only ever be as far from the edge as the hint row. The hint and zoom cluster then
moved *inside* the command band, removing that last strip.

**Measured after:** bar bottom at **762 of 768** (was 203). Same on all four viewports.

**Gates.** `the command bar sits at the bottom and no zone is taller than its content` — checks the gap
below the bar (≤8px) and, for every HUD zone, that its box is not more than 12px taller than its
content. Verified by reverting the grid order: failed with *"command bar is 301px above the bottom"*.

---

## (2) Phone: the health text was clipped

**Cause.** The compact top band was capped at `height: 40px / max-height: 40px` while its selection
segment needed 46px: the stats block was a two-line stack (`HP 2000 / 2000` above the bar). Measured
`scrollHeight 38 > clientHeight 30`.

**Fix.** On compact the readout is **one line** — value beside the bar — and the band is sized from the
measured requirement (38px). The `.res__value` and `.btn` line-heights were also `1`, producing a 15px
line box for 17px glyphs; both are now `1.35–1.4`.

**Gates.** `no HUD text is clipped or overflows its box` walks every visible text node and requires
`scrollHeight ≤ clientHeight` *and* `scrollWidth ≤ clientWidth`; plus a content-height check per zone,
because a flex parent re-centres an over-tall child and hides the crop from the child's own metrics.
Verified by re-capping the band at 28px: failed with *"hud-top content 36px in a 28px box"*.

**Note on the 18% budget.** Fixing the clip pushed the HUD to **19.1%**, over the area gate. Rather than
trade one bug for another, the bands were re-dimensioned: top 38px + command 28px = **17.49%**, with
zero clipping and zero content overflow. The three constraints now hold each other honest.

---

## (3) Research: raw ids and code keys

The screen showed `siphonPerSecond ×1.08`, `requires attunement_spire` and
`light_ranged, aoe_ranged: damage ×1.1`. That was the UI formatting `effect.stat` directly.

**Data fix.** Every research now carries, in the schema:

- `tier` — which column it sits in, 1-based;
- `icon` — a glyph name from the shared icon set;
- `effectViews[]` — `{ label, detail }`, one per effect, in plain language
  (e.g. *"Harvest yield"* / *"+8% mana per second from harvesters"*).

The schema **rejects** a node whose `effectViews` count differs from its `effects`, and rejects a name
that looks like an id. The UI has no fallback to a raw key.

**Tree growth.** 8 items → **24**, across **5 tiers**, with real branch points: 18 available to Arcane,
13 to Obsidian, 12 to Verdant, and 2+ exclusive to each. Verified by tests for tier coverage, branch
count (`≥3` nodes unlocking 2+ children) and faction exclusivity.

**Presentation.** Cards are laid out in tier columns with a tier header, an icon, a plain description,
effect rows, named requirements (`Requires · Attunement Spire`), the building it is researched at
(`At · Resonance Vault`), duration and a Research/Locked button. The Astral Spire's four unlocks are read
from the building definition and shown with their cooldowns.

**Gates.** Two: `every screen shows words, not keys` walks every visible text node on six screens and
rejects snake_case or camelCase identifiers; `the research tree shows only player-facing wording` asserts
≥20 cards, ≥4 tiers, ≥20 icons and zero raw keys. Verified by injecting `siphonPerSecond ×1.08` into a
card: failed with exactly that string.

---

## (4) Massed fights read as one pile on phone

**Cause, measured.** 54 units ordered to one point produced **26% deeply interpenetrating** (a neighbour
inside 0.75× the sum of collision radii) with a median nearest-neighbour distance of **0.86×** — bodies
inside each other. Three compounding causes:

1. Every unit steered to the **exact same** goal point.
2. Separation used the raw collision sum while sprites draw at 2.9× that, so sprites overlapped long
   before collision did.
3. The team ring was a filled disc at 66% of the sprite radius, hidden under the body it marked.

**Fix.**

- **Formation slots.** Each unit takes a deterministic cell in a 5-wide hex lattice around the order
  point, indexed by a hash of its entity id — so group size has no capacity limit, the centre cell is
  used once, and the layout is identical on every replay.
- **Visual separation.** Separation radius tracks the *drawn* size (2.6×), and the neighbour query radius
  was widened to match — without that the multiplier had no effect, because the pairs were never found.
- **Arrival spreading.** Idle resolution speed 8 → 26 units/sec, and an overlapped unit may briefly use
  45% extra speed to extricate (bounded, and only while overlapping). Hit boxes are unchanged.
- **One thin team ring** at the sprite footprint, 1.5px. An intermediate version with an inner ring, an
  outer ring and sprite outlines measured **8.3% ring pixels** in the fight region — a solid blue mass,
  worse than no ring. The single ring measures **3.1%**.

**Measured, same scenario, same camera:**

| | before (`03d138a`) | after |
|---|---|---|
| deeply interpenetrating | **26%** | **13%** |
| pairs separated (≥ r1+r2) | 98% | **99%** |
| median nearest-neighbour | **0.86×** | **1.42×** |
| p10 nearest-neighbour | **0.57×** | **0.75×** |

The before row was produced by checking out `03d138a` into a worktree, serving it, and running the same
scenario — not by remembering numbers.

See [`massed-before-after-667x375.png`](massed-before-after-667x375.png) for the side-by-side.

**Gates.** `units sharing a destination fan out instead of stacking` and `54 units ordered to one point
end up separated`, both on the simulation state (pixel metrics merge same-coloured neighbours and cannot
tell "two units touching" from "one blob").

---

## Full audit of every other screen

All 8 screens × 4 viewports were checked for raw text, clipping, overflow and dead space. Three real
bugs found and fixed:

| Bug | Detail |
|---|---|
| **Sandbox rendered off-screen** | `mountSandbox` called `app.startMatch()`, which replaces the screen root — so two screens stacked and the sandbox rendered at **y=780 in a 768px window**, everything below clipped. It now renders into its own root and starts a sandbox match through a router action. Measured after: **0–768**, one screen, all 10 tabs. |
| **Page titles and button labels clipped** | `.display` used `line-height: 1.15` and `.btn` used `1`; both made a line box smaller than the glyphs, so every h1 and every button reported `scrollHeight > clientHeight`. Now `1.3` and `1.35`. |
| **Results screen left 226px dead** | The result grid did not fill a tall viewport. Now `justify-content: space-evenly` with a flexible grid; measured 12px margins at 768px. |
| **Results screen was always empty when reached by playing** | The router tore the session down on navigation to `results`, so the scoreboard read a null state: zero rows, zeroed stats, and a renderer crash (`Cannot read properties of null (reading 'set')`) from rendering into a destroyed stage. `results` now keeps the session and stops the loop. Verified by surrendering a live match: 3 rows with real counts, 0 errors. |
| **Results showed developer terms and raw ids** | "Ticks simulated", "Peak entities", "player0", lowercase "arcane", and "MAPDuel Glade" ran together. Now "Total units built", "Structures standing", the lobby display name, the faction's own name, and the map as a normal labelled row. |
| **Deep-linked results was an empty table** | `?screen=results` with no session rendered an empty scoreboard that read as a bug. It now says no match has been played and offers a button to start one. |
| **Sandbox standby bar misaligned** | No `display: flex`, so its prompt and button sat at different heights (y=306 vs y=302). |

The pause card also gained four live readouts (time, mana, units, structures) so that screen reports
where the match stands instead of being one button on an empty field.

**Gate.** `no screen overflows, clips or errors at any viewport` — 8 screens × 4 viewports = 32 checks per
run, asserting the screen starts at the top, fits the viewport, only one screen is mounted, no text box
crops its content, and zero page/console errors. Text-overflow ellipsis is exempt (deliberate
truncation).

---

## (5) Buildings looked tilted and floating, not resting on the grid

> *"The main building doesn't read as actually sitting flat because of how it's angled. Make sure all
> other buildings aren't like that either."*

### What was actually wrong — three faults, measured not guessed

The obvious explanation (a rotated sprite) turned out to be **false**: the live sprite has
`rotation: 0`, `angle: 0`, `scale: 1.0`. Reading the real transform out of the renderer:

```
sanctum   scale {x:1, y:1}   rotation 0   angle 0
          anchor {x:0.5, y:0.5756572649418834}   <- the computed ground origin
          position {x:0, y:216}                  <- the projected ground point
```

So the tilt came from **how the atlas was baked**, not from how it was drawn. Three separate faults
compounded:

1. **Wrong camera.** Buildings were baked at yaw `0.62` rad (35.5°) / pitch `0.5` rad (28.6°), while the
   terrain projects at yaw 45° / pitch 60°. Under the terrain's projection a square base *is* a 2:1
   diamond; at 35.5° it comes out a parallelogram rotated ~9.5° off it. That is the "angled" look.
2. **Wrong pivot.** `bake()` wrote `pivotX: 0.5, pivotY: 0.85` into the manifest while the computed
   values went to a `pivots.json` the loader never read. Every building was anchored 85% down its frame
   instead of at its own ground origin — it hung below the ground plane instead of standing on it. The
   manifest now carries **22 distinct pivot values** instead of one constant.
3. **Per-building scale that broke 1:1 with the terrain.** `buildingScaleFor()` resized each building so
   its base's projected width equalled its footprint diamond. That is right for a square plinth and
   wrong for everything else, because a round plinth is an inscribed circle: its projected width is
   geometrically only `1/sqrt(2)` (70.7%) of the diamond. Forcing it to 100% scaled those towers up
   **1.41x**, making them physically larger than the tiles they stand on. And because the contact shadow
   is computed in *world* units, the inflated scale dragged the shadow with it:
   **24–38% wider than the footprint** — a dark puddle around the tile, which is exactly the "hovering"
   read.

### The fixes

- Bake every building at `TERRAIN_MATCH_YAW = π/4`, `TERRAIN_MATCH_PITCH = π/3`, and the single constant
  `TERRAIN_MATCH_SCALE = √½` — the only scale at which one world unit is one projected pixel. Constants
  live in [`art/bake-camera.ts`](../../../art/bake-camera.ts) so the test can import them without
  triggering the bake.
- Read the real pivot into the manifest instead of a constant; the renderer anchors on it (scale 1).
- Fix round bases in **geometry, not scale**: `roundPlinth` now lays a square footing course exactly on
  the footprint with the round drum stepping in above it. `summoning_circle`, `thorn_grove`, `stone_wall`
  and `mana_node` got footing courses for the same reason.
- Make those foundation courses **team-tinted**. They are now the largest lit surface on a round tower,
  and leaving them neutral made ownership unreadable at default zoom (round-roster team-colour share fell
  from ~4–7% to under 1%). Team tint on the ground contact is also the correct read.

### Measured result — every building, from the baked pixels

Body width vs footprint diamond, measured from the atlas raster (alpha > 200), and contact-shadow width
(alpha > 8):

| | before | after |
|---|---|---|
| Body / diamond, all 21 buildings | 0.75–1.06 | **0.94–1.06** |
| Contact shadow / diamond, round bases | **1.27–1.38** (spilling) | **≤ 1.06** (on the footprint) |
| Buildings failing | 8 | **0** (`stone_wall` is thin by design; its shadow is 28px inside its 32px tile) |

The residual `1.02–1.06` is the 2px outline drawn outside the base, not overshoot.

In-match, at the tightest viewport, the drawn diamond measures **145×73 px** against an expected
**144×72** — a 1px antialias difference, aspect **1.99** where the terrain is **2.00**.

### Automated gate — 112 assertions, and proven to catch the bug

[`tests/building-alignment.test.ts`](../../../tests/building-alignment.test.ts) projects each building's
base corners through the same projection the terrain uses and asserts they land on its footprint tile
corners within 6px. It then goes further, because a world-space test alone **missed** fault 3: it reads
the **baked atlas pixels** and asserts

- the drawn base spans its diamond (0.94–1.06),
- the contact shadow never exceeds the footprint,
- the base edge runs at the diamond's **2:1 slope**, measured by tracing the edge and least-squares
  fitting `dx/dy` — the direct "no rotation against the grid" check,
- the manifest records the constant terrain bake scale for every building.

Each of these was verified by **reintroducing the bug**:

- old yaw `0.62` → slope test fails with measured slopes **1.40–2.46** (want 2.00)
- per-building scale → fails by name: *"arcane_bunker was baked at a per-building scale, not the
  terrain's: expected 0.679 to be close to 0.707"*
- undersized round base → *"sanctum: base is 48.0px wide, tile diamond is 96.0px"*

### Proof artifacts

| Artifact | Contents |
|---|---|
| [`buildings-on-footprints.png`](buildings-on-footprints.png) | **every building drawn on its own footprint diamond** — cyan silhouette, magenta corner rings, magenta centre dot |
| [`building-overlays/`](building-overlays/) | the same, one 21-file set for close inspection |
| [`align-grid-phone.png`](align-grid-phone.png) · [`-phone-landscape-wide`](align-grid-phone-landscape-wide.png) · [`-chromebook`](align-grid-chromebook.png) · [`-desktop`](align-grid-desktop.png) | **in-match at all 4 viewports**, with the projected footprint diamond drawn over the live render |
| [`align-inmatch-phone.png`](align-inmatch-phone.png) · [`-phone-landscape-wide`](align-inmatch-phone-landscape-wide.png) · [`-chromebook`](align-inmatch-chromebook.png) · [`-desktop`](align-inmatch-desktop.png) | the same matches with no overlay, for the clean read |

All 8 buildings spawned at every viewport, **0 page errors**. Measured independently from the overlay
pixels: every building's footprint centre offset from its diamond centre is **0.0 px**.

---

## Proof

| Artifact | Contents |
|---|---|
| [`screens/`](screens/) | **37 captures** — 9 screens × 4 viewports, plus the phone massed battle |
| [`massed-before-after-667x375.png`](massed-before-after-667x375.png) | the issue (4) comparison, labelled with measured metrics |
| [`before/`](before/) | the `03d138a` captures used as the baseline, including the independently measured massed frame |
| [`polish-proof.json`](polish-proof.json) | per-capture md5, colour buckets, purple fraction, HUD metrics, and the massed before/after numbers |
| [`phase4-polish-flow.webm`](phase4-polish-flow.webm) | full flow: menu → lobby → match → research → pause → results |
| [`align-inmatch-*.png`](align-inmatch-desktop.png) | **building alignment**: in-match at all 4 viewports |
| [`align-grid-*.png`](align-grid-desktop.png) | **building alignment**: the same shots with each footprint diamond drawn over the live render |
| [`buildings-on-footprints.png`](buildings-on-footprints.png) | **building alignment**: every building on its own outline |

**37 screenshots, 0 purple in chrome, 0 page errors.**

### CI

All five checks green on the building-alignment commit `06c7dee` (with the docs update `ce01475`):
`quality` (1m32s), `e2e` (2m18s), `slow` (1m33s), `Cloudflare Pages`, and `v2` (11m27s) — run
`44666482472`, whose `headSha` is `ce01475`.

The v2 job ran **532 tests in 23 files** plus the isolated perf gate (3 tests) — **535 total**, matching
the local run — then the production build and the deployed-entry assertions. `tests/building-alignment.test.ts`
ran with **112 tests** and passed. The `quality` job ran the v1 suite: **64 files** green.

---

## Not done

- **Phase 5 (AI) is not started**, as instructed.
- The in-match AI remains the documented `simpleBot` stub.
- Formation slots spread a group around the order point; they do not yet align a group to a facing or
  form distinct ranks by unit type. That is a Phase 5 military-planner concern.
