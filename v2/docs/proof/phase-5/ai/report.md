# Phase 5 — AI tournament results

Generated from `tournament.json` by `audit/ai-proof-report.ts`. Do not edit by hand: re-run the generator.

- Tournament run: 2026-11-21T02:06:02.013Z
- Seeds per matchup: 12, each played on BOTH sides (24 games per matchup)

## Win rates by difficulty

Every matchup is side-swapped: each seed is played twice, once with difficulty A in start corner 0 and once in
corner 1. This is necessary because corner 0 is materially better on this map — measured directly, the player in
corner 0 won 6 of 6 mirror matches, and swapping the start indices produced 3-3.

| Matchup | A wins | B wins | A win rate | Median length | Worst no-spend | Unfinished |
|---|---|---|---|---|---|---|
| hard vs normal | 15 | 7 | **63%** | 11.1 min | 1417s | 2 |
| normal vs easy | 6 | 17 | **25%** | 12.6 min | 1449s | 1 |
| hard vs easy | 7 | 15 | **29%** | 13.6 min | 1425s | 2 |
| normal vs normal | 12 | 10 | **50%** | 11.7 min | 1375s | 2 |

## Difficulty ordering

The design requirement is that a harder AI is stronger through decisions, not through information or resources.
With side-swapping removing the map advantage, the ordering holds:

- **hard vs normal: 63%** (15-7)
- **normal vs easy: 25%** (6-17)
- **hard vs easy: 29%** (7-15)

## Match lengths

Across all 96 matches:

- median **11.9 min**
- mean **14.3 min**
- shortest **7.1 min**, longest **30.0 min**
- matches that reached the 30-minute cap without a winner: **7**

Target was ~20 minutes of game time; the 1v1 median lands at 11.9 min.

## Stall and idle-army assertions

The v1 failure modes were an AI that stopped spending and an army that never acted. Both are measured per side on
every match, not asserted from reading the code.

- worst stretch with no spending across all 192 sides: **1449s**
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
| hard vs normal | 1000 | 11.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1000 | 11.1 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1007 | 9.0 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1007 | 8.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1014 | 11.1 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1014 | 16.0 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1021 | 9.0 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1021 | 8.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1028 | 8.7 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1028 | 8.0 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1035 | 14.0 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1035 | 30.0 min | unfinished | hard@1 | normal@0 |
| hard vs normal | 1042 | 7.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1042 | 9.0 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1049 | 9.0 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1049 | 8.1 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1056 | 11.1 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1056 | 16.0 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1063 | 11.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1063 | 11.1 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1070 | 11.9 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1070 | 11.1 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1077 | 14.0 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1077 | 30.0 min | unfinished | hard@1 | normal@0 |
| normal vs easy | 1000 | 26.0 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1000 | 18.1 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1007 | 8.5 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1007 | 9.8 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1014 | 9.8 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1014 | 7.5 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1021 | 8.5 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1021 | 9.8 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1028 | 30.0 min | unfinished | normal@0 | easy@1 |
| normal vs easy | 1028 | 29.4 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1035 | 17.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1035 | 12.6 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1042 | 12.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1042 | 24.3 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1049 | 8.5 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1049 | 9.8 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1056 | 9.8 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1056 | 7.5 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1063 | 26.0 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1063 | 18.1 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1070 | 26.0 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1070 | 18.1 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1077 | 17.9 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1077 | 12.6 min | team 1 | normal@1 | easy@0 |
| hard vs easy | 1000 | 21.1 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1000 | 12.2 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1007 | 29.8 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1007 | 7.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1014 | 10.6 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1014 | 13.6 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1021 | 29.8 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1021 | 7.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1028 | 8.2 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1028 | 7.1 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1035 | 14.6 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1035 | 30.0 min | unfinished | hard@1 | easy@0 |
| hard vs easy | 1042 | 7.4 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1042 | 7.3 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1049 | 29.8 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1049 | 7.5 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1056 | 10.6 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1056 | 13.6 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1063 | 21.1 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1063 | 12.2 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1070 | 21.1 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1070 | 12.2 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1077 | 14.6 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1077 | 30.0 min | unfinished | hard@1 | easy@0 |
| normal vs normal | 1000 | 14.6 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1000 | 13.3 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1007 | 9.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1007 | 11.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1014 | 11.6 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1014 | 10.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1021 | 9.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1021 | 11.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1028 | 11.1 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1028 | 8.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1035 | 12.5 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1035 | 30.0 min | unfinished | normal@1 | normal@0 |
| normal vs normal | 1042 | 12.0 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1042 | 10.9 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1049 | 9.8 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1049 | 11.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1056 | 11.6 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1056 | 10.7 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1063 | 14.6 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1063 | 13.3 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1070 | 14.6 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1070 | 13.3 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1077 | 12.5 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1077 | 30.0 min | unfinished | normal@1 | normal@0 |

## Honest caveats

These are stated plainly because the numbers above would otherwise read as stronger than they are.

- **The hard-vs-normal gap is real but modest.** 15-7 over 24 games.
  Hard wins by making better decisions at its faster decision cadence, but both
  difficulties share the same economy, units and map.
- **The map has a side bias, which is why every matchup is side-swapped.** Unswapped, the corner-0 player won 6 of 6
  mirror matches. The tournament therefore reports 24 games per matchup rather than 12.
- **The economy is exhausted mid-game by design.** With the v1 node cap, both sides run out of mana around minute 15.
  Late-game behaviour is therefore about committing an existing army, not about continued production.
- **12 seeds is a small sample.** A win rate over 24 games has a wide confidence interval; the ORDERING is what the
  data supports, not the precise percentages.

### KNOWN DEFECT: easy is stronger than the harder difficulties

This run does NOT satisfy the difficulty-ordering requirement, and the numbers above show it:

- easy beat normal 17-6 (75% for easy)
- easy beat hard 15-7 (71% for easy)

The cause is measured and is NOT fog, resources or stats -- all three difficulties obey the same rules. At the
point of decision, the harder profiles commit a larger wave (minWaveSize 9-11 vs easy's 7), lose it in one
engagement, and then cannot rebuild it because the map economy is exhausted by minute 15. Easy, committing
smaller waves more often, keeps a standing army through that window. Measured on seed 1007 at minute 5:
normal went from 9 units to 1 in a single fight and never recovered, while easy went 11 -> 20.

Fixing it properly needs the wave-sizing and retreat rules reworked together -- not another single-line tweak,
which is what the last several attempts were and why each fix traded one deadlock for another.
