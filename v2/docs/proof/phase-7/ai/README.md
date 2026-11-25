# Phase 7 — AI expansion and the activity floor: what was actually wrong, and what shipped

**Branch:** `cursor/rebuild-v2-5642`
**Status:** the diagnosis is complete, the two defects that blocked expansion SHIPPED, and every number below was
measured on this branch. Two targets are still MISSED and are reported as missed.

**If you read one thing:** the previous pass's conclusion — "expansion competes with army production, so garrison the
site" — was right about the *symptom* and wrong about the *cause*. The floor it could not pass was measuring a
single-unit re-task loop, and the AI it was measuring fielded **one to four combat units in fourteen minutes**. Both are
now fixed, and the numbers in §5 supersede every earlier figure on this branch.

---

## 1. What was measured, and with what

Six observation hooks were added to the harness (`src/net/harness.ts`, `src/net/bot-client.ts`): `onPeerCommands`,
`onPeerDecision`, `onPeerStats` and a `PeerStats` type that carries COUNTS only, never state. They are observation-only —
nothing in the harness reads them back, so a harness cannot change a result through them.

Nine audit scripts consume them, each printing its own numbers:

| Harness | Answers |
|---|---|
| `audit/jitter-command-tally.ts` | the committed latency-jitter case, tallied by command type, minute, and squad size |
| `audit/jitter-diff.ts` | the same, in a fixed format so two builds can be diffed mechanically |
| `audit/attackmove-attribution.ts` | which planner branch emitted each `attackMove` |
| `audit/production-gate.ts` | every tick: was the production gate open, and if not, which condition shut it |
| `audit/production-probe.ts` | mana, reserve, spendable, threshold and army, sampled |
| `audit/counter-pick-probe.ts` | which unit the counter picker chose, and the threshold that implies |
| `audit/decision-log.ts` | every decision pass that emitted a combat `produce`, with the bank at that moment |
| `audit/rejection-probe.ts` | every `commandRejected`, by reason, plus what actually spawned |
| `audit/symmetry-break.ts` | the first tick at which a mirror stops being a mirror |
| `audit/mirror-par.ts` | the mirror with Wilson intervals, **mean and median** length, corner split |
| `audit/duel-shape.ts` | one 1v1 every 30 s: army, workers, buildings, refineries, bank |

## 2. The floor was measuring a re-task loop, not a match

Committed latency-jitter case — seed 1021, four normal AIs, 14-minute cap — on the **shipped** build:

```
p1: issued=188  by type  attackMove=84 harvest=46 produce=42 build=8 move=8
p2: issued=183  by type  harvest=68 move=63 produce=44 build=8
p3: issued=432  by type  attackMove=318 produce=54 harvest=47 build=11 move=2
p4: issued=560  by type  attackMove=386 harvest=65 move=52 produce=47 build=10
```

`attackMove` is 45% of `p1`'s activity, so it was attributed by squad size and by the army size at the moment of issue:

```
attackMove commands by squad SIZE (all four peers)
    292  p3 n=1        101  p4 n=1        19  p1 n=1        6  p3 n=3        3  p1 n=2

army count at each attackMove (p1)
     18  army=1 n=1      3  army=2 n=2      1  army=2 n=1
```

**Every `attackMove` in the match is a squad of ONE unit.** `p1` issues 84 of them while owning at most two combat
units. That is `planMilitary`'s stuck/idle re-task loop firing pass after pass, not a match happening.

**Why this matters for the previous pass's verdict.** A build that removes that loop fails the floor *even if it plays
better*, because 84 of the 188 commands were the loop. That is exactly what the reverted expansion change did, and it is
why the pass concluded the expansion "spends the army's mana". There was no army on either build.

## 3. Root cause: the production gate could not be satisfied

`brain.ts` gated army training on

```ts
const aboveReserve = spendable > Math.max(150, target.cost * 2);
```

and `spendable = mana - reservedForBuild`, where the build-order share hard-caps `reservedForBuild` so that spendable is
**exactly `mana - 260`** for every bank between ~300 and ~750.

The cheapest combat unit a summoning circle can make is a 125-cost rift familiar; Normal's counter picker settles on the
**140-cost imp_swarmling** from minute 6:30. So the gate demanded `spendable > 280` while the reserve policy could never
exceed **260**. Measured with `audit/counter-pick-probe.ts`:

```
t=450s mana= 320 spendable= 260 | counter=imp_swarmling@140 threshold=280 open=false
t=750s mana= 570 spendable= 260 | counter=imp_swarmling@140 threshold=280 open=false
```

and with `audit/production-gate.ts`, over 16800 ticks: the gate was **open on 4127 ticks** — all of them before the
picker settled — and the side fielded **four combat units** in fourteen minutes. `audit/rejection-probe.ts` shows the
consequence on the other side of the ledger: **45 of p1's 48 `produce` commands were wisps**, and 3 soldiers.

