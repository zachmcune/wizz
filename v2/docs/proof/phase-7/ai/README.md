# Phase 7 — AI expansion: the diagnosis is complete, the behaviour was reverted

**Branch:** `cursor/rebuild-v2-5642`
**Status:** the diagnosis and the instrumentation are committed and complete. **`src/ai/` is byte-identical to the
pre-pass baseline**, because every behaviour change that fixed one committed gate broke another. `docs/proof/phase-7/ai/DIAGNOSIS.md`
holds the measurements; this file holds the full record, the trade-off that defeated the pass, and what to do next.

**Two targets MISSED, and stated as missed:** the AI does not expand (0 buildings outside the starting cluster on every
seed), and the median mirror length is 8.1 min against a 15-25 target. **One target MET:** the mirror slot win rate is
50.0% with a CI that contains 50%. **One gate is green that was not:** `tests/net/latency-jitter.test.ts` passes 5/5
unmodified, and this document explains why that is not an achievement.

---

## 1. The finding that matters most: the activity floor was measuring a re-task loop

Committed latency-jitter case — seed 1021, four normal AIs, 14-minute cap — on the **shipped** build:

```
p1: issued=188  by type  attackMove=84 harvest=46 produce=42 build=8 move=8
p2: issued=183  by type  harvest=68 move=63 produce=44 build=8
p3: issued=432  by type  attackMove=318 produce=54 harvest=47 build=11 move=2
p4: issued=560  by type  attackMove=386 harvest=65 move=52 produce=47 build=10
```

`attackMove` is 45% of `p1`'s activity. Attributed by squad size and by the army size at the moment of issue:

```
attackMove commands by squad SIZE (all four peers)
    292  p3 n=1        101  p4 n=1        19  p1 n=1        6  p3 n=3        3  p1 n=2

army count at each attackMove (p1)
     18  army=1 n=1      3  army=2 n=2      1  army=2 n=1
```

**Every `attackMove` in the match is a squad of ONE unit.** `p1` issues 84 of them while owning at most two combat
units. That is `planMilitary`'s stuck/idle re-task loop firing pass after pass, not a match happening.

**This invalidates the previous pass's reading of its own failure.** A build that removes that loop fails the floor
*even if it plays better*, because 84 of the 188 commands were the loop. The previous pass concluded that AI expansion
"competes with army production for the same mana" and recommended garrisoning the site. It was measuring an AI with no
army, where 45% of its activity was one unit being re-ordered.

## 2. Why there is no army: an arithmetic contradiction

`brain.ts` gated army training on

```ts
const aboveReserve = spendable > Math.max(150, target.cost * 2);
```

and `spendable = mana - reservedForBuild`, where the build-order share hard-caps the reserve so that spendable is
**exactly `mana - 260`** for every bank between ~300 and ~750.

Normal's counter picker settles on the **140-cost imp swarmling** from minute 6:30. So the gate demanded
`spendable > 280` against a ceiling of **260**. Measured with `audit/counter-pick-probe.ts`:

```
t=450s mana= 320 spendable= 260 | counter=imp_swarmling@140 threshold=280 open=false
t=750s mana= 570 spendable= 260 | counter=imp_swarmling@140 threshold=280 open=false
```

and with `audit/production-gate.ts`, over 16800 ticks: the gate was **open on 4127 ticks** — every one of them before the
picker settled — and the side fielded **four combat units** in fourteen minutes. `audit/rejection-probe.ts` shows the
other half: **45 of p1's 48 `produce` commands were wisps**, and 3 were soldiers.

## 3. The instrumentation that stays

Six observation hooks on the harness (`src/net/harness.ts`, `src/net/bot-client.ts`): `onPeerCommands`,
`onPeerDecision`, `onPeerStats` and a `PeerStats` type carrying COUNTS only, never state. Observation-only — nothing in
the harness reads them back, so a harness cannot change a result through them. Nine audit scripts consume them, each
printing its own numbers:

| Harness | Answers |
|---|---|
| `audit/jitter-command-tally.ts` | the committed jitter case by command type, minute and squad size, plus every planner note |
| `audit/jitter-diff.ts` | the same in a fixed format, so two builds diff mechanically |
| `audit/attackmove-attribution.ts` | which planner branch emitted each `attackMove` |
| `audit/production-gate.ts` | every tick: was the gate open, and if not which condition shut it |
| `audit/production-probe.ts` | mana, reserve, spendable, threshold and army, sampled |
| `audit/counter-pick-probe.ts` | the unit the counter picker chose, and the threshold that implies |
| `audit/decision-log.ts` | every pass that emitted a combat `produce`, with the bank at that moment |
| `audit/rejection-probe.ts` | every `commandRejected` by reason, plus what actually spawned |
| `audit/symmetry-break.ts` | the first tick a mirror stops being a mirror |
| `audit/duel-shape.ts` | one 1v1 every 30 s: army, workers, buildings, refineries, bank |

