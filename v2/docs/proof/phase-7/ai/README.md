# Phase 7 — AI expansion: diagnosed, and deliberately NOT shipped

**Branch:** `cursor/rebuild-v2-5642`
**Status:** the diagnosis is complete and committed. **The behavioural change was reverted**, because it fails a
committed CI gate. `src/ai/economy.ts` is byte-identical to the pre-pass baseline; what remains on this branch is the
analysis, the harnesses, and this record.

---

## 1. Why the AI never expanded — eight independent causes, all measured

`docs/proof/phase-5/ai/phase6-fairness.md` §2 recorded that the AI never expands. That was correct, and this pass found
**eight independent causes**. Fixing any one of them alone still produced zero expansions, which is why the earlier pass
stopped at "the AI does not expand" rather than at a single regression.

| # | Defect | Measured evidence | Fix (written, then reverted with the rest — see §3) |
|---|---|---|---|
| 1 | `countBases` counted **every** owned building | A chain link sits ~6 tiles beyond the base by construction, so the first 40-mana wall registered as a second base and `targetBases: 2` read `2 < 2`. `audit/expand-trace.ts`: `t=4m bld=7 ref=1 bases=2/2` with one wall standing, `nearOwn` still 513 units, and no further expansion note for 22 minutes. | Count income anchors only. |
| 2 | `bestExpansionSite` treated **any** building within 12 tiles as "this node is served" | The chain that exists to reach a node disqualified that node on the next pass. `audit/expand-gate.ts` laid one link, then reported `site=-` for the rest of the match. | Income anchors within 5 tiles. |
| 3 | The build-order reserve pins **spendable mana at 260** across the 300–750 band | `audit/reserve-convergence.ts` tabulates it: bank 300 → 260 spendable, 450 → 260, 600 → 260, 750 → 300. The army re-spends every surplus each pass, so the bank saturates below 750. The AI could not afford **any** 550–750 building once its bank settled. | Converge the reserve on the routed refinery only. |
| 4 | Bridging lived **inside** `if (the refinery is affordable)` | The 40-mana link could never be laid while saving for the 750 it unlocks: `audit/expand-trace.ts` logged eleven straight minutes of `saving for attunement_spire (550/750)` with 322 units still between the AI and the node. | Hoist it out, decoupled from the active step. |
| 5 | Bridging had **no foundation guard** | `stone_wall` is not an opening step, so it had no `inProgressCount` guard: the same rejected command was re-issued every pass while the anchor search kept choosing the same occupied tile. | One link in flight at a time. |
| 6 | The expansion turret had **no cap of its own** | The home ring's cap could not see forward turrets: **56 sentries and 68 buildings** in one 30-minute match with neither side able to finish. | Same global sentry budget. |
| 7 | The turret guard said "only once the refinery is standing there" but **never checked it** | The turret was bought the moment the route arrived and returned before the refinery was affordable: `EXPANDING: turret at the forward base` at 7.2 min, three walls, **no forward refinery in the match**. | Require a forward refinery first. |
| 8 | The defender detachment keyed on a **finished** cluster | `countBases` counted completed anchors, so a refinery under construction left the count at 1 and the guard never ran. Seeds 1000/1014/2014/3021/3056: the forward refinery went up at **7.2 min and died at 8.3 min on all five** — 68 seconds — to two swarmlings, with nothing ever sent. | Guard the expansion site directly. |

## 2. What was measured with all eight fixes applied

With the fixes in place the AI **did** expand, and this part of the result is solid:

- **6 of 6 traced seeds** placed a forward refinery at **6.7 minutes** (previously 0 of 6).
- `audit/expand-outcomes.ts` reported the surviving side holding **3 refineries and 3 route walls outside its starting
  cluster**, with the count burned into the committed captures (`captures/overview-*-7min.png`).
- The mirror was **50.0% on 100 games** (95% CI 40.4–59.6%, 0 unfinished, mean 12.0 min).

Those numbers are real, and they describe a build that was **not shipped**, because of §3.

## 3. Why it was reverted — the honest part

The change fails `tests/net/latency-jitter.test.ts` (the "heavy jitter with asymmetric latency on 4 peers" case), which
is a committed CI gate.

All four peers stayed **perfectly in sync** — identical final hashes, zero desyncs, tick 16800 on every peer. What failed
is the **activity floor** beside the sync assertion:

```ts
// A real match has to have happened; two idle worlds would agree for the wrong reason.
expect(r.outcomes.every((o) => o.issued > 100), `${label}: channel barely used`).toBe(true);
```

| Build | p1 | p2 | p3 | p4 | Gate |
|---|---|---|---|---|---|
| pre-pass baseline | 188 | 183 | 432 | 560 | **passes** |
| with the expansion fixes | **95** | 101 | 410 | 113 | **fails** (p1) |

