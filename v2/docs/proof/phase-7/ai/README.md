# Phase 7 — AI expansion and fairness, measured

**Branch:** `cursor/rebuild-v2-5642`
**Harnesses:** `v2/audit/expand-outcomes.ts`, `expand-trace.ts`, `reserve-convergence.ts`, `mirror-par.ts`,
`ladder-par.ts`. Every number below came from one of those commands on this branch; the command is named beside it.

---

## 1. Goal A: why the AI stopped expanding

`docs/proof/phase-5/ai/phase6-fairness.md` §2 recorded that the AI never expands: every refinery and construction-yard
position stayed inside the starting cluster for a whole match. That conclusion was correct, and this pass found **six
independent causes**. Fixing any one of them still produced zero expansions, which is why the earlier pass stopped at
"the AI does not expand" rather than at a single regression.

| # | Defect | Measured evidence | Fix |
|---|---|---|---|
| 1 | `countBases` counted **every** owned building | A chain link sits ~6 tiles beyond the base by construction, so the FIRST 40-mana wall registered as a second base and `targetBases: 2` read `2 < 2`. `audit/expand-trace.ts`: `t=4m bld=7 ref=1 bases=2/2` with one wall standing and `nearOwn` still 513 units; no further expansion note for 22 minutes. | Count income anchors (completed refinery or yard) only. |
| 2 | `bestExpansionSite` treated **any** building within 12 tiles as "this node is served" | The chain that exists to reach a node disqualified that node on the very next pass: `audit/expand-gate.ts` laid one link, then reported `site=-` for the rest of the match. | Income anchors only, and at 5 tiles — so the map's 25,000 node 14.1 tiles from home is correctly a target. |
| 3 | The build-order reserve pins **spendable mana at 260** across the whole 300–750 band | `audit/reserve-convergence.ts` tabulates it: bank 300 → 260 spendable, 450 → 260, 600 → 260, 750 → 300. The army re-spends every surplus each pass, so the bank saturates below 750. The AI could not afford **any** 550–750 building (second refinery, second producer, forge, nexus) once its bank settled. | Hold everything above a 120-mana float once an expansion is approved. 120 is below every combat unit's cost (115–140), so production is never frozen. |
| 4 | Bridging lived **inside** `if (the refinery is affordable)` | The 40-mana link could never be laid while saving for the 750 it unlocks: `audit/expand-trace.ts` logged eleven straight minutes of `saving for attunement_spire (550/750)` with 322 units still between the AI and the node. | Hoisted out, and decoupled from whichever opening step is active — it previously advanced only during the seconds the planner was saving for *another* refinery. |
| 5 | Bridging had **no foundation guard** | `stone_wall` is not an opening step, so it had no `inProgressCount` guard: the planner re-issued the same rejected command every pass while the anchor search kept choosing the same occupied tile. `audit/expand-trace.ts`: "bridging toward the forward node (322 away)" logged for two minutes with the wall count unchanged. | One link in flight at a time. |
| 6 | The expansion turret had **no cap of its own** | The home ring's cap could not see forward turrets, so an expansion that kept being re-targeted produced **56 sentries and 68 buildings** in a 30-minute match with neither side able to finish. | Counted against the same global sentry budget. |

Two more defects were found only once an expansion finally existed, and are what make it *survive*:

| # | Defect | Measured evidence | Fix |
|---|---|---|---|
| 7 | The turret guard said "only once the refinery is standing there" but **never checked it** | Only `nearOwn <= 6 tiles` was tested, which the chain satisfies by itself, so the turret was bought the moment the route arrived and returned before the refinery was affordable. `audit/expand-trace.ts`: `EXPANDING: turret at the forward base` at 7.2 min, three walls, **no forward refinery in the match**. | Require a forward refinery before the turret. |
| 8 | The defender detachment keyed on a **finished** cluster | `countBases` counts completed anchors, so a refinery under construction left `bases` at 1 and the guard never ran. Measured on seeds 1000/1014/2014/3021/3056: the forward refinery went up at **7.2 min and died at 8.3 min on all five** — 68 seconds — to two enemy swarmlings, with nothing ever sent. | Guard the expansion site directly. |

### What the expansion is now

A forward base is a **pair**: a turret first (250), then the refinery (750) on the rich node. It is gated on being able
to afford both, attempted **once per site**, and the route walls are laid first out of the ordinary bank.

The turret-first order is measured, not stylistic. A lone refinery at this distance is destroyed in about 90 seconds;
handing the AI **400 extra mana** at the moment of placement did not save it either, so the problem was ordering rather
than money — buying the refinery first always emptied the bank and the defence was never affordable in the time the
building had left (treasury fell from 715 to 175 on placement, and the turret never appeared).

The pair is attempted once because rebuilding it was measured to *stall matches*: with a rebuild loop,
`tests/sim/seed-variety.test.ts` recorded **2 of 10 mirror matches hitting the 34-minute cap** and the first-listed slot
at 70%, because each destruction freed the AI to spend another 1000 mana on the same indefensible spot instead of on the
army that ends the match.

---

## 2. Measured result

`npx vite-node audit/expand-outcomes.ts 1000,1014,2014,3021,3056,3091 "hard>normal" 34`