`audit/mirror-par.ts` also reports **median** length now, not only the mean — the brief's target names a median, and a mean
is dragged by the matches that run to the cap.

## 4. The trade-off that defeated this pass, measured in full

Every behaviour change below was individually correct, and each was measured. They were reverted together because
`tests/phase5-teams.test.ts` has four committed assertions and the four-player free-for-all is exquisitely sensitive to
one thing: how much the AI throttles production.

Measured on the committed seed 9092, in the order the pass tried them:

| Build | FFA result | Jitter floor (p1) | Verdict |
|---|---|---|---|
| **baseline** | **resolves 27.1 min**, all four field an army | 188 | green |
| production gate `2x` -> `cost+60` | does NOT resolve inside 32 min | 327 | **breaks teams gate** |
| + a 300 spendable ceiling | does NOT resolve inside 32 min | 152/320/525/610 (all pass) | **breaks teams gate** |
| + `cost+140` (== the old 280 threshold) | resolves 26.1 min | **95** | **breaks the jitter floor** |
| + a conditional saving fund | resolves 24.8 min, but **`f1 never fielded an army`** | 518/158/1138/668 (pass) | **breaks teams gate** |
| reserve on the saving path restored | resolves 24.8 min, `f1` starved to 4 buildings | 518 (pass) | **breaks teams gate** |

The mechanism is not a tuning problem. **The throttle that starves the army is the same throttle that makes a stalemate
terminate.** A looser gate lets two survivors in a four-way game rebuild replacements forever; a tighter gate leaves one
corner's economy unable to reach its 550-cost producer at all. Changing one number moves both outcomes, in opposite
directions, and four attempts in a row traded one red gate for another.

**What would actually solve it** is not on the production path. `brain.ts` already has a stalemate breaker
(`passesWithoutProgress >= STALEMATE_PASSES` -> `allIn`, which drops the wave-size gate and commits the army). The
measured stalemates resolve when a surviving side *stops waiting for a wave it cannot afford*, which is the breaker's
job. Making the breaker account for "I cannot afford a replacement" — rather than only "nothing has died recently" —
is the change that would let the production gate loosen without leaving two players rebuilding forever. That is a design
change with its own measurement, not a margin tweak, and it is the recommended next step.

## 5. The corner sweep: found, explained, and left in place

`audit/symmetry-break.ts` reported the first divergence at **t=2s**, before any AI decision, on the starting wisps' harvest
orders. The arithmetic, which is the entire defect:

```
p1 wisps sit on tiles 12 and 16     -> ascending order puts the wisp at x=400 first
p2 wisps sit on tiles 111 and 115   -> ascending order puts the wisp at x=3696 first
```

and the mirror of p1's x=400 wisp **is** p2's x=3696 wisp. Every global ordering hands first claim to the same physical
wisp at one base and the other at its mirror — anti-covariant. `busyNodes` then forces the second wisp onto a different
node, and the two economies diverge from tick 18.

Three orderings were written and measured:

| Ordering | Mirror corner split | FFA gate |
|---|---|---|
| entity-slot (shipped) | **0% / 100%** — deterministic sweep | pass |
| distance to own sanctum, base-side-signed x | **43% / 77%** — sweep broken | **`f1 never fielded an army`** |
| shortest trip to an unclaimed node | 100% / 30% | pass |

The middle one **fixes the fairness defect** and is the right fix, but it starves a crowded game because a fixed key
gives the same workers first claim on the nearest node every pass. The real fix is to make the **claim set** mirror-covariant
— how nodes are claimed, not the order workers are walked — which is a design change with its own measurement. Recorded
here rather than guessed at in the source.

## 6. Fairness and length on the SHIPPED build

All measured on this commit, `audit/mirror-par.ts`, both corner assignments per seed, 34-minute cap:

| Measure | N | Result | Target | Met |
|---|---|---|---|---|
| Mirror slot win rate | 110 | **50.0%**, 95% CI 40.8-59.2% | CI contains 50% | **yes** |
| Mirror slot win rate | 60 | 60.0%, 95% CI 47.4-71.4% | CI contains 50% | yes |
| Corner split | 110 | corner0 **0%**, corner1 **100%** | balanced | **no — deterministic** |
| Mirror median length | 110 | **8.1 min** | 15-25, ~20 | **no** |
| Unfinished | 110 | 0 | 0 | yes |

