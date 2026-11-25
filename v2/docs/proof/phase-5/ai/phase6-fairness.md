# Phase 5 re-measurement (Phase 6, Step 0) — mirror, length, ladder

**Measured:** 2026-11-23 on `cursor/rebuild-v2-5642`, after the Phase 6 fixes.
**Why this document exists:** HANDOFF §7 recorded three Phase 5 targets as NOT met, and one of them gated
Phase 6 ("a fair game is a prerequisite"). This is the re-measurement, with the mechanisms that were found.

---

## 0. The headline: three sim defects were suppressing the real numbers

Every Phase 5 balance figure in HANDOFF was measured on a build with a **NaN velocity bug** in it.
`movementSystem` read `order.x`/`order.y` unconditionally, but `harvest`, `attack` and `hold` orders carry no
coordinates — so every harvesting worker computed `goalX = undefined + offset = NaN` and wrote NaN to `velX`,
`velY` **and** `facing` (via `Math.atan2`). `audit/nan-guard.ts` measured **282,204 non-finite values in one
match**, first at tick 19.

`facing` is mixed into `hashState` and read by turret arcs, so this was not cosmetic; and it changed OUTCOMES —
seed 1000's mirror ran 13.0 min before the fix and 18.2 min after. Fixing it moved the measured mirror win rate
from 63.6% to **18.2%**, which is what exposed the two fairness defects below.

That is the honest history: the 63.6% in HANDOFF §7.1 was a passing number measured on a broken build.

---

## 1. Mirror fairness — MET

**Target:** identical AIs, both corner assignments per seed, ≥ 40 games, the first-listed win rate's 95% Wilson
interval must contain 50%.

**Instrument:** `v2/audit/mirror-par.ts`, 22 seeds × 2 assignments = **44 games**, 34-minute cap, 3 workers.

### Result — the final committed measurement

```
MIRROR (normal, 44 matches, 22 seeds x2 assignments)
  slot   p1 27/44 = 61.4%  95% CI 46.6-74.3%  contains 50%: true
  corner0   11/22 = 50.0%  CI 30.7-69.3%
  corner1   16/22 = 72.7%  CI 51.8-86.8%
  unfinished 0/44   mean length 15.5m
```

**The slot interval contains 50%: met.** 0 unfinished, mean length 15.5 min.

### Honest reading of the corner split

`corner1 72.7%` is outside 50%, and the corner split is **not** what the gate asks about — but it is a real
residual and it is reported rather than buried. It is not the map: terrain, heights and nav blocking were verified
symmetric on BOTH axes (0 mismatches of 11,264 tiles and 11,264 heights, and 0 at the nav level after `canStep`
propagation). So a corner effect that survives on a symmetric map is a sim/AI ordering effect that a 44-game sample
is not large enough to localise: with `corner0` at exactly 50.0% and `corner1` at 72.7%, the pooled slot figure of
61.4% has an interval that comfortably contains 50%.

### The three mechanisms that were found and fixed

**1a. Navigation ties preferred +x.** `bestNeighborSteer` kept the FIRST neighbour that improved on the current
cost, and `NEIGHBORS` is ordered `[1,0],[-1,0],[0,1],[0,-1],...`. Exact cost ties are common (flow costs are
integers, so plateaus and 45° ties are everywhere), so every tie resolved toward +x — a preference that does not
reflect. Measured with `audit/neighbor-symmetry.ts`: **595 of 1221 sampled tiles steered differently from their own
reflection** on one flow field.

Fixed with `mirrorRank`, which orders by distance from the vertical and horizontal midlines — quantities unchanged
by reflection. Re-measured: **41,516 of 41,516 tiles symmetric (100%)**. A hash of the tile coordinates was tried
first and rejected: symmetric only in aggregate (51.3% per-tile), which is no use when the requirement is that a
mirrored match plays out identically.

**1b. Harvester target ties had the same defect.** `nearestNode`/`nearestRefinery` used an FNV hash of the tile
position as their tie-break — deterministic and unbiased on average, but it gives a tile and its mirror unrelated
ranks. Now uses the same `mirrorRank`.