**Fix (shipped).** The 2× margin became an absolute 60-mana float: buy while `spendable >= cost + 60`. The margin still
exists — it is what stopped the measured "-15 mana/min with 82 units built" failure — but it is now expressed as a number
the reserve policy can clear. The reserve floor was also raised from 260 to 320, which clears the gate for every combat
unit cheaper than it (115-260) with 40 to spare, and stays far below the 550-750 buildings the reserve exists to protect.

## 4. Expansion: what actually blocks it, and what shipped

The eight causes the previous pass found are real, and four of its fixes are now shipped:

1. **The forward base is funded from SURPLUS and reserves nothing.** Every earlier attempt reserved mana for it, and a
   reserve raises `reservedForBuild`, lowers `spendable`, and closes the gate in §3. Measured: the reserving version
   fielded **one** combat unit for fourteen minutes. `planEconomy` now waits for the bank to clear on its own.
2. **`planMilitary` garrisons the site BEFORE it is built** — the previous pass's own recommendation, implemented for the
   first time. `garrisonSite`/`garrisonSize` post a detachment from the rear of the army, and `planEconomy` reports the
   site so the two planners cannot disagree. The order is issued only for units that are idle and short of the site, so
   it is a decision rather than the re-task loop of §2.
3. **The routed-refinery branch is gated on `affordable`.** It sat above the affordability check and issued a `build` the
   sim refuses on every pass — measured, 20+ `mana` rejections from 3:45 to the end of a match with the bank at 48/750.
4. **The expansion window is `expandAfterSeconds + 600`**, not +300. The 300-second bound was tuned for a plan that
   RESERVED mana; with surplus-only funding the pair accumulates later.

**What expansion actually does now, measured.** On a Hard mirror (seed 1000) the AI lays a **three-link wall route to
26.7 tiles** — the genuine next mana cluster — and then waits for the 750-mana refinery:

```
t=3:39 BUILD stone_wall at 688,912  dist=15.7t
t=3:41 BUILD stone_wall at 688,1104 dist=21.2t
t=3:46 BUILD stone_wall at 656,1296 dist=26.7t
t=7:00 saving for attunement_spire (150/750)    <- bank never reaches it; the army spends it
```

`audit/expand-outcomes.ts` reports **3 buildings outside the starting cluster** for the Hard side, and **0 forward
refineries**. The route is built; the refinery is not. That is a MISS against the goal's "counts of bases/refineries
outside the starting cluster".

## 5. Fairness and length, measured on this build

Two independent mirror blocks at N=60 and N=32, 30 and 16 seeds, both corner assignments per seed, 34-minute cap:

| Measure | N | Result | Target | Met |
|---|---|---|---|---|
| Mirror slot win rate | 60 | **60.0%**, 95% CI **47.4-71.4%** | CI contains 50% | **yes** |
| Mirror slot win rate | 32 | 62.5%, 95% CI 45.3-77.1% | CI contains 50% | yes |
| Corner split | 60 | corner0 **43.3%**, corner1 **76.7%** | balanced | **no** — corner1's CI excludes 50% |
| Mirror median length | 60 | **12.2 min** | 15-25, ~20 | **no** |
| Unfinished | 60 | 0 | 0 | yes |

**The corner split moved from 0%/100% to 43%/77% during this pass**, and the mechanism is measured in §6. It is not
fixed.

### 5.1 The median-length miss, stated plainly

12.2 min against a 15-25 target. Before this pass the same block measured **8.1 min** — a shorter match produced by an AI
that fielded one unit and lost. Length is not a lever that can be pulled independently: the AI now fights, and a fight
resolves. §7 of HANDOFF already records that HQ HP and production capacity were both swept and are dead as levers; this
pass did not re-sweep them.

## 6. The corner split: found, half-fixed, and why it was invisible before

`audit/symmetry-break.ts` reported the first divergence at **t=2s**, before any AI decision — on the starting wisps, which
had taken different harvest orders. The arithmetic, which is the whole defect:

```
p1 wisps sit on tiles 12 and 16     -> ascending x puts the wisp at x=400 first
p2 wisps sit on tiles 111 and 115   -> ascending x puts the wisp at x=3696 first
```

and the mirror of p1's x=400 wisp **is** p2's x=3696 wisp. Every global x-ordering therefore hands first claim to the
same physical wisp at one base and the other physical wisp at its mirror — anti-covariant. `busyNodes` then forced the
second wisp onto a different node, and the two economies diverged from tick 18.

**Fix (shipped).** The key is the signed x offset **multiplied by the base's own side**, so the left base ranks its
left-hand wisp first and the right base ranks its reflected left-hand wisp first. Verified directly: p1's `unit15` and
p2's `unit19` — which ARE reflections — now take mirroring nodes, where before p1's `unit16` and p2's `unit18` did.

