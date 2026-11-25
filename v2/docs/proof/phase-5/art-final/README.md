# Phase 5 proof — final art pass (less boxy, more distinct, de-purpled)

Reviewed at head `277a26d`. Three goals from the review: break up boxy masses, get silhouettes distinct again, and move the
palette off violet.

## 1. Less boxy

The complaint was accurate. Measuring the drawn row profile of each building showed several holding ONE constant width for
their whole body and then tapering — the definition of a box:

```
arcane_bunker (before)          obsidian_bastion (before)
 62 ###############################   62 ###############################
 62 ###############################   62 ###############################
 60 ##############################    62 ###############################
 60 ##############################    62 ###############################
```

`hall()` gained a **`profile`** option, and each building was given the profile that suits its identity:

| Profile | Meaning | Buildings |
|---|---|---|
| `stepped` | three setbacks, each inset with a cornice | bunker, forge, cannon, sanctum |
| `tapered` | continuous inward lean in four courses | ley conduit, scrying plinth, inferno base |
| `peaked` | straight walls under a pitched hip roof | sentry, nexus |
| `flat` | straight walls, slab roof | the rest |

Beyond the profile, individually:

- **resonance vault** became a four-tier **octagonal ziggurat** with alternating corner buttresses and a small open shrine.
- **obsidian bastion** gained a **machicolated overhang** — a projecting gallery under the parapet — so the wall steps out
  before the crenellations.
- **inferno beacon** became a **square furnace tower** with arched fire ports, a chamfered furnace storey and a coursed
  chimney.
- **waystone camp** got a stockade, a solid inner block of stores and a standing stone.
- **summoning circle** got altar blocks between the standing stones so the ring is a mass rather than a hollow crown.

### The finding that mattered most

The team band was **flattening every profile**. `hall()` sized it from the foot of the walls (`half * 2 + 1.6`), which made
it the widest element in a stepped or tapered building — measured **66px on a hall whose tiers were 40–58px**. It silently
re-squared every shape that had been de-boxed. It now scales from the tier it sits on, and the setbacks read.

## 2. More distinct shapes

| Metric | Before (`277a26d`) | After |
|---|---|---|
| Upper-half crop (the gate), worst pair | 0.701 | **0.674** |
| Upper-half crop, pairs over 0.72 | 0 | **0** |
| Original 70% crop, worst pair | 0.787 | **0.762** |
| Original 70% crop, pairs over 0.72 | 8 | **3** |

Both metrics improved, and the gate is now **inside the 0.69 bar** (it was 0.011 over at `277a26d`) with zero failing pairs.

The change that moved the needle was giving each building a different PLAN, not just different details: the resonance vault
became the only octagonal building, the inferno beacon the only square stepped tower, and the bunker/bastion/forge/cannon
took stepped profiles while the sentry and nexus took pitched roofs.

## 3. Tone down the violet

### The gate, proven failing on `277a26d` first

`tests/art-no-purple.test.ts` (35 assertions) measures, in the baked sprite, the share of visible pixels in the **250–330°
hue band** — the same band `ui-tokens.test.ts` bans in CSS, so one definition governs chrome and art.

Run against `277a26d`'s art it failed **13 sprites**, worst:

| Sprite | Violet share at `277a26d` |
|---|---|
| `resonance_vault` | **47.8%** |
| `sanctum` | **38.9%** |
| `arcane_gate` | **34.9%** |
| `scrying_obelisk` | **27.3%** |
| `attunement_spire` | **24.4%** |
| `arcane_bunker` | **22.7%** |

That is the "purple AI slop" in the report, and it was invisible to the existing no-purple test because that test only
inspected CSS tokens.

### A measurement correction, stated plainly

The first version of this gate reported 47% for the wisp's glowing core. It was wrong: HSL saturation divides by
`(1 - |2L-1|)`, which collapses for near-white, so `rgb(254,250,255)` — essentially white — scored saturation 1.0. The test
now uses **absolute chroma** (`max - min`), which is what the eye judges: a highlight has chroma ~0.02 and is ignored, a
lilac robe has chroma ~0.48 and is caught.

### The palette

The three `violet*` materials were the body of six buildings. They are now **cool slate** (hue ~212) at the same
value structure, so lighting still reads. `aether` moved from lilac to **restrained teal** (hue ~185), and the caster robes
from violet to **indigo-grey wool**.

**Result: 0.0% violet on every one of the 21 buildings and 14 units.**

## Per-building table