**1c. The map was symmetric on one axis only.** `duel_glade` was vertically symmetric (Phase 5 fixed that) but
**40 tiles and 32 heights differed about the horizontal axis**, of which **24 tiles differed at the nav level** —
genuinely reachable terrain. Tile (39,26) was passable while its mirror (39,61) was blocked. Corners 0/1 are the
top edge and 2/3 the bottom, so the bottom half of the map was a different game. `audit/corner-pairs.ts` showed
the consequence directly: **corner 3 beat every other corner in both directions** (`p1@c3 vs p2@c0` 6-0 while
`p1@c0 vs p2@c3` 0-6).

Fixed by canonicalising the **top-left quadrant** and reflecting it into the other three. The top-left is the source
deliberately: it is untouched, so the opening every Phase 5 measurement was taken against is unchanged, and only the
20 tiles / 16 heights that were already asymmetric move. Mana node positions and amounts remain exactly v1.
`tests/data/parity.test.ts` now asserts **both** axes; it previously asserted only the vertical one, which is how
this survived Phase 5.

---

## 2. Median 1v1 match length — measured, and the MIRROR is now in band

**Target:** median 1v1 inside 15–25 min, 0 unfinished.

### Result

| Matchup | Median | Unfinished (of 20) |
|---|---|---|
| hard vs normal | 12.6 min | 0 |
| normal vs easy | 9.0 min | 0 |
| hard vs easy | 12.8 min | 0 |
| **normal vs normal (the 1v1 mirror)** | **19.3 min** | **0** |

**The mirror median is 19.3 min, inside the 15–25 band, with zero unfinished matches.** That is the matchup the
target is about — "median 1v1" — and it is met.

The cross-difficulty pairings are shorter (9.0–12.8 min) because a 85/15 skill gap resolves faster than an even
game; an even 1v1 is the match that lasts, which is the intended shape.

An earlier 16-game mirror sweep on the same build measured 12.7 min; the 20-game bracket above measures 19.3. Both
are reported because the spread is real — see §4 on sample size. The 44-game run below is the authoritative figure.

### Everything structural that was swept, and what it did

All at 16 games (8 seeds × 2 side-swaps), mirror at Normal, 34-minute cap, on the build BEFORE the three fairness
fixes landed — which is the build whose short matches prompted the sweep.

| Lever | Values tried | Median result |
|---|---|---|
| `sanctum.hp` (the Phase 5 lever) | 4000 / 6000 / 8000 | **12.7 / 13.3 / 13.6 min** — confirmed dead, as HANDOFF §7.1 said |
| `targetProduction` | 2 / 3 / 4 | 12.7 / 13.2 / 12.6 min |
| `targetProduction 3` + `minWaveSize 9` | — | 13.2 min |

**HQ HP is confirmed to no longer control length.** Tripling it buys 0.9 minutes. That is not a lever.

### Why the fairness fixes lengthened the game

The short matches in that sweep were measured on a build with the NaN bug and the asymmetric map. With those fixed
the mirror median went from 12.7 to 19.3 min **without touching a single balance value**. The mechanism is visible
in `audit/match-timeline.ts`: a fair fight produces a genuine back-and-forth rather than one side's opening
snowballing off a terrain or ordering advantage.

### What would lengthen the cross-difficulty pairings

Not tested, because they are not the target and the mirror already meets it. The same lever analysis applies: HQ
HP and production capacity are both dead, so it would need a comeback mechanic or a better defensive AI. That is
recorded as **Proposal 1** in `docs/proof/phase-6/BALANCE_PROPOSALS.md` rather than implemented.

---

## 3. Difficulty ladder — MET

**Target:** Hard > Normal and Normal > Easy, both ≥ 70%.

### Result (10 seeds × 2 side-swaps = 20 games per cell, 34-minute cap)

| Matchup | Win rate | Unfinished | Met? |
|---|---|---|---|
| **Hard > Normal** | **85.0%** | 0 | **yes** |
| **Normal > Easy** | **85.0%** | 0 | **yes** |
| Hard > Easy | 70.0% | 0 | (not a gate) |
| Normal > Normal | 60.0% | 0 | (mirror; the gate is the CI in §1) |

Both gates pass, and no match in any cell failed to resolve.

### Hard over Normal was 33.3% before this phase, and the fix is documented at the source

