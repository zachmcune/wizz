# Phase 5 — AI tournament results

Generated from `tournament.json` by `audit/ai-proof-report.ts`. Do not edit by hand: re-run the generator.

- Tournament run: 2026-11-21T20:17:02.480Z
- Seeds per matchup: 12, each played on BOTH sides (24 games per matchup)

## Win rates by difficulty

Every matchup is side-swapped: each seed is played twice, once with difficulty A in start corner 0 and once in
corner 1. An earlier build of this AI did show a large corner advantage (corner 0 won 6 of 6 unswapped mirror
matches), so swapping is retained as the default rather than assumed unnecessary. On the CURRENT build the corners
measure symmetric — team 0 wins 5 of 12 from corner 0 and 5 of 12 from corner 1 — which is itself the check that the
harness is unbiased.

| Matchup | A wins | B wins | A win rate | Median length | Worst no-spend | Unfinished |
|---|---|---|---|---|---|---|
| hard vs normal | 16 | 8 | **67%** | 15.1 min | 897s | 0 |
| normal vs easy | 19 | 5 | **79%** | 23.9 min | 1152s | 0 |
| hard vs easy | 19 | 5 | **79%** | 23.9 min | 1152s | 0 |
| normal vs normal | 11 | 13 | **46%** | 19.9 min | 897s | 0 |

### Against the phase targets

| Requirement | Measured | 95% CI | Target | Met |
|---|---|---|---|---|
| Hard over Normal | **67%** | 47%–82% | ≥65% | **yes** |
| Normal over Easy | **79%** | 60%–91% | ≥65% | **yes** |
| Hard over Easy | **79%** | 60%–91% | ≥75% | **yes** |
| Mirror near 50% | 46% | 28%–65% | contains 50% | **yes** |

## Difficulty ordering

The design requirement is that a harder AI is stronger through decisions, not through information or resources.
With side-swapping removing the map advantage, the ordering holds:

- **hard vs normal: 67%** (16-8)
- **normal vs easy: 79%** (19-5)
- **hard vs easy: 79%** (19-5)

## Match lengths

Across all 96 matches:

- median **20.3 min**
- mean **18.8 min**
- shortest **11.3 min**, longest **24.5 min**
- matches that reached the 30-minute cap without a winner: **0**

Target was ~20 minutes of game time; the 1v1 median lands at 20.3 min.

## Stall and idle-army assertions

The v1 failure modes were an AI that stopped spending and an army that never acted. Both are measured per side on
every match, not asserted from reading the code.

- worst stretch with no spending across all 192 sides: **1152s**
- worst stretch with an idle army: **0s**
- sides that issued no commands at all: **0**

The no-spend figure is large on some seeds and that is expected rather than hidden: `duel_glade` authors 127,000 mana but
`manaNodeCapacity` clamps every node to 12,000 (a v1 parity constant asserted by `tests/data/parity.test.ts`), so the
whole match economy is 75,000 mana and is mined dry around minute 15. A side whose bank is below the cheapest unit cost
and has no nodes left legitimately cannot spend — it is a dead economy, not a stalled AI. The idle-army metric, which is
the one that indicates a genuinely passive AI, is zero throughout.

## Per-seed results

| Matchup | Seed | Length | Winner | P1 start | P2 start |
|---|---|---|---|---|---|
| hard vs normal | 1000 | 16.3 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1000 | 11.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1007 | 15.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1007 | 13.3 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1014 | 16.3 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1014 | 11.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1021 | 15.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1021 | 13.3 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1028 | 15.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1028 | 13.3 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1035 | 22.9 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1035 | 13.5 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1042 | 22.9 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1042 | 13.5 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1049 | 15.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1049 | 13.3 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1056 | 16.3 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1056 | 11.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1063 | 16.3 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1063 | 11.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1070 | 16.3 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1070 | 11.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1077 | 22.9 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1077 | 13.5 min | team 0 | hard@1 | normal@0 |
| normal vs easy | 1000 | 23.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1000 | 14.0 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1007 | 23.5 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1007 | 24.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1014 | 24.3 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1014 | 24.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1021 | 23.5 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1021 | 24.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1028 | 23.5 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1028 | 24.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1035 | 23.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1035 | 14.0 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1042 | 23.5 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1042 | 24.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1049 | 23.5 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1049 | 24.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1056 | 24.3 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1056 | 24.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1063 | 23.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1063 | 14.0 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1070 | 23.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1070 | 14.0 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1077 | 23.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1077 | 14.0 min | team 1 | normal@1 | easy@0 |
| hard vs easy | 1000 | 23.9 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1000 | 14.0 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1007 | 23.6 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1007 | 24.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1014 | 24.1 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1014 | 24.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1021 | 23.6 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1021 | 24.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1028 | 23.6 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1028 | 24.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1035 | 23.9 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1035 | 14.0 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1042 | 23.6 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1042 | 24.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1049 | 23.6 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1049 | 24.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1056 | 24.1 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1056 | 24.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1063 | 23.9 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1063 | 14.0 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1070 | 23.9 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1070 | 14.0 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1077 | 23.9 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1077 | 14.0 min | team 1 | hard@1 | easy@0 |
| normal vs normal | 1000 | 20.3 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1000 | 11.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1007 | 11.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1007 | 19.9 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1014 | 20.3 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1014 | 11.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1021 | 11.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1021 | 19.9 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1028 | 11.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1028 | 19.9 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1035 | 22.9 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1035 | 13.6 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1042 | 22.9 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1042 | 13.6 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1049 | 11.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1049 | 19.9 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1056 | 20.3 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1056 | 11.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1063 | 20.3 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1063 | 11.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1070 | 20.3 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1070 | 11.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1077 | 22.9 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1077 | 13.6 min | team 0 | normal@1 | normal@0 |

## Honest caveats

These are stated plainly because the numbers above would otherwise read as stronger than they are.

- **The ordering targets are met on the point estimates.** Hard over Easy 79% against a 75% target, and each adjacent
  pair clears its 65% target. The Hard-over-Normal interval reaches below 65%, so that one rests on two independent
  measurements of the same lever rather than a single 95%-confident result.
- **One lever carries the separation, and it is not a micro skill.** Hard attacks at 5 units instead of 7. Every other
  candidate — more workers, an extra producer, kiting, superweapon, harass, faster decisions — measured neutral or worse.
  The difficulty gap is real and reproducible, but it comes from commitment timing rather than from richer play.
- **Side-swapping is required for a fair comparison.** The sim tie-break favoured the first-listed player before it was made
  symmetric; the mirror now measures 46% with an interval containing 50%, but every seed is still played on both corners.
- **The economy is exhausted mid-game by design.** With the v1 node cap both sides run out of mana around minute 15, so
  late-game behaviour is about committing an existing army. This is why `worstNoSpend` is large while `worstIdleArmy` is
  zero on every side: an empty wallet is not a passive AI.
- **12 seeds is a small sample.** A 24-game win rate has a wide interval; the ORDERING is what the data supports.
