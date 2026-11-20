# Phase 5 leftovers — proof

Four issues found reviewing the Phase 4 building-alignment proofs. Each has a commit, a measurement, and
a gate that was verified by reintroducing the bug.

## (a) Zoom controls covered the Research button

| Viewport | Before | After |
|---|---|---|
| phone 667x375 | zoom overlaps Research by **54 × 25 px** | **0** overlap |
| phone-landscape 844x390 | 54 × 25 px | 0 |
| chromebook 1024x600 | 68 × 32 px | 0 |
| desktop 1366x768 | 68 × 32 px | 0 |

**Cause.** `hud.ts` appended the zoom widget to `.hud-cmd__grid` *and* to `.hud-cmd`. `append` moves a
node, so it silently left the grid and became an absolutely-positioned child of the band pinned to
`right: 6px; bottom: 2px`, floating over whatever was beneath it. The grid still reserved `auto auto`
trackers for it, which is why the six command cells stretched and the missing cell went unnoticed.

**Fix.** Append it once. The CSS is a normal flex row in its own grid column (`position: static`), so
layout — not z-order — decides where it goes. Every density reserves a tracker for it.

**Why the gate missed it.** The overlap check skips any pair where one node *contains* the other, because
zone frames legitimately nest (the selection segment lives inside the top bar). Every control in the band
is a descendant of `.hud-cmd`, so a button covering a button was invisible to it. The gate now re-runs the
intersection test over every **interactive** element, ignoring ancestry entirely.

Verified by restoring the double-append: fails with `control Zoom in / control Research` and the zoom
buttons reported as overflowing the viewport.

Proof: [`a-cmdbar-phone.png`](a-cmdbar-phone.png) ·
[`a-cmdbar-phone-landscape-wide.png`](a-cmdbar-phone-landscape-wide.png) ·
[`a-cmdbar-chromebook.png`](a-cmdbar-chromebook.png) ·
[`a-cmdbar-desktop.png`](a-cmdbar-desktop.png)

## (b) Research tree's 4th column clipped on Chromebook

Measured on 1024×600: a **564 px** graph viewport holding a **1180 px** tree, so Doctrine was cut **380 px**
short with "every tower" sliced mid-sentence.

| Viewport | Before (graph vs viewport) | After |
|---|---|---|
| phone 667x375 | 972 vs 651 — 2 columns cut | **fits** |
| phone-landscape 844x390 | 972 vs 828 — 1 column cut | **fits** |
| chromebook 1024x600 | 1180 vs 564 — 3 columns cut | **fits** |
| desktop 1366x768 | 1180 vs 906 — 2 columns cut | **fits** |

After the fix all four report `scrollWidth <= clientWidth`, **0 of 24** research names overflow their box,
and **0** elements extend past the viewport edge.

**Three causes.** `.research-body` gave the unlock panel a flat 300–400 px at every density above compact;
tier columns had a hard 230 px floor (190 px at compact), so five tiers demanded ~1.2 k; and the compact
override re-pinned 190 px, overriding any fitting logic.

**Fix.** The unlock panel is `minmax(220px, 300px)`, and the tier floor is *measured* from the real scroll
viewport and divided by the tier count, so all five tiers fit. Re-measured through a `ResizeObserver` so
rotating a device re-fits. Node titles wrap at word boundaries with a smaller font at compact density,
instead of breaking mid-syllable ("Resonanc/e").

**Why the gate missed it.** `?screen=research` is not a route — the tree is an **overlay** opened from the
HUD — so the whole-screen cleanliness pass never rendered it. And the HUD clipping walk compared only
`top`/`bottom` against clipping ancestors, never `left`/`right`, so horizontal clipping was invisible by
construction. There is now a dedicated gate that opens the real overlay at all four viewports.

Verified by restoring the 190 px floor: fails with `Doctrine extends 127px past the graph viewport` and
`"Arcane Resonance" is sliced at the graph edge`.

Proof: [`b-research-phone.png`](b-research-phone.png) ·
[`b-research-phone-landscape-wide.png`](b-research-phone-landscape-wide.png) ·
[`b-research-chromebook.png`](b-research-chromebook.png) ·
[`b-research-desktop.png`](b-research-desktop.png)

## (c) Team-tinted footings were saturated slabs

The previous pass tinted the whole upper course to keep ownership readable, which turned the largest lit
surface on a tower into a bright pad. The foundation is now neutral stone with a thin team rim inset on top.

Measured share of the **ground-contact band** (lowest 30% of the sprite) that is saturated team colour:

| | Result |
|---|---|
| 14 of 21 buildings | **0.0%** — plain neutral stone |
| the 7 with a rim | **6.9 – 21.4%** |
| the rejected version | **60%+** |

Team colour is still readable: `art-roster.test.ts` requires every building to show **≥3%** team colour on
screen, and all 21 pass. `art-footing.test.ts` asserts the footing band is **≤25%** saturated team colour
for every building, that the full-footprint course in `plinth`/`roundPlinth` is never painted with a team
material, and that a team rim still exists. Verified by tinting the full-footprint course again — fails with
"the full-footprint course must be stone, not team-tinted".

**A real art bug this surfaced.** `scrying_obelisk`'s team rings had radius 8.2 while its monolith has
circumradius 8.4, so they were **buried inside the stone** and only appeared because the plinth underneath
was tinted. Once the plinth went neutral its visible team colour fell to **1.0%** and the roster test
caught it. The rings are now radius 10.6 and stand proud.

Proof: [`c-teamtrim-chromebook.png`](c-teamtrim-chromebook.png) ·
[`c-teamtrim-desktop.png`](c-teamtrim-desktop.png) ·
[`c-teamtrim-phone.png`](c-teamtrim-phone.png)
