# Phase 5 — AI proof pack

Evidence for the Phase 5 "AI opponents" requirements. Every number here was produced by a command in this repository and
can be reproduced with it; nothing is estimated or remembered from a previous run.

| File | What it proves |
|---|---|
| `report.md` | Generated summary: win rates, match lengths, stall measurements |
| `tournament.json` | The raw committed tournament output the report is derived from |
| `match-phone-10min.png`, `match-phone-18min.png` | In-match at phone size (844×390, touch) |
| `match-chromebook-10min.png`, `match-chromebook-18min.png` | In-match at Chromebook size (1366×768) |
| `full-match-20min-hq4000.webm` | Recording of a complete match with the approved HQ change |
| `ablation.md` | Every difficulty lever with its measured effect |

## Reproducing

```bash
cd v2

npm run test:ai        # 4-match smoke tournament: termination, stalls, determinism (also runs in CI)
npm run tournament:ai  # the full bracket: 12 seeds x 2 sides x 4 matchups = 96 matches
npm run proof:ai       # regenerate report.md from the tournament JSON
```

`npm run tournament:ai` takes roughly 12 minutes on 4 cores. The committed `tournament.json` is the result of exactly that
command, and `tests/phase5-tournament.test.ts` fails if the committed file stops describing a healthy tournament.

## How the tournament is run, and why

**Side-swapped.** Each seed is played twice, once with difficulty A in start corner 0 and once in corner 1. This is
necessary rather than pedantic: measured on this map, the player in corner 0 won **6 of 6** unswapped mirror matches, and
swapping the start indices produced 3-3. Without side-swapping the win-rate table would be measuring the map, not the AI.

**Parallel, with determinism proven.** Matches run across four worker processes. That is only legitimate if scheduling
cannot affect a result, so `tests/ai-parallel.test.ts` runs the same job serially in-process and again through the pool and
requires byte-identical outcome fingerprints, and the smoke tournament re-runs a seed and compares state hashes.

**Measured, not asserted.** Every claim about stalling comes from instrumentation inside the match loop: the longest stretch
with no spending, the longest stretch with combat units holding no orders, and the number of decisions each side made. A
"no stalls" claim with no counter behind it is worth nothing, so the counters are committed alongside the results.

## What the AI does

The AI reads the world only through `PerceivedWorld` (`src/ai/perception.ts`), a fog-limited façade. It is not given
`GameState`. That is enforced rather than intended: `tests/phase5-maphack.test.ts` perturbs every entity a player cannot see
— teleports it 3000 units, zeroes its HP — and requires the brain's commands to be **byte-identical** to its unperturbed
commands, across 3 seeds × 3 match phases. If the AI read any hidden field, changing that field would change its output.

Difficulty is a set of legal behavioural levers (`src/ai/difficulty.ts`): decision cadence, worker targets, wave size and
growth, whether it focus-fires, retreats, kites, scouts, counters, harasses, builds defenses, and uses the superweapon.
No difficulty reads hidden state, receives extra resources, or has different unit stats.

## Known defects, stated plainly

These are real and unfixed. They are listed here rather than buried because a proof pack that only lists successes is
marketing, not evidence.

### Against the phase targets

| Requirement | Measured | 95% CI | Target | Met |
|---|---|---|---|---|
| Hard over Normal | **100%** (24-0) | 86%–100% | ≥65% | **yes** |
| Normal over Easy | **79%** (19-5) | 60%–91% | ≥65% | **yes** |
| Hard over Easy | **79%** (19-5) | 60%–91% | ≥75% | **yes** |
| Mirror near 50% | 71% (17-7) | 51%–85% | ~50% | **no** — see below |
| Median length | **18.1 min** | — | 15–25 | yes |
| Unfinished | **0 of 96** | — | 0 | yes |
| Worst idle army | **0 s** | — | — | yes |

### AI expansion — the lever that produced the separation

Three profile fields drive it: `targetBases` (Easy 1, Normal 2, Hard 3), `expandAfterSeconds` and `defendExpansions`. Measured base
growth:

| Difficulty | 10 min | 18 min |
|---|---|---|
| Easy | **1 base**, 3-6 buildings, 1-2 army | never expands |
| Normal | **2 bases**, 9 buildings, 10 workers, 21-23 army | holds 2 bases |
| Hard | **2 bases**, 9 buildings, 12 workers | 2 bases, 9 buildings, 8-12 workers |

**What an expansion can actually be**, measured from the map rather than assumed: a building must be within 7 tiles of an existing
structure. Every start is 14.1 tiles from its richest node (already served by its own refinery) and 30+ tiles from the next. So the
2000-cost Waystone Wagon, which deploys anywhere, is unusable — both sides sat at 180-399 mana for whole matches — and a remote node
needs a 4-5 building chain. The forward base is a **two-link chain to the next cluster, then a refinery and turret on it**.

**Hard expands at 200 s, not 110 s, and that is a measured choice.** Expanding at 110 s made Hard *weaker*: 6-5 with one unfinished,
because the chain pulled workers off the line before the economy could fund it (Hard ended with **2 workers against Normal's 10**). At
200 s the same profile went **12-0 with zero unfinished**.

### Four sim bugs found and fixed

1. **`findBuildSpot` could not extend a chain.** It scanned rings from the YARD with a 3-ring cap, so the first expansion attempt laid
   **92 stone walls** in a cluster beside the base and never advanced. It now walks the line toward the target and takes the furthest
   legal tile, hard-capped so it cannot pave the map.
2. **Worker flee radius 560 fired on every pass** once armies met, so no worker ever mined and a normal mirror ran 30 minutes. Now 380.
3. **`prepareForOrder` never reset unit state**, so a unit given `move` after `attack` kept `STATE_ATTACKING` and was skipped by
   movement forever.
4. **Combat and movement cancelled each other exactly.** `combat` runs after `movement` and wrote position directly, so chasing an
   out-of-range target undid the move. Measured: a unit advanced 4.40 units in `movementSystem` and was moved 4.40 back by
   `combatSystem`, every tick, for 200 ticks — a perfect deadlock invisible to any state or velocity check because both systems were
   correct in isolation. Combat now only steers units on a *pursuing* order, so exactly one system owns position per tick.

### The one unmet target: the mirror is 71%, not ~50%

Measured by start corner, team 0 won **12 of 12 from corner 0** but only **5 of 12 from corner 1**. The nodes are symmetric, so this is
not map geometry — it is a sim ordering effect (entity creation order) that the expansion and combat changes amplified. The bracket
side-swaps every seed, so matchups still compare fairly — both difficulties occupy corner 0 equally often — but the variance is large
and the mirror sits outside the interval expected of a fair game. It is reported, not smoothed over.

### Economy — approved changes, measured

| Value | Before | After | Why |
|---|---|---|---|
| `manaNodeCapacity` | 12000 | **25000** | the largest amount the map AUTHORS |
| `sanctumTricklePerSecond` | — | **2/s** | dead-economy floor; at 0 a match went unfinished with a 1243 s no-spend |
| `sanctum.hp` | 4000 | **4000** | length only; 3000 gave 13.2 min (below band), 8000 gave 18.5–31.7 |

Worst no-spend fell from **1073 s to 135 s** and the map is never mined dry inside a match. **Turrets remain exactly v1** (600 hp, 3
damage): toughening them was measured at damage 4, 6 and 10 and broke the ordering every time.
