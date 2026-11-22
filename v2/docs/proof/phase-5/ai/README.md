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

### Against the phase targets — what holds and what does not

| Requirement | Measured | 95% CI | Target | Met |
|---|---|---|---|---|
| Hard over Normal | **50%** (12-12) | 31%–69% | ≥65% | **no** |
| Normal over Easy | **100%** (24-0) | 86%–100% | ≥65% | yes |
| Hard over Easy | **100%** (24-0) | 86%–100% | ≥75% | yes |
| Mirror | **50%** (12-12) | 31%–69% | ~50% | yes |
| Median length | **17.5 min** | — | 15–25 | yes |
| Unfinished | **0 of 96** | — | 0 | yes |
| Worst idle army | **0 s** | — | — | yes |

**Hard vs Normal is the one unmet target and it is a regression against the previous build (67% -> 50%).** Diagnosed: Hard's only
advantage over Normal is attacking at 5 units instead of 7, and that timing edge decided matches when economy was scarce. With
25,000-capacity nodes both sides can afford continuous production, so the window it exploited has closed. Five candidate levers
were measured to restore it (wave 4, faster wave growth, more workers, a third producer) and every one came back 6-6 or worse —
none of the existing levers separates the two profiles any more. Giving Hard a real edge again needs a new kind of decision
lever, not a retune of the old ones.

### Economy — fixed, by measurement

| Value | Before | After | Why |
|---|---|---|---|
| `manaNodeCapacity` | 12000 | **25000** | the largest amount the map AUTHORS; 40000 measured identical |
| `sanctumTricklePerSecond` | — | **2/s** | dead-economy floor; at 0 a match went unfinished with a 1243 s no-spend |

The map authors 127,000 mana but the clamp allowed only 75,000 — about 6.5 minutes of continuous mining. Income was measured at
~890 mana/min/side with spending EXCEEDING earnings, so both sides ran at zero margin and any raid that killed the worker line was
unrecoverable. Worst no-spend across the bracket fell from **1073 s to 293 s**, and the map is never mined dry inside a match.

**The zero-worker deadlock is fixed and tested.** A side with no harvesters has no income, so it can never afford the worker that
would restore its income; p2 was measured holding 155 mana against a 200-cost worker with nothing sellable. Two fixes: a worker
reserve (never spend below one worker while short) and the sanctum trickle. `tests/phase5-dead-economy.test.ts` reproduces the
dead state and asserts both, plus end-to-end that a side in it always escapes — at 1.0/s it did not (a 115 s unresolved deadlock
remained), which is why the value is 2.

### Base growth — improved, expansions not done

At 18 minutes the surviving side now holds **11 buildings, 6 production buildings, 2 defences, 10 workers and 22 army**, against
5 buildings and 15 units before. It remains **one base**: taking additional nodes and expanding to them was not implemented, so
the "2 or more bases" target is unmet.

### Two sim bugs found and fixed on the way

- **Frozen attackers.** `movementSystem` skips a unit in `STATE_ATTACKING` because `combat` moves it at its target — but `chase`
  only runs with a target in reach, so a unit left in that state with NO target was moved by neither system. Measured: a unit sat
  at (506,604) for **200 consecutive ticks** with a valid `attackMove` to a base 3000 units away. That is why a 17-unit army could
  not destroy a 7-building base and matches ran past 45 minutes. Fixed by only skipping a unit that genuinely holds an attack
  target; unfinished matches fell from 5 to 0.
- **Turrets were rejected again, twice.** Turfing up turrets to lengthen matches broke the ordering at damage 4, 6 and 10 — every
  time to 50%. Stronger turrets substitute for decisions, so a weak AI behind towers survives like a strong one. Every turret stat
  is therefore **exactly v1**, and their parity exceptions were removed rather than left permitting a change nobody made.

### Match length — in band

Median **17.5 min** (mirror), whole bracket 14.6–18.8, zero at the cap. Reached by **HQ 8000** (from 4000), which is length-only:
it was verified not to affect the difficulty ordering at any value tested.