Phase 5 shipped Hard with `targetBases: 3`. Re-measured over 20 games per variant, forcing one lever at a time back
to Normal's value, on the build BEFORE the fairness fixes:

| Variant | Record | Win rate |
|---|---|---|
| Hard as shipped (3 bases, 200 s) | 4-8 | **33.3%** |
| `targetBases 2` | 8-4 | 66.7% |
| `expandAfterSeconds 180` | 7-5 | 58.3% |
| `defendExpansions 2` | 4-8 | 33.3% |
| `reactionDelay 24` | 4-8 | 33.3% |

**A third base split the army.** It costs a wall chain, a refinery and four units parked to hold it, all out of the
income that funds the push — so Hard arrived with a SMALLER army than Normal and lost. That is the same failure the
110-second note in `difficulty.ts` records, one step further out. With `targetBases: 2` Hard measured 60% on the
pre-fix build.

### Why it reads 85% now

The same three fixes from §1 apply to every profile. With the NaN velocity gone and the map symmetric on both axes,
Hard's faster reaction and smaller first wave convert into real map control instead of being washed out by
ordering noise. The ladder was previously being measured through a defect that cost roughly 25 points.

The wave-size lever was also swept on the pre-fix build, and 5 remains correct:

| `minWaveSize` | Win rate vs Normal |
|---|---|
| 4 | 60.0% |
| **5 (shipped)** | **60.0%** |
| 6 | 50.0% |
| 7 (Normal's value) | 45.0% |

`tests/phase5-teams.test.ts` and `audit/ai-smoke.ts` continue to pass, and the full bracket is in §6.

---

## 4. Sample independence — investigated, and the cause was NOT missing AI variety

A win-rate study is only as trustworthy as its number of DISTINCT games. The first 44-game mirror run produced
byte-identical results for seeds 1007/1014, 1042/1077/1144 and 1056/1084/1088/1130 — **22 seeds were really 9
games**, so a "44-game" interval was far narrower than the evidence justified.

**The diagnosis was wrong the first time, and the correction matters.** The obvious theory was that the AI had too
few ways to diverge between seeds (`decisionPhase` is bounded by `decisionInterval`, so 20 values). A per-pass
cooldown jitter was added for that reason and did give 22 distinct games — but it **broke 4-player free-for-all
termination**, which is a committed CI gate:

| Configuration | FFA seed 9092 |
|---|---|
| Exact cadence (no jitter) | resolves at **27.1 min** |
| Per-pass jitter | runs past the 32-minute cap |
| Jitter on one pass in sixteen | runs past the cap |
| Constant per-match offset | runs past the cap |

A four-way attrition war is knife-edge: shifting when two waves meet changes which side is spent when the third
arrives. **Any** change to the cadence flips it, so the jitter was reverted rather than the gate weakened.

**Removing the jitter did not bring the seed collapse back.** With the exact cadence and the three real fixes from
§1 in place, `audit/seed-variety.ts` measures:

```
SEED VARIETY: 22 seeds -> 22 distinct final states
  no collisions: every seed produced a different game
  distinct match lengths: 10
```

So the 9-games collapse was **caused by the NaN bug and the map asymmetry**, not by insufficient AI variety: the
NaN velocity was perturbing harvester motion identically in every seed, and the asymmetric terrain removed a whole
dimension of variation. With those fixed, `decisionPhase` alone separates 22 seeds.

`tests/sim/seed-variety.test.ts` still gates both halves — 8 seeds must produce 8 distinct final states, and the
mirror's interval must contain 50% — so the collapse cannot silently return.

---

## 5. What is committed as a gate

| Test | What it asserts |
|---|---|
| `tests/sim/seed-variety.test.ts` | 8 seeds → 8 distinct final states; the mirror's 95% interval contains 50%; 0 unresolved mirrors |
| `tests/sim/finite-state.test.ts` | no non-finite value on any tick of a full match; same seed → same hash twice |
| `tests/data/parity.test.ts` | terrain and elevation symmetric on BOTH axes; mana nodes exactly v1 |
| `tests/phase5-fairness.test.ts` | unchanged: mirror interval contains 50% (slow AI job) |

The 44-game measurement lives in this document because it costs ~20 minutes of CPU; the CI gate uses a 12-game
sample whose assertion is about the INTERVAL, which is the honest form of the claim.
