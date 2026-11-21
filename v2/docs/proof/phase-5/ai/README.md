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

### Difficulty separation — achieved, with one caveat stated

| Requirement | Measured | 95% CI | Target | Met |
|---|---|---|---|---|
| Hard over Normal | **67%** (16-8) | 47%–82% | ≥65% | yes |
| Normal over Easy | **79%** (19-5) | 60%–91% | ≥65% | yes |
| Hard over Easy | **79%** (19-5) | 60%–91% | ≥75% | yes |
| Mirror near 50% | 46% (11-13) | 28%–65% | contains 50% | yes |

96 matches, **zero unfinished**, median length **20.3 min** (mean 18.8, range 11.3-24.5, none at the cap).

The caveat: Hard-over-Normal's interval reaches below 65%, so that target is met on the point estimate and corroborated by a
second independent measurement of the same lever (9-3 at 12 games, then 16-8 at 24), not proven at 95% confidence.

### What actually produced the separation

One lever, found by ablation rather than design: **Hard attacks at 5 units instead of 7**. Earlier commitment wins this game,
and it was the only candidate that beat the noise floor. Everything else measured here came back neutral or worse — more workers
(7-5), an extra producer (6-6), kiting (6-6), superweapon (6-6), harass (6-6), and a faster decision cadence (6-6, while
*slower* cadence scored 10-2).

The largest single effect was not a lever at all but Hard's **build order**: with profiles identical, `AGGRESSIVE_OPENING`
measured 20.8% against Easy and `STANDARD_OPENING` 79.2% — a 58-point swing. Every difficulty now uses the standard opening.

`ablation.md` records each of these with its sample size, including the two bugs that made earlier measurements untrustworthy:
a target tie-break that favoured the first-listed player (fixed; the mirror then measured within noise of 50%), and a
difficulty-profile table shared by reference so ablation overrides leaked between matches.

### Match length — achieved by an approved rule change

Median **20.3 min** across the whole bracket, against a ~20 minute target. This required the one approved rule change of Phase 5:

**`sanctum.hp` 2000 -> 4000** (Zachary, 2026-11-21). Measured across 8 seeds x both corners per level: 2000 gave an 11.8 min
median, 3000 gave 12.9, and **4000 gave 19.9** — the smallest value in the 15-25 band, with the difficulty ordering identical to
v1 (75/88/88) and zero unfinished matches.

**Turrets were measured first and deliberately left alone.** Stronger turrets equalise the difficulties and reward turtling,
because defence substitutes for decisions:

| turret damage | hard>normal | normal>easy | unfinished |
|---|---|---|---|
| 3 (v1, shipped) | 75% | 88% | 0 |
| 5 | 50% | 80% | 2 |
| 7 | 63% | **20%** | **12** |

So every turret stat is still exactly v1 (hp 600, damage 3, range 165). `sanctum.hp` is the **only** gameplay value in the
content set that differs from v1, recorded as an explicit exception in `tests/data/parity.test.ts` that names the approved
replacement — an unapproved value still fails the test.

### Economy finding: the map runs dry between minutes 15 and 20

Measured, and **not changed** — economy values stay locked unless separately approved.

`duel_glade` authors 127,000 mana, but `manaNodeCapacity` clamps every node to 12,000 (a v1 parity constant), so the whole match
economy is **75,000 mana**. On the shipped build the nodes were fully mined out around **minute 15**, and the longest
no-spending stretch reached **1019 s** (~17 min) because a side with no nodes and a bank below the cheapest unit cost genuinely
cannot spend.

With HQ 4000 the matches are longer but the no-spend stretches are **shorter**, not longer — measured across three seeds the
worst was **304 s**, and a few thousand mana was still on the map at the 20-minute mark. The longer game spreads the same economy
over more fighting rather than exhausting it sooner. The worst no-spend figure across the full 96-match bracket is **1152 s**,
which occurs on the longest grinds; `worstIdleArmy` is **0 s on every side**, so it is an empty wallet, not a passive AI.

### The AI reads only what it can see

Unchanged and re-verified: `tests/phase5-maphack.test.ts` perturbs every entity a player cannot see — teleports it 3000 units,
zeroes its HP — and requires the brain's commands to be **byte-identical** to its unperturbed commands, across 3 seeds × 3 match
phases. Difficulty is a set of legal behavioural levers; no level reads hidden state, receives extra resources, or has different
unit stats.
