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

The pause card also gained four live readouts (time, mana, units, structures) so that screen reports
where the match stands instead of being one button on an empty field.

**Gate.** `no screen overflows, clips or errors at any viewport` — 8 screens × 4 viewports = 32 checks per
run, asserting the screen starts at the top, fits the viewport, only one screen is mounted, no text box
crops its content, and zero page/console errors. Text-overflow ellipsis is exempt (deliberate
truncation).

---

## Proof

| Artifact | Contents |
|---|---|
| [`screens/`](screens/) | **37 captures** — 9 screens × 4 viewports, plus the phone massed battle |
| [`massed-before-after-667x375.png`](massed-before-after-667x375.png) | the issue (4) comparison, labelled with measured metrics |
| [`before/`](before/) | the `03d138a` captures used as the baseline, including the independently measured massed frame |
| [`polish-proof.json`](polish-proof.json) | per-capture md5, colour buckets, purple fraction, HUD metrics, and the massed before/after numbers |
| [`phase4-polish-flow.webm`](phase4-polish-flow.webm) | full flow: menu → lobby → match → research → pause → results |

**37 screenshots, 0 purple in chrome, 0 page errors.**

---

## Not done

- **Phase 5 (AI) is not started**, as instructed.
- The in-match AI remains the documented `simpleBot` stub.
- Formation slots spread a group around the order point; they do not yet align a group to a facing or
  form distinct ranks by unit type. That is a Phase 5 military-planner concern.
