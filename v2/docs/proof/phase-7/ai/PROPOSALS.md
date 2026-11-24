# Proposals — what was measured and deliberately NOT changed

Written 2026-11-24 on `cursor/rebuild-v2-5642`. Everything here is a **proposal**: none of it is implemented, because
each item is either a rule value (which needs Zachary's approval) or an AI project larger than a threshold change.

---

## Proposal 1 — RETRACTED: there is no corner defect, and the ladder meets its target

**Status: retracted by a larger sample. Kept in the file because the reasoning error is instructive.**

An intermediate build (the expansion fix, since reverted) measured this in `audit/ladder-par.ts`:

```
hard>normal: 20/40 = 50.0%  95% CI 35.2-64.8%   [corner0 0 / corner1 20]
```

Hard lost all twenty games from one corner and won all twenty from the other, on two independent seed blocks. That looked
like a deterministic engine defect and was written up as blocking.

**It was a property of the reverted change, not of the engine.** On the shipped build every block is balanced:
corner0 29/50 vs corner1 31/50 (mirror, N=100), 18/30 vs 19/30 (mirror, N=60), 20 vs 16 (ladder, N=40). And the ladder
cell that was "unmeasurable" measures **90.0% (CI 77.0–96.0%)** — clearing the 70% target comfortably.

**The lesson worth keeping:** a 20-0 sweep on 40 games is a striking pattern and it survived one replication, and it was
still an artifact of the build rather than of the game. It was caught only because the underlying change was reverted for
an unrelated reason (`README.md` §3) and the measurement was repeated. Re-measure on the build you are shipping, not on
the build you were experimenting with.

## Proposal 2 — how to make the expansion fix shippable (it was reverted)

**Status: the eight-cause fix was written, measured, and REVERTED because it fails a committed CI gate. See
`README.md` §3.** All eight causes in `README.md` §1 are real and all eight fixes are needed; what is missing is a way to
pay for the forward base without the army's own mana.

The measured blocker, in one line: `tests/net/latency-jitter.test.ts` requires every peer to issue **more than 100**
commands in a 14-minute 4-peer match. The pre-pass build issues **188/183/432/560**; with the expansion fixes it issues
**95/101/410/113**. All four peers stay perfectly in sync — identical hashes, zero desyncs — so this is an activity floor,
not a sync failure. Changing `countBases` alone accounts for 188 -> 137 of it.

### 2a. The fix that is most likely to work: garrison before construction

`planMilitary`'s `assessBaseThreat(per, registry, homeX, homeY)` only ever looks at home. A second call pointed at the
expansion site, with a small standing detachment committed **before** the refinery is placed, spends army mana *on the
army* while it covers the site instead of reserving it out of the army's budget. That is the only version that does not
compete with production, and it directly addresses why the forward refinery dies anyway:

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

## Proposal 3 — median 1v1 length is below the 15–25 band

**Status: measured on the shipped build, not tuned. Do not re-sweep HQ HP.**

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
