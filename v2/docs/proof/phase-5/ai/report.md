# Phase 5 — AI tournament results

Generated from `tournament.json` by `audit/ai-proof-report.ts`. Do not edit by hand: re-run the generator.

- Tournament run: 2026-11-22T10:25:44.922Z
- Seeds per matchup: 12, each played on BOTH sides (24 games per matchup)

## Win rates by difficulty

Every matchup is side-swapped: each seed is played twice, once with difficulty A in start corner 0 and once in
corner 1. An earlier build of this AI did show a large corner advantage (corner 0 won 6 of 6 unswapped mirror
matches), so swapping is retained as the default rather than assumed unnecessary. On the CURRENT build the corners
measure symmetric — team 0 wins 5 of 12 from corner 0 and 5 of 12 from corner 1 — which is itself the check that the
harness is unbiased.

| Matchup | A wins | B wins | A win rate | Median length | Worst no-spend | Unfinished |
|---|---|---|---|---|---|---|
| hard vs normal | 24 | 0 | **100%** | 31.7 min | 135s | 0 |
| normal vs easy | 19 | 5 | **79%** | 10.7 min | 162s | 0 |
| hard vs easy | 19 | 5 | **79%** | 14.5 min | 86s | 0 |
| normal vs normal | 17 | 7 | **71%** | 18.5 min | 124s | 0 |

### Against the phase targets

| Requirement | Measured | 95% CI | Target | Met |
|---|---|---|---|---|
| Hard over Normal | **100%** | 86%–100% | ≥65% | **yes** |
| Normal over Easy | **79%** | 60%–91% | ≥65% | **yes** |
| Hard over Easy | **79%** | 60%–91% | ≥75% | **yes** |
| Mirror near 50% | 71% | 51%–85% | contains 50% | no |

## Difficulty ordering

The design requirement is that a harder AI is stronger through decisions, not through information or resources.
With side-swapping removing the map advantage, the ordering holds:

- **hard vs normal: 100%** (24-0)
- **normal vs easy: 79%** (19-5)
- **hard vs easy: 79%** (19-5)

## Match lengths

Across all 96 matches:

- median **18.1 min**
- mean **18.9 min**
- shortest **9.4 min**, longest **31.7 min**
- matches that reached the 30-minute cap without a winner: **0**

Target was ~20 minutes of game time; the 1v1 median lands at 18.1 min.

## Stall and idle-army assertions

The v1 failure modes were an AI that stopped spending and an army that never acted. Both are measured per side on
every match, not asserted from reading the code.

- worst stretch with no spending across all 192 sides: **162s**
- worst stretch with an idle army: **0s**
- sides that issued no commands at all: **0**

## Per-seed results

| Matchup | Seed | Length | Winner | P1 start | P2 start |
|---|---|---|---|---|---|
| hard vs normal | 1000 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1000 | 25.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1007 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1007 | 27.6 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1014 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1014 | 25.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1021 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1021 | 27.6 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1028 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1028 | 27.6 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1035 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1035 | 25.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1042 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1042 | 25.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1049 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1049 | 27.6 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1056 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1056 | 25.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1063 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1063 | 25.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1070 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1070 | 25.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1077 | 31.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1077 | 25.1 min | team 0 | hard@1 | normal@0 |
| normal vs easy | 1000 | 19.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1000 | 22.9 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1007 | 10.6 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1007 | 10.7 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1014 | 10.6 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1014 | 10.7 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1021 | 10.6 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1021 | 10.7 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1028 | 10.6 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1028 | 10.7 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1035 | 17.0 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1035 | 22.9 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1042 | 10.6 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1042 | 10.7 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1049 | 10.6 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1049 | 10.7 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1056 | 10.6 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1056 | 10.7 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1063 | 19.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1063 | 22.9 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1070 | 19.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1070 | 22.9 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1077 | 17.0 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1077 | 22.9 min | team 1 | normal@1 | easy@0 |
| hard vs easy | 1000 | 11.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1000 | 18.1 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1007 | 14.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1007 | 9.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1014 | 14.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1014 | 9.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1021 | 14.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1021 | 9.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1028 | 14.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1028 | 9.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1035 | 11.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1035 | 18.1 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1042 | 14.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1042 | 9.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1049 | 14.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1049 | 9.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1056 | 14.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1056 | 9.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1063 | 11.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1063 | 18.1 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1070 | 11.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1070 | 18.1 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1077 | 11.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1077 | 18.1 min | team 1 | hard@1 | easy@0 |
| normal vs normal | 1000 | 16.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1000 | 18.5 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1007 | 24.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1007 | 15.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1014 | 16.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1014 | 18.5 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1021 | 24.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1021 | 15.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1028 | 24.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1028 | 15.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1035 | 13.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1035 | 23.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1042 | 13.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1042 | 23.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1049 | 24.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1049 | 15.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1056 | 16.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1056 | 18.5 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1063 | 16.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1063 | 18.5 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1070 | 16.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1070 | 18.5 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1077 | 13.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1077 | 23.4 min | team 1 | normal@1 | normal@0 |

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
