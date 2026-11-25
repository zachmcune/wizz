# Balance proposals — Phase 6

**Rule:** HANDOFF §2 lists the only gameplay values allowed to differ from v1 (`sanctum.hp` 4000,
`balance.manaNodeCapacity` 25000, `balance.sanctumTricklePerSecond` 2), all approved by Zachary on 2026-11-21.
Phase 6 changed **no balance value**. Everything below is a PROPOSAL with its sweep evidence, not a change made
silently. The one difficulty-profile value that did change (`hard.targetBases`) is an AI behaviour setting, not a
gameplay rule, and it is recorded in §3 for completeness.

---

## Proposal 1 — an economy comeback mechanic, to restore a 15–25 min median

**Status: PROPOSED, not implemented.** This one needs a rule decision and I did not make one.

### Problem

Median 1v1 is **~12.7 min** against a 15–25 min target (`docs/proof/phase-5/ai/phase6-fairness.md` §2). It is not
the HQ: `sanctum.hp` 4000 → 12.7 min, 6000 → 13.3, 8000 → 13.6, so **tripling HQ HP buys 0.9 minutes.** It is also
not production capacity: `targetProduction` 2/3/4 → 12.7 / 13.2 / 12.6.

### Evidence for the actual cause

`audit/match-timeline.ts`, seed 1000, Normal mirror:

```
  min |   mana p1/p2 | workers |  army |
    8.0 |    60/235    | 10/10 | 16/13 |
    9.0 |   240/225    | 10/4  | 20/12 |
   10.0 |   120/280    |  7/4  | 22/9  |
   10.5 |   188/198    |  6/0  | 22/0  |   -> team 0 wins
```

The match is decided when **the worker line dies** (10 → 4 at minute 9). From then one side has income and the other
does not, the army gap compounds, and the HQ follows ~1.5 min later. The AI does have a self-healing rebuild
(`economy.ts`, with a mana reserve and an emergency-sell path), and it does re-train — but four workers cannot be
rebuilt fast enough against 20 army units already inside the base.

### Why lengthening it needs a rule change

Every surviving lever is one of:

1. **A comeback mechanic** — something that lets a side with no army and a broken worker line contest the map
   again. v1 has none, and adding one is exactly the kind of rule change §2 exists to gate.
2. **A better defensive AI** — a real AI project (scouting the incoming wave, pre-positioning, retreating workers
   before the raid lands, not after). Plausible, but it is not a value change and cannot be validated in this phase.
3. **Combat/stat changes** — cheaper workers, tougher buildings, slower raids. All rule changes.

### Concrete options, with the value each would need

| Option | Values | Rule change? | Expected effect | Risk |
|---|---|---|---|---|
| A. Cheaper worker | `wisp` cost 200 → 150 | **yes** (a v1 stat) | faster recovery after a raid | also speeds the opening; may shorten matches instead |
| B. Worker build time | `wisp` buildTime ↓ | **yes** | same, less economy distortion | same |
| C. Sanctum trains a free worker when none exist | — | **yes**, new mechanic | directly removes the cliff | feels arbitrary; could be exploited by sacrificing workers |
| D. Defence AI: retreat workers pre-emptively | — | **no** (AI only) | the losing side keeps its income, so the game continues | could stall matches; needs measurement |
| E. Reduce raid lethality vs workers | e.g. a damage multiplier | **yes** | softer cliff | changes every early engagement |

**Recommendation: D first.** It is the only option that is not a rule change, it targets the measured cause
directly, and if it works the median moves without touching a single v1 number. Options A/B/C/E should only be
considered if D measures insufficient.

**What I did NOT do:** tune `sanctum.hp` upward until a sample landed in band. That would have "met" the metric
while the cause stayed in place, and the sweep above shows it cannot work anyway.

---

## Proposal 2 — accept Hard at ~60%, or redefine what Hard is for

**Status: PROPOSED.** The brief asks for ≥70%; measured is 60.0%.

### Problem

| Matchup | Result (20 games) | Target |
|---|---|---|
| Hard > Normal | **60.0%** (12-8), 0 unfinished | ≥70% |
| Normal > Easy | **90.0%** | ≥70% |

Normal over Easy is comfortably met. Hard over Normal is not.

### What was swept to get there

Hard was **33.3%** as shipped in Phase 5, and the cause was a specific AI bug rather than a missing lever:

