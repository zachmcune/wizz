# Phase 5 — AI proof pack

Evidence for the Phase 5 "AI opponents" requirements. Every number here was produced by a command in this repository and
can be reproduced with it; nothing is estimated or remembered from a previous run.

| File | What it proves |
|---|---|
| `report.md` | Generated summary: win rates, match lengths, stall measurements |
| `tournament.json` | The raw committed tournament output the report is derived from |
| `match-phone.png` | In-match at phone size (844×390, touch) |
| `match-chromebook.png` | In-match at Chromebook size (1366×768) |
| `full-ai-vs-ai-match.webm` | Recording of a complete AI-vs-AI match |

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

### Difficulty does not measurably separate

The measured win rates cluster between 38% and 50%, and the **mirror matchup** — same difficulty on both sides, a true 50%
by construction — measured 42%. That 42% is the noise floor of a 24-game sample, and every difficulty matchup sits inside
it. So the honest conclusion is that at the current lever strengths the profiles are not distinguishable from noise.

The mechanism is understood. Fixing it is what surfaced the real bugs: the planner failed in ways that made *stronger*
profiles lose (harass consuming the main army, scouting drafting soldiers, retreat marching hurt units home, the all-in
demanding an army size it existed to stop waiting for). Correcting those removed the inversions but also removed most of
what separated the profiles, because the differences that remained are small next to the shared mechanics.

Making difficulty separate again needs the levers re-tuned with this corrected baseline, which is a balance exercise rather
than a correctness one — and balance numbers must come from measurement, not from a plausible-looking table.

### The map economy is exhausted by design, which compresses the late game

`duel_glade` authors 127,000 mana, but `manaNodeCapacity` clamps every node to 12,000 — a **v1 parity constant** asserted by
`tests/data/parity.test.ts`. The whole match economy is therefore 75,000 mana and is mined dry around minute 15. Both sides
then fight with the army they have. Late-game behaviour is about committing an existing force, not about continued
production, and this is why `longestNoSpendSeconds` reaches several hundred seconds on long seeds: a side with no nodes and a
bank below the cheapest unit cost genuinely cannot spend. The idle-army metric, which measures a passive AI rather than an
empty wallet, is **0 seconds on every side of every match**.
