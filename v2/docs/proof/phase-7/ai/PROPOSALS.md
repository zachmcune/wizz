# Proposals — what was measured and deliberately NOT changed

Written 2026-11-24 on `cursor/rebuild-v2-5642`. Everything here is a **proposal**: none of it is implemented, because
each item is either a rule value (which needs Zachary's approval) or an AI project larger than a threshold change.

---

## Proposal 1 — the corner split decides Hard-vs-Normal, not difficulty

**Status: measured, blocking, not fixed. This is the single most important finding of the pass.**

`audit/ladder-par.ts`, identical seed block (5000–5133), 20 seeds × 2 corner assignments per cell:

```
hard>normal: 20/40 = 50.0%  95% CI 35.2-64.8%  unfinished 0/40  median 12.1m
             [corner0 0 / corner1 20]
normal>easy: 33/40 = 82.5%  95% CI 68.0-91.3%  unfinished 0/40  median 8.7m
             [corner0 20 / corner1 13]
```

`corner0 0 / corner1 20` means: **in all twenty games where Hard took the top-left corner it lost, and in all twenty
where it took the top-right corner it won.** The game is decided by the starting corner, and the effect is larger than
the entire Hard-vs-Normal skill gap — which is why that cell measures 50.0% and why the same cell measured 62.5%,
66.7% and 85.0% in earlier passes on different seed blocks. The number is a corner lottery, not a difficulty
measurement.

**It is pre-existing, and that was verified rather than assumed.** `git stash` the whole `src/ai/economy.ts` change and
re-run the identical command: **byte-identical output**, including `corner0 0 / corner1 20`. `audit/corner-pairs.ts`
independently reports every corner winning 100% of its decided games on both builds.

It is also **not a terrain asymmetry**: `tests/data/parity.test.ts` still asserts the map symmetric on both axes, and
`audit/neighbor-symmetry.ts` measured 41,516 of 41,516 tiles steering identically to their own reflection. So this is an
ordering effect in the AI or the sim, not in the map.

**What it would take.** `audit/corner-pairs.ts` is the instrument: it plays every ordered corner pairing and reports the
reciprocal win rates. The signature to look for is a pairing where `p1@c0 vs p2@c1` and `p1@c1 vs p2@c0` are NOT
mirror images of each other, which isolates the asymmetry to the FIRST decision any side makes (the starting refinery
offset, the first worker task, the first wave's route). Phase 4's `e5ad71f` fixed exactly this class of defect for
building offsets, so the mechanism is known to exist; what is not known is which of the remaining order-dependent
decisions still breaks the mirror.

**Why it was not attempted here.** It is a fairness project in its own right — the last time this class of bug was
chased (`25ff6c5`, `a14d090`) it took three commits and a dedicated harness, and a half-diagnosis would leave the ladder
numbers looking meaningful when they are not. Reporting the cell as unmeasurable is more honest than reporting a number
a corner decided.

**Consequence for the brief's target.** "Hard > Normal ≥ 70%" cannot be evaluated on this build at any sample size,
because the measurement is confounded by a 100-point corner effect. The ladder cell will keep moving between 50% and
85% depending on which seed block and which corner each side draws. Do not tune `targetBases`, `minWaveSize` or
`reactionDelay` against it until Proposal 1 is fixed — every such tune so far has been fitting noise, which is exactly
what HANDOFF §7.0 records happening between the Phase 5 and Phase 6 samples.

---

## Proposal 2 — a forward base cannot be held, so expansion is temporary by construction

**Status: measured, and stated as a limitation rather than papered over.**

The forward refinery now goes up at 6.7 minutes on every traced seed, and is destroyed roughly 90–170 seconds later by
two to eight enemy swarmlings. Three things were measured:

| Attempt | Result |
|---|---|
| Refinery alone, then save for a turret | Destroyed before the turret was affordable. Treasury fell 715 → 175 on placement; the turret never appeared. |
| **+400 mana at the moment of placement** (diagnostic only, via `audit/expand-outcomes.ts`) | **Still destroyed.** The defect is timing, not budget. |
| Refinery + turret committed as a pair, turret first | Survives longer, and the *surviving* side holds 3 refineries and 3 route walls outside its cluster — but a lone site is still lost when the enemy commits. |
| Rebuilding the base after it falls | Saved the base and **stalled matches**: `tests/sim/seed-variety.test.ts` measured 2 of 10 mirrors hitting the 34-minute cap. Reverted. |

**What this means.** The expansion produces income and shapes the game while it stands; it is not a permanent second
base. That is a real property of a 4000-HP HQ with no equivalent structure forward, not a bug in the placement code.

**What would fix it** — one of these, in increasing cost:

1. **Garrison before construction** (AI only, no rule change). `planMilitary` has `assessBaseThreat(per, registry,
   homeX, homeY)` which only ever looks at home. A second call pointed at the expansion site, with a small standing
   detachment committed *before* the refinery is placed, would give the site a real chance. This is the recommended
   next step: it is pure AI behaviour, needs no approval, and `audit/expand-outcomes.ts` is already the instrument.
2. **Expansion closer to home** (AI only). The nearest unserved node is 14.1 tiles; a site at 14 tiles is inside the
   AI's own scouting ring and much cheaper to reinforce than one at 30. Already partly done — the served-radius change
   now prefers that node.
3. **A stronger forward structure** (RULE CHANGE — needs approval). Refineries are 900 HP and turrets 600. Nothing in
   the content set is a credible forward anchor. This is the honest structural reason and it is a data change, so it is
   a proposal, not an action.

---

## Proposal 3 — median 1v1 length is below the 15–25 band, and the mirror is the only cell in it

**Status: measured, not tuned. Do not re-sweep HQ HP.**

| Cell | N | Median | Unfinished |
|---|---|---|---|
| Mirror (normal vs normal) | 100 | **11.9 min** | 0 |
| Hard > Normal | 40 | 12.1 min | 0 |
| Normal > Easy | 40 | 8.7 min | 0 |

Target: 15–25 min, ~20. **Missed in every cell.**

The levers were swept in Phase 6 and confirmed dead:

| Lever | Values | Median |
|---|---|---|
| `sanctum.hp` | 4000 / 6000 / 8000 | 12.7 / 13.3 / 13.6 min — 0.9 min for tripling it |
| `targetProduction` | 2 / 3 / 4 | 12.7 / 13.2 / 12.6 min |

So lengthening the game needs a **comeback mechanic** or a **defensive AI**, not a bigger number. Both are real work;
neither is a threshold. This is the same conclusion Phase 6 reached and recorded as its Proposal 1.

**One thing that would NOT help and was measured anyway**, because it looks like the obvious answer: raising the
build-order reserve to let the AI reach expensive buildings collapsed seed variety from 6 distinct match lengths to 2
and failed `tests/sim/seed-variety.test.ts`. A richer AI is a more deterministic AI here.