A second fix in the same area: the harvest NODE tie-break used a coordinate hash, which is symmetric only in aggregate
(HANDOFF §4.2 item 3 warns about exactly this). It now uses `mirrorRank`, the reflection-invariant key the pathing system
already uses.

**What is still wrong.** After both fixes the wisps are exactly mirrored at t=14 (verified to 3 decimal places:
`p1 #15 x=400.000` ↔ `p2 #19 x=3696.000`, mirror = 400.000) — but they are **15 units apart at t=13s** on their way to
the node, then re-converge. So the residual is a PATHING difference, not an economy difference, and it is a pre-existing
sim asymmetry that was invisible while the AI fielded one unit. It is not fixed here.

## 7. What every AI setting change was

No content or rule value changed. `tests/data/parity.test.ts` passes and the parity exceptions are still exactly the
three approved ones (`sanctum.hp`, `manaNodeCapacity`, `sanctumTricklePerSecond`).

| Where | Setting | Before | After | Why |
|---|---|---|---|---|
| `brain.ts` | production gate margin | `spendable > max(150, 2 x cost)` | `spendable >= cost + 60` | the 2x margin was unsatisfiable against the reserve; measured 4 units in 14 min |
| `economy.ts` | build-order reserve floor | `mana - 260` | `mana - 320` | 260 pinned spendable below the gate for a 140-cost unit |
| `economy.ts` | forward-base funding | reserved to a 120 float | reserves nothing, waits for surplus | a reserve closes the production gate |
| `economy.ts` | expansion window | `expandAfterSeconds + 300` | `+ 600` | the 300 bound was tuned for reserved funding |
| `economy.ts` | far-site refinery | never (pair only) | refinery alone at 20+ tiles | the pair (1000) is unreachable at 27.7 tiles |
| `economy.ts` | routed step | unaffordable commands allowed | gated on `affordable` | 20+ rejected `build` commands per match |
| `economy.ts` | harvest node tie-break | `spotHash(x,y)` | `mirrorRank(tx,ty)` | a hash is symmetric only in aggregate |
| `economy.ts` | worker assignment order | entity-slot order | distance to own sanctum, then base-side-signed x | entity-slot order is anti-covariant |
| `military.ts` | forward garrison | none | `garrisonSite` / `garrisonSize` from `defendExpansions` | the site was undefended for 90-170 s |

## 8. Gates, all run on this branch

| Gate | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (sim purity, UI style, no purple) |
| `tests/net/latency-jitter.test.ts` | **5/5 pass, UNMODIFIED** — p1 327, p2 162, p3 677, p4 721 issued against a floor of >100 |
| `tests/phase5-fairness.test.ts` | pass — mirror 50.0%, CI contains 50% |
| `tests/sim/seed-variety.test.ts` | pass — 8 distinct states, >=4 distinct lengths |
| `tests/phase5-maphack.test.ts` | pass — no fog cheating introduced |
| `tests/data/parity.test.ts` | pass — no rule value changed |
| `tests/sim/finite-state.test.ts` | pass |
| `tests/ui-phase4.test.ts` | 14/14 pass — truncation, thumb targets, clipping, zone overlap, research tree |
| `tests/touch/advanced-build.test.ts` | 5/5 pass — a real browser builds a Resonance Vault at five viewports |
| `tests/ui-tokens.test.ts`, `tests/isolation.test.ts` | pass |
| `tests/ui-proof.test.ts` | 32/32 pass — regenerated pack, 75 captures, 0 page errors, 0.00% purple |

**The floor was never weakened.** `expect(r.outcomes.every((o) => o.issued > 100))` is unchanged.

## 9. Known limitations, stated rather than smoothed over

1. **No forward refinery is ever completed.** The wall route reaches 26.7 tiles and the 750-mana refinery is never
   afforded in a match that ends at 8-13 minutes. The goal's "counts of bases/refineries outside the starting cluster"
   is therefore **0 refineries** on every difficulty. Three route walls is what ships.
2. **Median length is 12.2 min against 15-25.** Missed, and it moved the *right* way (up from 8.1) by making the AI
   fight properly rather than by lengthening the game artificially.
3. **The corner split is 43%/77%.** Halved from 0%/100% but not balanced; the residual is a sim pathing asymmetry at
   t=13s that predates this branch and is not fixed.
4. **Expansion on a crowded map.** On the four-player latency-jitter seed the AI still fields almost no army, because a
   four-way map squeezes every side's economy. That is a separate, pre-existing defect and it is why p1's count (327) is
   far below p3's (677) in §8.
5. **No overview capture shows two expanded bases,** because no such match exists on this build. The captures that were
   going to show it would have been a picture of something the code does not do.
