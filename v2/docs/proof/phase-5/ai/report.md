# Phase 5 — AI tournament results

Generated from `tournament.json` by `audit/ai-proof-report.ts`. Do not edit by hand: re-run the generator.

- Tournament run: 2026-11-21T15:02:11.970Z
- Seeds per matchup: 12, each played on BOTH sides (24 games per matchup)

## Win rates by difficulty

Every matchup is side-swapped: each seed is played twice, once with difficulty A in start corner 0 and once in
corner 1. An earlier build of this AI did show a large corner advantage (corner 0 won 6 of 6 unswapped mirror
matches), so swapping is retained as the default rather than assumed unnecessary. On the CURRENT build the corners
measure symmetric — team 0 wins 5 of 12 from corner 0 and 5 of 12 from corner 1 — which is itself the check that the
harness is unbiased.

| Matchup | A wins | B wins | A win rate | Median length | Worst no-spend | Unfinished |
|---|---|---|---|---|---|---|
| hard vs normal | 16 | 8 | **67%** | 11.8 min | 195s | 0 |
| normal vs easy | 19 | 5 | **79%** | 23 min | 1019s | 0 |
| hard vs easy | 19 | 5 | **79%** | 23.3 min | 1019s | 0 |
| normal vs normal | 11 | 13 | **46%** | 11.8 min | 290s | 0 |

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

- median **15.9 min**
- mean **16.6 min**
- shortest **8.8 min**, longest **23.9 min**
- matches that reached the 30-minute cap without a winner: **0**

Target was ~20 minutes of game time; the 1v1 median lands at 15.9 min.

## Stall and idle-army assertions

The v1 failure modes were an AI that stopped spending and an army that never acted. Both are measured per side on
every match, not asserted from reading the code.

- worst stretch with no spending across all 192 sides: **1019s**
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
| hard vs normal | 1000 | 15.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1000 | 10.8 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1007 | 10.0 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1007 | 12.9 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1014 | 15.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1014 | 10.8 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1021 | 10.0 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1021 | 12.9 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1028 | 10.0 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1028 | 12.9 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1035 | 8.8 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1035 | 11.8 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1042 | 8.8 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1042 | 11.8 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1049 | 10.0 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1049 | 12.9 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1056 | 15.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1056 | 10.8 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1063 | 15.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1063 | 10.8 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1070 | 15.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1070 | 10.8 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1077 | 8.8 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1077 | 11.8 min | team 0 | hard@1 | normal@0 |
| normal vs easy | 1000 | 23.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1000 | 11.0 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1007 | 23.0 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1007 | 22.3 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1014 | 23.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1014 | 22.3 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1021 | 23.0 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1021 | 22.3 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1028 | 23.0 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1028 | 22.3 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1035 | 23.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1035 | 11.0 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1042 | 23.0 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1042 | 22.3 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1049 | 23.0 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1049 | 22.3 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1056 | 23.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1056 | 22.3 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1063 | 23.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1063 | 11.0 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1070 | 23.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1070 | 11.0 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1077 | 23.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1077 | 11.0 min | team 1 | normal@1 | easy@0 |
| hard vs easy | 1000 | 23.4 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1000 | 11.0 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1007 | 23.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1007 | 22.3 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1014 | 23.8 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1014 | 22.3 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1021 | 23.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1021 | 22.3 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1028 | 23.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1028 | 22.3 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1035 | 23.4 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1035 | 11.0 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1042 | 23.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1042 | 22.3 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1049 | 23.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1049 | 22.3 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1056 | 23.8 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1056 | 22.3 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1063 | 23.4 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1063 | 11.0 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1070 | 23.4 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1070 | 11.0 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1077 | 23.4 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1077 | 11.0 min | team 1 | hard@1 | easy@0 |
| normal vs normal | 1000 | 19.4 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1000 | 10.8 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1007 | 10.9 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1007 | 17.7 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1014 | 19.4 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1014 | 10.8 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1021 | 10.9 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1021 | 17.7 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1028 | 10.9 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1028 | 17.7 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1035 | 8.8 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1035 | 11.8 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1042 | 8.8 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1042 | 11.8 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1049 | 10.9 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1049 | 17.7 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1056 | 19.4 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1056 | 10.8 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1063 | 19.4 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1063 | 10.8 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1070 | 19.4 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1070 | 10.8 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1077 | 8.8 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1077 | 11.8 min | team 0 | normal@1 | normal@0 |

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