The slot figure is exactly 50.0% at N=110 **because** the corner effect is deterministic and perfectly cancels: each seed
is played twice with the corners swapped, so one corner always winning produces a slot coin flip. **The slot number is
therefore not evidence of fairness** — it is the corner sweep being symmetric in the aggregate. Reporting it as a pass
without the corner row would be misleading, which is why both are here.

## 7. Gates, all run on this commit

**Final commit: `848ec94`** — all five CI checks green (quality, e2e, slow, v2, Cloudflare Pages).

| Gate | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (sim purity, UI style, no purple) |
| `tests/net/latency-jitter.test.ts` | **5/5 pass, UNMODIFIED** — 188/183/432/560 against a floor of >100 |
| `tests/phase5-teams.test.ts` | **4/4 pass** — 2v2 and the 4-player FFA both resolve; every player fields an army |
| `tests/phase5-fairness.test.ts` | 2/2 pass |
| `tests/sim/seed-variety.test.ts` | 2/2 pass — 8 distinct states, >=4 distinct lengths |
| `tests/phase5-maphack.test.ts` | pass — no fog cheating |
| `tests/data/parity.test.ts` | pass — no rule value changed |
| `tests/ui-phase4.test.ts` | 14/14 pass |
| `tests/touch/advanced-build.test.ts` | 5/5 pass — a real browser builds a Resonance Vault at five viewports |
| `tests/ui-proof.test.ts` | 32/32 pass — regenerated pack, 75 captures, 0 errors, 0.00% purple |

**The floor was never weakened.** `expect(r.outcomes.every((o) => o.issued > 100))` is unchanged from the day it was
written, and the four attempts to make room for expansion were rejected rather than accommodated.

**Four test races were hardened, not loosened, after CI caught them on commits that passed locally.** `tests/touch/advanced-build.test.ts`
hit `scrollIntoViewIfNeeded: Element is not attached to the DOM` on the desktop viewport, and
`tests/ui-phase4.test.ts`'s research-tree case reported "Mastery extends 362px past the graph viewport" on a commit that
had just passed it. Both were races against a grid/overlay rebuild, caused by sleeping a fixed number of milliseconds and
then measuring; both now assert that the layout has SETTLED.

`tests/touch/browser-touch.test.ts` and `advanced-build` also both tapped a *reconstruction* of the placement ghost's
position rather than the ghost itself — the safe-rect centre in one case and `(tx + 0.5) * TILE` in the other, which for a
2x2 structure is a full tile away from its real anchor — so the tap re-derived a different ghost and the placement was
silently dropped when that tile was occupied. Both now tap `worldToScreenPoint(g.x, g.y)`, the point the ghost was
validated at.

Finally, `tests/isolation.test.ts` walked `src/` and read each file later while `determinism-guard.test.ts` writes and
removes throwaway fixtures under `src/sim/` in `afterAll`; the read now tolerates a vanished file, which cannot hide a
real violation because a real source file does not vanish.

Every one of these is a test change. No assertion was weakened: the absolute "no column may extend past the viewport"
rule, the "a structure must exist in the sim" rule and every other one are untouched.

## 8. Known limitations, stated plainly

1. **The AI does not expand.** 0 buildings outside the starting cluster, 0 forward refineries, on every seed and every
   difficulty. The forward-base garrison, the surplus funding model, the affordability guard and the sanctum-anchored
   site search were all written and measured; they are reverted because of §4.
2. **The corner sweep is deterministic: corner 0 loses 100% of mirror games.** Not fixed. §5 has the mechanism and the
   three orderings tried.
3. **Median mirror length is 8.1 min against 15-25.** The AI fields one to four combat units, so matches end quickly and
   for the wrong reason. §2 is why.
4. **The activity floor passes for the wrong reason.** 84 of `p1`'s 188 commands are one unit being re-ordered. Any
   future change that removes that loop must expect the floor to fail, and must not treat that as a regression in play.
5. **No difficulty ladder is reported here.** With the corner sweep at 0%/100%, per-cell win rates measure the corner and
   not the difficulty: `audit/ladder-par.ts` measured Hard > Normal at 21.7% with `corner0 0 / corner1 13`, i.e. the
   inverted-looking number is the corner effect. Quoting it as a ladder result would be wrong.
6. **No overview capture shows two expanded bases,** because no such match exists on this build.