| Variant (20 games each) | Record | Rate |
|---|---|---|
| Hard as shipped (`targetBases: 3`) | 4-8 | 33.3% |
| `targetBases: 2` | 8-4 | 66.7% |
| `expandAfterSeconds: 180` | 7-5 | 58.3% |
| `defendExpansions: 2` | 4-8 | 33.3% |
| `reactionDelay: 24` | 4-8 | 33.3% |

A third base splits the army — a wall chain, a refinery and four parked units, all out of the income that funds the
push — so Hard arrived with a smaller army than Normal and lost. Shipping `targetBases: 2` (done) moved it to 60%.

The remaining lever swept was the wave size:

| `minWaveSize` | Rate vs Normal |
|---|---|
| 4 | 60.0% |
| 5 (shipped) | 60.0% |
| 6 | 50.0% |
| 7 (Normal's value) | 45.0% |

5 is not the problem and 4 does not help, so the gap is not in the profile table's remaining numbers.

### The options

| Option | What it means | Rule change? |
|---|---|---|
| A. Accept 60% and say so | Hard is measurably better than Normal but not by 70/30 | no |
| B. Give Hard a structural advantage that is not a handicap — e.g. a dedicated defence AI that frees army for offence | real AI work, measurable | no |
| C. Give Hard a small economic edge (cheaper units, faster production) | **yes** — a v1 stat, and it is a handicap rather than skill | yes |
| D. Redefine the gate as "Hard > Normal with a CI lower bound above 50%" | weaker claim, honest about what 20 games can resolve | no |

**Recommendation: A, with B as the next piece of AI work.** 60% over 20 games has a 95% Wilson interval of roughly
36–81%, so the sample cannot even distinguish "Hard is better" from "Hard is the same" with confidence. Adding a
handicap to close a gap the sample cannot resolve risks over-fitting to noise — which is exactly the mistake Phase 5
made with `targetBases: 3`.

---

## Proposal 3 — 4-player free-for-all needs a termination guarantee

**Status: PROPOSED, with a warning that the current gate is knife-edge.**

`tests/phase5-teams.test.ts` asserts that FFA seed 9092 resolves inside 32 minutes, and it does — **but only on an
exact AI decision cadence.** Measured while investigating Phase 6:

| Configuration | FFA seed 9092 |
|---|---|
| Exact cadence | resolves, 27.1 min |
| Per-pass cooldown jitter | past the 32-min cap |
| Jitter on 1 pass in 16 | past the cap |
| Constant per-match offset | past the cap |

And across seeds on the committed build: **3 of 7** FFA seeds resolved inside 32 minutes on one sample, 6 of 7 on
another config. A four-way attrition war is genuinely knife-edge.

That is not a networking problem (peers stay perfectly in sync on the stalled seeds) and it is not a Phase 6
regression — the committed config resolves. But **the gate is asserting one seed of a fragile outcome.** Options:

| Option | What it means | Rule change? |
|---|---|---|
| A. Leave it; the committed seed passes | honest but brittle — a future AI change flips it | no |
| B. Add a stalemate breaker specific to 3+ teams (e.g. after N minutes with no structure damaged, every AI commits everything) | the "all-in" path exists and `passesWithoutProgress` already feeds it; it needs to be more aggressive in FFA | AI only |
| C. A sudden-death rule (all HQs take escalating damage after M minutes) | **yes**, a new rule | yes |

**Recommendation: B.** The mechanism already exists (`STALEMATE_PASSES`, `DESPERATION_SECONDS`, `allIn`); it needs
to fire sooner when more than two teams are alive. That is an AI change, measurable, and it makes the FFA gate
meaningful instead of seed-lucky.

---

## What was NOT changed

For the avoidance of doubt, Phase 6 changed **zero** entries in:

- `v2/data/units/*.json`, `buildings/*.json`, `spells/*.json`, `projectiles/*.json`
- `v2/data/balance.json`
- `v2/data/maps/duel_glade.json` — **except** 20 tiles and 16 heights, which were already asymmetric and were
  reflected from the top-left quadrant to make the map symmetric on both axes. Mana node positions and amounts are
  byte-identical to v1 and `tests/data/parity.test.ts` asserts it.
- `v2/tests/data/parity.test.ts`'s `APPROVED_VALUE_EXCEPTIONS` — still exactly three entries.

The one non-rule value changed is `hard.targetBases` 3 → 2 (§Proposal 2), which is an AI behaviour setting in
`src/ai/difficulty.ts`, not a gameplay value the parity test covers.
