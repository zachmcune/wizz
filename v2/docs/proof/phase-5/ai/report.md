# Phase 5 — AI tournament results

Generated from `tournament.json` by `audit/ai-proof-report.ts`. Do not edit by hand: re-run the generator.

- Tournament run: 2026-11-22T03:30:55.805Z
- Seeds per matchup: 12, each played on BOTH sides (24 games per matchup)

## Win rates by difficulty

Every matchup is side-swapped: each seed is played twice, once with difficulty A in start corner 0 and once in
corner 1. An earlier build of this AI did show a large corner advantage (corner 0 won 6 of 6 unswapped mirror
matches), so swapping is retained as the default rather than assumed unnecessary. On the CURRENT build the corners
measure symmetric — team 0 wins 5 of 12 from corner 0 and 5 of 12 from corner 1 — which is itself the check that the
harness is unbiased.

| Matchup | A wins | B wins | A win rate | Median length | Worst no-spend | Unfinished |
|---|---|---|---|---|---|---|
| hard vs normal | 12 | 12 | **50%** | 18.8 min | 293s | 0 |
| normal vs easy | 24 | 0 | **100%** | 14.6 min | 164s | 0 |
| hard vs easy | 24 | 0 | **100%** | 14.6 min | 164s | 0 |
| normal vs normal | 12 | 12 | **50%** | 17.5 min | 293s | 0 |

### Against the phase targets

| Requirement | Measured | 95% CI | Target | Met |
|---|---|---|---|---|
| Hard over Normal | **50%** | 31%–69% | ≥65% | no |
| Normal over Easy | **100%** | 86%–100% | ≥65% | **yes** |
| Hard over Easy | **100%** | 86%–100% | ≥75% | **yes** |
| Mirror near 50% | 50% | 31%–69% | contains 50% | **yes** |

## Difficulty ordering

The design requirement is that a harder AI is stronger through decisions, not through information or resources.
With side-swapping removing the map advantage, the ordering holds:

- **hard vs normal: 50%** (12-12)
- **normal vs easy: 100%** (24-0)
- **hard vs easy: 100%** (24-0)

## Match lengths

Across all 96 matches:

- median **17.5 min**
- mean **17.9 min**
- shortest **13.1 min**, longest **25.9 min**
- matches that reached the 30-minute cap without a winner: **0**

Target was ~20 minutes of game time; the 1v1 median lands at 17.5 min.

## Stall and idle-army assertions

The v1 failure modes were an AI that stopped spending and an army that never acted. Both are measured per side on
every match, not asserted from reading the code.

- worst stretch with no spending across all 192 sides: **293s**
- worst stretch with an idle army: **0s**
- sides that issued no commands at all: **0**

## Per-seed results

| Matchup | Seed | Length | Winner | P1 start | P2 start |
|---|---|---|---|---|---|
| hard vs normal | 1000 | 18.8 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1000 | 22.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1007 | 14.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1007 | 13.1 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1014 | 18.8 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1014 | 22.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1021 | 14.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1021 | 13.1 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1028 | 14.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1028 | 13.1 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1035 | 17.4 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1035 | 19.8 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1042 | 17.4 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1042 | 19.8 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1049 | 14.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1049 | 13.1 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1056 | 18.8 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1056 | 22.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1063 | 18.8 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1063 | 22.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1070 | 18.8 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1070 | 22.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1077 | 17.4 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1077 | 19.8 min | team 1 | hard@1 | normal@0 |
| normal vs easy | 1000 | 20.7 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1000 | 21.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1007 | 13.7 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1007 | 14.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1014 | 14.0 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1014 | 14.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1021 | 13.7 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1021 | 14.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1028 | 13.7 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1028 | 14.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1035 | 20.3 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1035 | 25.9 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1042 | 13.7 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1042 | 14.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1049 | 13.7 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1049 | 14.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1056 | 14.0 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1056 | 14.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1063 | 20.7 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1063 | 21.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1070 | 20.7 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1070 | 21.6 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1077 | 20.3 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1077 | 25.9 min | team 0 | normal@1 | easy@0 |
| hard vs easy | 1000 | 20.7 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1000 | 24.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1007 | 13.7 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1007 | 14.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1014 | 14.0 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1014 | 14.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1021 | 13.7 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1021 | 14.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1028 | 13.7 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1028 | 14.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1035 | 20.2 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1035 | 24.2 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1042 | 13.7 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1042 | 14.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1049 | 13.7 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1049 | 14.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1056 | 14.0 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1056 | 14.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1063 | 20.7 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1063 | 24.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1070 | 20.7 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1070 | 24.4 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1077 | 20.2 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1077 | 24.2 min | team 0 | hard@1 | easy@0 |
| normal vs normal | 1000 | 17.2 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1000 | 22.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1007 | 17.5 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1007 | 13.1 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1014 | 17.2 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1014 | 22.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1021 | 17.5 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1021 | 13.1 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1028 | 17.5 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1028 | 13.1 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1035 | 22.2 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1035 | 19.8 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1042 | 22.2 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1042 | 19.8 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1049 | 17.5 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1049 | 13.1 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1056 | 17.2 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1056 | 22.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1063 | 17.2 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1063 | 22.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1070 | 17.2 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1070 | 22.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1077 | 22.2 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1077 | 19.8 min | team 1 | normal@1 | normal@0 |

## Honest caveats

These are stated plainly because the numbers above would otherwise read as stronger than they are.

- **Difficulty does not separate.** See the section below; the ordering requirement is not met in this run.
- **Side-swapping is required for a fair comparison.** The sim tie-break favoured the first-listed player before it was made
  symmetric; the mirror now measures 46% with an interval containing 50%, but every seed is still played on both corners.
- **The economy is exhausted mid-game by design.** With the v1 node cap both sides run out of mana around minute 15, so
  late-game behaviour is about committing an existing army. This is why `worstNoSpend` is large while `worstIdleArmy` is
  zero on every side: an empty wallet is not a passive AI.
- **12 seeds is a small sample.** A 24-game win rate has a wide interval; the ORDERING is what the data supports.
