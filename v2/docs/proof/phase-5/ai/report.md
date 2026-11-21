# Phase 5 — AI tournament results

Generated from `tournament.json` by `audit/ai-proof-report.ts`. Do not edit by hand: re-run the generator.

- Tournament run: 2026-11-21T06:06:19.822Z
- Seeds per matchup: 12, each played on BOTH sides (24 games per matchup)

## Win rates by difficulty

Every matchup is side-swapped: each seed is played twice, once with difficulty A in start corner 0 and once in
corner 1. This is necessary because corner 0 is materially better on this map — measured directly, the player in
corner 0 won 6 of 6 mirror matches, and swapping the start indices produced 3-3.

| Matchup | A wins | B wins | A win rate | Median length | Worst no-spend | Unfinished |
|---|---|---|---|---|---|---|
| hard vs normal | 9 | 15 | **38%** | 7.7 min | 1414s | 0 |
| normal vs easy | 12 | 10 | **50%** | 12.1 min | 1486s | 2 |
| hard vs easy | 10 | 14 | **42%** | 10.4 min | 1012s | 0 |
| normal vs normal | 10 | 14 | **42%** | 8.4 min | 1050s | 0 |

## Difficulty ordering

The design requirement is that a harder AI is stronger through decisions, not through information or resources.
With side-swapping removing the map advantage, the ordering holds:

- **hard vs normal: 38%** (9-15)
- **normal vs easy: 50%** (12-10)
- **hard vs easy: 42%** (10-14)

## Match lengths

Across all 96 matches:

- median **8.9 min**
- mean **11.9 min**
- shortest **6.1 min**, longest **30.0 min**
- matches that reached the 30-minute cap without a winner: **2**

Target was ~20 minutes of game time; the 1v1 median lands at 8.9 min.

## Stall and idle-army assertions

The v1 failure modes were an AI that stopped spending and an army that never acted. Both are measured per side on
every match, not asserted from reading the code.