The mechanism was isolated exactly: changing `countBases` from "any building" to "income anchors" is sufficient on its
own to move p1 from 188 to 137, and the rest of the fixes take it to 95. The expansion branch legitimately opens at
Normal's `expandAfterSeconds: 180`, and in a 4-way game the AI spends enough of the mid-game reserved for a 1000-mana
forward base that it issues fewer commands before the 14-minute cap.

Several attempts were measured and did not recover the floor: a 300-second window bound, an enemy-army threat gate,
making the "saving" path non-returning, and restoring the home-defence branch byte-for-byte. Each was tried in isolation
and none restored p1 above 100 without also removing the expansion itself.

**Decision: revert rather than ship a red gate, or weaken the gate.** Weakening an assertion that exists to stop
"two idle worlds agreeing for the wrong reason" would be exactly the kind of papering-over this project's working rules
forbid. The AI's expansion behaviour is therefore unchanged from the pre-pass baseline, and that is stated plainly rather
than buried.

**What would make it shippable.** The activity floor is a symptom: the expansion competes with army production for the
same mana in the early-mid game. The fix is a garrison-before-construction change in `planMilitary` (§4), which spends
army mana *on the army* while it covers the site, instead of reserving it out of the army's budget. That is an AI project
with its own measurement, not a threshold, and it is the recommended next step.

## 4. Recommended next step

1. **`planMilitary` garrisons the forward site before the refinery is placed.** `assessBaseThreat(per, registry, homeX,
   homeY)` currently only ever looks at home; a second call pointed at the expansion site, with a small standing
   detachment committed *before* construction, would give the site a real chance. All eight fixes in §1 are needed for
   this to have anything to defend.
2. **Re-run `tests/net/latency-jitter.test.ts` after every step.** It is the instrument that caught this, and it caught it
   only because it asserts activity as well as sync.
3. **Then re-measure the ladder.** Do not tune difficulty levers against Hard-vs-Normal before the corner defect in
   HANDOFF §7.4 is fixed; that cell is a corner lottery at any sample size.

## 5. Fairness and ladder — measured on the REVERTED (now shipped) build

The numbers below were measured while the expansion fix was applied. Since that fix has been reverted, they do **not**
describe the code on this branch; they are kept because they were taken on a real build and they show what the fixes did
to fairness and length. Re-measuring on the shipped build is listed as a next step in §4.

| Measure | N | Result (on the reverted build) | Target | Met |
|---|---|---|---|---|
| Mirror slot win rate | 100 | **50.0%**, 95% CI 40.4–59.6%, 0 unfinished | CI contains 50% | **yes** |
| Mirror median length | 100 | **11.9 min** | 15–25 | **no** |
| Normal > Easy | 40 | **75.0%**, CI 59.8–85.8%, 0 unfinished | ≥70% | **yes** |
| Hard > Normal | 40 | 50.0%, but **corner0 0 / corner1 20** | ≥70% | **not measurable** |

The corner split is a **pre-existing deterministic defect**: Hard lost all twenty games from one corner and won all
twenty from the other, which is larger than the difficulty gap being measured. Stashing the whole pass and re-running the
identical command reproduces it byte-for-byte, and an independent seed block reproduces it too. It is not terrain — parity
and nav symmetry both pass. See **HANDOFF §7.4** and `PROPOSALS.md` §1.

`ladder-n40.txt`, `ladder-final.json` and `mirror-n100.txt` hold the raw output.

## 6. Harnesses (all committed, all print their own numbers)

| Harness | Answers |
|---|---|
| `audit/expand-trace.ts` | per-pass expansion decision: site, distance, chain count, mana, why nothing happened |
| `audit/expand-outcomes.ts` | per-match counts of buildings/refineries OUTSIDE the starting cluster, by difficulty |
| `audit/expand-gate.ts` | the `targetBases` counterfactual — does lifting the counter make it expand? |
| `audit/expand-nodes.ts` | which nodes are eligible and which are "covered", and by what |
| `audit/expand-spot-probe.ts` | whether a legal tile exists at the site, and why every other candidate is rejected |
| `audit/expand-reserve-probe.ts` | whether the reserve is actually binding, per pass |
| `audit/reserve-convergence.ts` | the reserve arithmetic as a table, plus a bank simulation |
| `audit/ladder-par.ts` | the difficulty ladder with Wilson intervals, corner-split |
| `audit/mirror-par.ts` | the mirror, both corner assignments per seed |

Run them with `npx vite-node audit/<name>.ts`. They are **not** gates; the gates are in `v2/tests/`.