A building is "outside the starting cluster" when it is more than 12 tiles from that side's own sanctum — the same radius
`countBases` clusters with, and deliberately the strict definition: a route wall counts, so a run that paved toward a node
and never reached it is visible as walls-with-no-refinery rather than as a success.

| Difficulty | Runs | Runs with a refinery outside the cluster | Refineries outside | Total buildings outside |
|---|---|---|---|---|
| **Hard** | 6 | **0** | 0 | 0 |
| **Normal** | 6 | **6** | **6** | 24 |

**Read this honestly.** The 6-for-6 row is the side that *survived*, and in these matchups that is Normal — Hard lost
every one of the six. The zero row is the side whose base was razed before the match ended, so its surviving buildings
are all gone. The metric therefore reports "did the winner hold an expansion", not "did Hard expand".

A per-side trace is the right instrument for the second question, and it is unambiguous:

`npx vite-node audit/expand-trace.ts` (seeds 1000, 1014, 2014, 3021, 3056, hard vs normal)

```
seed 1000: forward refinery placed 6.7m
seed 1014: forward refinery placed 6.7m
seed 2014: forward refinery placed 6.7m
seed 3021: forward refinery placed 6.7m
seed 3056: forward refinery placed 6.7m
```

**Every seed builds a forward refinery outside the starting cluster, at 6.7 minutes.** Before this pass, zero did.

### The honest limitation

**The forward base is lost in every traced match**, roughly 90–170 seconds after it completes, to enemy raiders. A site
14–30 tiles from home cannot be held by this AI against this AI. What the expansion buys is the income while it stands
and the shape it gives the game, not a permanent second base.

Two things were tried and are recorded so they are not retried blindly:

- **+400 mana at placement** — did not save the refinery. The defect is timing, not budget.
- **Rebuilding after destruction** — saved the base and stalled the matches (see §1, defect 8).

A real fix is a defence priority in `planMilitary` that garrisons a forward site *before* the refinery goes down, which
is an AI project rather than a threshold. It is written up as a proposal in `PROPOSALS.md` rather than half-implemented
here.

---

## 3. Fairness and the ladder

### Mirror — MET, and strongly

`npx vite-node audit/mirror-par.ts --seeds <50 seeds, 4000+7i> --minutes 34 --jobs 3` → `mirror-n100.txt`

```
MIRROR (normal, 100 matches, 50 seeds x2 assignments)
  slot   p1 50/100 = 50.0%  95% CI 40.4-59.6%  contains 50%: true
  corner0   0/50 = 0.0%  CI 0.0-7.1%
  corner1   50/50 = 100.0%  CI 92.9-100.0%
  unfinished 0/100   mean length 12.0m
```

**50.0% on 100 games.** Zero unfinished. Median length 11.9 min, mean 12.0.

The corner split is the finding, not a footnote: **every game was won by the side holding the top-right corner.** That
is a pre-existing, deterministic defect which this pass neither caused nor fixed — verified by re-running the identical
command with the whole AI change stashed, which produced byte-identical output. See `PROPOSALS.md` §1.

Because the mirror is *always* `corner0 vs corner1`, that effect cancels exactly in the slot figure — which is why the
mirror reads 50.0% while a cross-difficulty cell does not.

### Ladder — Normal>Easy MET, Hard>Normal NOT MEASURABLE

`npx vite-node audit/ladder-par.ts --seeds 20 --minutes 34 --jobs 3 --base 5000` → `ladder-n40.txt`

| Cell | Win rate | 95% CI | Unfinished | Median | Mean | By corner |
|---|---|---|---|---|---|---|
| Hard > Normal | 50.0% (20/40) | 35.2–64.8% | 0/40 | 12.1 min | 12.2 min | **corner0 0 / corner1 20** |
| Normal > Easy | **75.0%** (30/40) | 59.8–85.8% | 0/40 | 8.6 min | 10.8 min | corner0 20 / corner1 10 |

Target: both ≥ 70%.

- **Normal > Easy: met**, 75.0%, and its corner split (20/10) is a bias rather than a determinism.
- **Hard > Normal: not measurable on this build.** The `0 / 20` split means Hard lost all twenty games from one corner
  and won all twenty from the other — the corner decides the game by more than the difficulty gap does. Reported
  honestly as unmeasurable rather than as a 50% "result". The identical split reproduces on an INDEPENDENT seed block
  (5000–5133 measured `corner0 0 / corner1 20` as well) and with the whole AI change stashed, which is what makes it a
  property of the build rather than of one sample.

Earlier passes measured this same cell at 62.5%, 66.7% and 85.0% on different seed blocks. Those numbers were a corner
lottery, not a difficulty effect. **Do not tune difficulty levers against this cell until `PROPOSALS.md` §1 is fixed.**

### Median 1v1 length — MISSED

Target 15–25 min, ~20. Measured: mirror **11.9** min (N=100), Hard>Normal 12.1, Normal>Easy 8.7. Every cell is short.

Not re-tuned: the levers are rule values, and Phase 6 swept them and confirmed them dead (sanctum HP 4000→8000 buys
0.9 min; production capacity 2→4 buys nothing). Written up as `PROPOSALS.md` §3.