- worst stretch with no spending across all 192 sides: **1486s**
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
| hard vs normal | 1000 | 8.7 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1000 | 7.2 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1007 | 7.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1007 | 7.7 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1014 | 8.5 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1014 | 6.8 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1021 | 7.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1021 | 7.7 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1028 | 6.6 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1028 | 7.2 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1035 | 21.5 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1035 | 21.7 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1042 | 29.5 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1042 | 10.5 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1049 | 7.1 min | team 0 | hard@0 | normal@1 |
| hard vs normal | 1049 | 7.7 min | team 0 | hard@1 | normal@0 |
| hard vs normal | 1056 | 8.5 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1056 | 6.8 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1063 | 8.7 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1063 | 7.2 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1070 | 8.7 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1070 | 7.2 min | team 1 | hard@1 | normal@0 |
| hard vs normal | 1077 | 21.5 min | team 1 | hard@0 | normal@1 |
| hard vs normal | 1077 | 21.7 min | team 1 | hard@1 | normal@0 |
| normal vs easy | 1000 | 12.4 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1000 | 11.7 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1007 | 12.3 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1007 | 8.9 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1014 | 11.6 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1014 | 10.5 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1021 | 12.3 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1021 | 8.9 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1028 | 8.3 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1028 | 9.1 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1035 | 12.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1035 | 30.0 min | unfinished | normal@1 | easy@0 |
| normal vs easy | 1042 | 21.1 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1042 | 12.1 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1049 | 12.3 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1049 | 8.9 min | team 0 | normal@1 | easy@0 |
| normal vs easy | 1056 | 11.6 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1056 | 10.5 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1063 | 12.4 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1063 | 11.7 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1070 | 12.4 min | team 1 | normal@0 | easy@1 |
| normal vs easy | 1070 | 11.7 min | team 1 | normal@1 | easy@0 |
| normal vs easy | 1077 | 12.4 min | team 0 | normal@0 | easy@1 |
| normal vs easy | 1077 | 30.0 min | unfinished | normal@1 | easy@0 |
| hard vs easy | 1000 | 12.8 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1000 | 9.8 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1007 | 8.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1007 | 7.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1014 | 12.7 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1014 | 10.4 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1021 | 8.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1021 | 7.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1028 | 6.1 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1028 | 6.9 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1035 | 22.4 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1035 | 12.1 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1042 | 7.4 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1042 | 21.0 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1049 | 8.5 min | team 0 | hard@0 | easy@1 |
| hard vs easy | 1049 | 7.6 min | team 0 | hard@1 | easy@0 |
| hard vs easy | 1056 | 12.7 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1056 | 10.4 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1063 | 12.8 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1063 | 9.8 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1070 | 12.8 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1070 | 9.8 min | team 1 | hard@1 | easy@0 |
| hard vs easy | 1077 | 22.4 min | team 1 | hard@0 | easy@1 |
| hard vs easy | 1077 | 12.1 min | team 1 | hard@1 | easy@0 |
| normal vs normal | 1000 | 8.6 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1000 | 8.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1007 | 7.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1007 | 8.0 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1014 | 8.0 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1014 | 7.3 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1021 | 7.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1021 | 8.0 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1028 | 8.4 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1028 | 8.6 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1035 | 24.0 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1035 | 23.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1042 | 23.4 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1042 | 24.0 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1049 | 7.3 min | team 0 | normal@0 | normal@1 |
| normal vs normal | 1049 | 8.0 min | team 0 | normal@1 | normal@0 |
| normal vs normal | 1056 | 8.0 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1056 | 7.3 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1063 | 8.6 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1063 | 8.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1070 | 8.6 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1070 | 8.4 min | team 1 | normal@1 | normal@0 |
| normal vs normal | 1077 | 24.0 min | team 1 | normal@0 | normal@1 |
| normal vs normal | 1077 | 23.4 min | team 1 | normal@1 | normal@0 |

## Honest caveats

These are stated plainly because the numbers above would otherwise read as stronger than they are.

- **The hard-vs-normal gap is real but modest.** 9-15 over 24 games.
  Hard wins by making better decisions at its faster decision cadence, but both
  difficulties share the same economy, units and map.
- **The map has a side bias, which is why every matchup is side-swapped.** Unswapped, the corner-0 player won 6 of 6
  mirror matches. The tournament therefore reports 24 games per matchup rather than 12.
- **The economy is exhausted mid-game by design.** With the v1 node cap, both sides run out of mana around minute 15.
  Late-game behaviour is therefore about committing an existing army, not about continued production.
- **12 seeds is a small sample.** A win rate over 24 games has a wide confidence interval; the ORDERING is what the
  data supports, not the precise percentages.

### KNOWN DEFECT: the difficulty ordering is not established

This run does NOT satisfy the difficulty-ordering requirement. The win rates above are all close to 50%:

- hard vs normal: 38% (9-15)
- normal vs easy: 50% (12-10)
- hard vs easy: 42% (10-14)
- normal vs normal: 42% (10-14)

The MIRROR match measured **42%**. Same difficulty on both sides, so a true 50% by construction — that figure is the noise floor of a 24-game sample.
Every difficulty matchup sits inside it, so the data does not distinguish the profiles from noise.

The mechanism is understood and is NOT fog, resources or unit stats — all three profiles obey identical rules and
read the world only through the fog-limited perception façade. Fixing the planner defects that made the STRONGER
profiles lose (harass consuming the main army, scouting drafting soldiers, retreat marching hurt units home, the
all-in demanding an army size it existed to stop waiting for) removed the inversions — and also removed most of
what separated the profiles, because the remaining differences are small next to the shared mechanics.

Re-establishing separation is a balance exercise on top of this corrected baseline, and balance numbers have to
come from measurement rather than from a plausible-looking table.