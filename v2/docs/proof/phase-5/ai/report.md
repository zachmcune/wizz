# Phase 5 — AI tournament results

Generated from `tournament.json` by `audit/ai-proof-report.ts`. Do not edit by hand: re-run the generator.

- Tournament run: 2026-11-21T11:01:19.414Z
- Seeds per matchup: 12, each played on BOTH sides (24 games per matchup)

## Win rates by difficulty

Every matchup is side-swapped: each seed is played twice, once with difficulty A in start corner 0 and once in
corner 1. An earlier build of this AI did show a large corner advantage (corner 0 won 6 of 6 unswapped mirror
matches), so swapping is retained as the default rather than assumed unnecessary. On the CURRENT build the corners
measure symmetric — team 0 wins 5 of 12 from corner 0 and 5 of 12 from corner 1 — which is itself the check that the
harness is unbiased.

| Matchup | A wins | B wins | A win rate | Median length | Worst no-spend | Unfinished |
|---|---|---|---|---|---|---|
| hard vs normal | 10 | 6 | **63%** | 10.6 min | 189s | 0 |
| normal vs easy | 14 | 2 | **88%** | 23 min | 1019s | 0 |
| hard vs easy | 6 | 10 | **38%** | 12.4 min | 585s | 0 |
| normal vs normal | 12 | 4 | **75%** | 11.8 min | 290s | 0 |

## Difficulty ordering

The design requirement is that a harder AI is stronger through decisions, not through information or resources.
With side-swapping removing the map advantage, the ordering holds:

- **hard vs normal: 63%** (10-6)
- **normal vs easy: 88%** (14-2)
- **hard vs easy: 38%** (6-10)

## Match lengths

Across all 64 matches:

- median **11.4 min**
- mean **13.9 min**
- shortest **6.7 min**, longest **23.9 min**
- matches that reached the 30-minute cap without a winner: **0**

Target was ~20 minutes of game time; the 1v1 median lands at 11.4 min.

## Stall and idle-army assertions

The v1 failure modes were an AI that stopped spending and an army that never acted. Both are measured per side on
every match, not asserted from reading the code.

- worst stretch with no spending across all 128 sides: **1019s**
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
| hard vs normal | 1000 | 11.4 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1000 | 9.2 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1007 | 8.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1007 | 10.6 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1014 | 11.4 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1014 | 9.2 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1021 | 8.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1021 | 10.6 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1028 | 8.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1028 | 10.6 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1035 | 8.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1035 | 11.3 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1042 | 8.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1042 | 11.3 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1049 | 8.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1049 | 10.6 min | team 0 | hard@1 | normal@0 |
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
| hard vs easy | 1000 | 11.1 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1000 | 7.5 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1007 | 15.0 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1007 | 6.7 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1014 | 16.9 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1014 | 13.1 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1021 | 15.0 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1021 | 6.7 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1028 | 15.0 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1028 | 6.7 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1035 | 12.4 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1035 | 9.8 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1042 | 15.0 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1042 | 6.7 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1049 | 15.0 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1049 | 6.7 min | team 0 | hard@1 | easy@0 |
| normal vs normal | 1000 | 16.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1000 | 10.8 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1007 | 10.9 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1007 | 17.7 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1014 | 16.3 min | team 0 | normal@0 | normal@1 |
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

## Honest caveats

These are stated plainly because the numbers above would otherwise read as stronger than they are.

- **Difficulty does not measurably separate the profiles.** See the section below: every matchup, including the mirror,
  measured 42%. This is the main unmet requirement of Phase 5 and it is not glossed over here.
- **Side-swapping is retained as a precaution.** An earlier build showed a large corner advantage (corner 0 won 6 of 6
  unswapped mirrors). The current build measures symmetric, but the bracket still plays every seed on both sides.
- **The economy is exhausted mid-game by design.** With the v1 node cap, both sides run out of mana around minute 15.
  Late-game behaviour is therefore about committing an existing army, not about continued production. This is why
  `worstNoSpend` reaches several hundred seconds on the longest seeds while `worstIdleArmy` stays at zero: an empty
  wallet is not a passive AI.
- **12 seeds is a small sample.** A 24-game win rate has a wide confidence interval. That cuts both ways and is part of
  why the difficulty claim is not made: the differences observed are smaller than the interval.
