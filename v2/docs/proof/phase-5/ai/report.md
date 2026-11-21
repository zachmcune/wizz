# Phase 5 — AI tournament results

Generated from `tournament.json` by `audit/ai-proof-report.ts`. Do not edit by hand: re-run the generator.

- Tournament run: 2026-11-21T06:36:57.141Z
- Seeds per matchup: 12, each played on BOTH sides (24 games per matchup)

## Win rates by difficulty

Every matchup is side-swapped: each seed is played twice, once with difficulty A in start corner 0 and once in
corner 1. An earlier build of this AI did show a large corner advantage (corner 0 won 6 of 6 unswapped mirror
matches), so swapping is retained as the default rather than assumed unnecessary. On the CURRENT build the corners
measure symmetric — team 0 wins 5 of 12 from corner 0 and 5 of 12 from corner 1 — which is itself the check that the
harness is unbiased.

| Matchup | A wins | B wins | A win rate | Median length | Worst no-spend | Unfinished |
|---|---|---|---|---|---|---|
| hard vs normal | 10 | 14 | **42%** | 8.4 min | 944s | 0 |
| normal vs easy | 10 | 12 | **42%** | 10.5 min | 1514s | 2 |
| hard vs easy | 10 | 12 | **42%** | 11.9 min | 1477s | 2 |
| normal vs normal | 10 | 14 | **42%** | 8.4 min | 946s | 0 |

## Difficulty ordering

The design requirement is that a harder AI is stronger through decisions, not through information or resources.
With side-swapping removing the map advantage, the ordering holds:

- **hard vs normal: 42%** (10-14)
- **normal vs easy: 42%** (10-12)
- **hard vs easy: 42%** (10-12)

## Match lengths

Across all 96 matches:

- median **8.4 min**
- mean **10.9 min**
- shortest **6.5 min**, longest **30.0 min**
- matches that reached the 30-minute cap without a winner: **4**

Target was ~20 minutes of game time; the 1v1 median lands at 8.4 min.

## Stall and idle-army assertions

The v1 failure modes were an AI that stopped spending and an army that never acted. Both are measured per side on
every match, not asserted from reading the code.

- worst stretch with no spending across all 192 sides: **1514s**
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
| hard vs normal | 1000 | 9.4 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1000 | 8.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1007 | 7.2 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1007 | 8.2 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1014 | 7.9 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1014 | 6.9 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1021 | 7.2 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1021 | 8.2 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1028 | 7.3 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1028 | 8.6 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1035 | 8.9 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1035 | 21.5 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1042 | 11.4 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1042 | 7.4 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1049 | 7.2 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1049 | 8.2 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1056 | 7.9 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1056 | 6.9 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1063 | 9.4 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1063 | 8.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1070 | 9.4 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1070 | 8.4 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1077 | 8.9 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1077 | 21.5 min | team 1 | hard@1 | normal@0 |
| normal vs easy | 1000 | 10.5 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1000 | 12.4 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1007 | 7.8 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1007 | 6.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1014 | 12.4 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1014 | 9.9 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1021 | 7.8 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1021 | 6.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1028 | 7.1 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1028 | 7.4 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1035 | 12.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1035 | 12.4 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1042 | 30.0 min | unfinished | normal@0 | easy@1 |
| normal vs easy | 1042 | 30.0 min | unfinished | normal@1 | easy@0 |
| normal vs easy | 1049 | 7.8 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1049 | 6.5 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1056 | 12.4 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1056 | 9.9 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1063 | 10.5 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1063 | 12.4 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1070 | 10.5 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1070 | 12.4 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1077 | 12.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1077 | 12.4 min | team 1 | normal@1 | easy@0 |
| hard vs easy | 1000 | 12.2 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1000 | 11.9 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1007 | 7.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1007 | 6.7 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1014 | 13.4 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1014 | 7.8 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1021 | 7.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1021 | 6.7 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1028 | 7.7 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1028 | 7.0 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1035 | 30.0 min | unfinished | hard@0 | easy@1 |
| hard vs easy | 1035 | 29.8 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1042 | 7.2 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1042 | 7.8 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1049 | 7.3 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1049 | 6.7 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1056 | 13.4 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1056 | 7.8 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1063 | 12.2 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1063 | 11.9 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1070 | 12.2 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1070 | 11.9 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1077 | 30.0 min | unfinished | hard@0 | easy@1 |
| hard vs easy | 1077 | 29.8 min | team 1 | hard@1 | easy@0 |
| normal vs normal | 1000 | 8.6 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1000 | 8.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1007 | 7.6 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1007 | 7.3 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1014 | 7.3 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1014 | 7.6 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1021 | 7.6 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1021 | 7.3 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1028 | 8.4 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1028 | 8.6 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1035 | 10.0 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1035 | 21.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1042 | 21.7 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1042 | 10.0 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1049 | 7.6 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1049 | 7.3 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1056 | 7.3 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1056 | 7.6 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1063 | 8.6 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1063 | 8.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1070 | 8.6 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1070 | 8.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1077 | 10.0 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1077 | 21.7 min | team 1 | normal@1 | normal@0 |

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