| Building | Vertical mass | Flat base | Rise | Worst IoU partner | Violet |
|---|---|---|---|---|---|
| `arcane_bunker` | 83% | 3% | 1.30 | 0.000 | 0% |
| `arcane_gate` | 100% | 5% | 4.03 | 0.000 | 0% |
| `arcane_nexus` | 98% | 3% | 2.19 | 0.000 | 0% |
| `arcane_sentry` | 100% | 4% | 3.42 | 0.000 | 0% |
| `astral_spire` | 90% | 8% | 1.88 | 0.000 | 0% |
| `attunement_spire` | 89% | 10% | 1.47 | 0.669 | 0% |
| `celestial_cannon` | 95% | 2% | 1.94 | 0.000 | 0% |
| `frost_spire` | 95% | 11% | 1.77 | 0.660 | 0% |
| `golem_forge` | 77% | 2% | 1.50 | 0.000 | 0% |
| `inferno_beacon` | 100% | 7% | 2.92 | 0.000 | 0% |
| `ley_conduit` | 100% | 14% | 2.13 | 0.674 | 0% |
| `obsidian_bastion` | 100% | 2% | 2.31 | 0.666 | 0% |
| `resonance_vault` | 96% | 15% | 1.86 | 0.674 | 0% |
| `sanctuary_spire` | 100% | 11% | 2.81 | 0.654 | 0% |
| `sanctum` | 76% | 2% | 1.54 | 0.654 | 0% |
| `scrying_obelisk` | 100% | 12% | 2.65 | 0.000 | 0% |
| `stone_wall` | 100% | 32% | 1.75 | 0.000 | 0% |
| `storm_conductor` | 97% | 10% | 1.90 | 0.673 | 0% |
| `summoning_circle` | 97% | 13% | 1.92 | 0.000 | 0% |
| `thorn_grove` | 78% | 8% | 1.12 | 0.669 | 0% |
| `waystone_camp` | 55% | 14% | 1.03 | 0.666 | 0% |

Worst IoU partner is the highest IoU this building has with any other, on the upper-half metric. All are below the 0.72
threshold; the gate's worst overall is 0.674.

`stone_wall`'s 32% flat base and its exemption from the mass gates are by design — a wall is a thin barrier, not a tile
filling structure.

## Proof artifacts

| File | Contents |
|---|---|
| [`silhouettes-before.png`](silhouettes-before.png) | all 21 as pure silhouettes at `277a26d` |
| [`silhouettes-after.png`](silhouettes-after.png) | the same, after this pass |
| [`inmatch-phone.png`](inmatch-phone.png) | all 21 spawned in a live match, 667×375 |
| [`inmatch-phone-landscape-wide.png`](inmatch-phone-landscape-wide.png) | 844×390 |
| [`inmatch-chromebook.png`](inmatch-chromebook.png) | 1024×600 |
| [`inmatch-desktop.png`](inmatch-desktop.png) | 1366×768 |
| [`vertical-before.json`](vertical-before.json) / [`vertical-after.json`](vertical-after.json) | per-building vertical mass, flat base, rise |
| [`iou-before.json`](iou-before.json) / [`iou-after.json`](iou-after.json) | silhouette IoU at both crop heights |
| [`violet-after.json`](violet-after.json) | per-building violet share |

**0 page errors** at all four viewports.

Cross-check from the shipped screenshot: counting near-neutral stone against saturated/dark structure inside the play area
of `inmatch-chromebook.png` gives **94% structure, 6% stone**.

## Everything else still green

| Gate | Assertions |
|---|---|
| `art-no-purple.test.ts` (new) | 35 |
| `building-vertical-mass.test.ts` | 60 |
| `building-mass.test.ts` | 61 |
| `building-scale-safe.test.ts` | 4 |
| `building-legibility.test.ts` | 24 |
| `building-alignment.test.ts` | 112 |
| `unit-grounding.test.ts` | 43 |
| `art-footing.test.ts` | 22 |
| `art-roster.test.ts` | 142 |
| **Total art** | **503** |

- Grounding, pivots and the constant bake scale are unchanged; the alignment suite still traces every base onto its
  diamond at the 2:1 slope.
- Footprints, pathing and picking unchanged — asserted as literals, with picking proven tile-based.
- Team colour stays ≥3% on every building, as a minority rim or banner.
- The UI's own no-purple rule is untouched.

## Honest caveats

- **`waystone_camp` is the weakest on vertical mass (55%)** — a stockaded enclosure is inherently more open than a solid
  keep. It passes, but with the least margin.
- **Three pairs remain over threshold on the original 70% crop** (worst 0.762). That metric is not gated because it
  includes the full-footprint walls every building must share to satisfy the mass requirement; it improved this pass
  (8 → 3 pairs) and is reported rather than omitted.
- **`stone_wall`** is exempt from the mass gates by design and still shows 32% flat base.
- During this pass I twice regressed distinctness by making buildings share a "tall hall + peaked roof" pattern (worst IoU
  0.757 and 0.728 before settling at 0.674), and reverted each time rather than accept it.
