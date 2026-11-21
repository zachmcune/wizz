# Difficulty lever ablation — what actually makes the AI stronger

Every number here came from `audit/ai-ablation.ts`, `audit/ai-matchup.ts` or a focused sweep on the **bias-fixed sim**, with each
seed played on both start corners so the first-player effect cancels. Sample sizes are stated, because at 12–24 games the
confidence interval is roughly ±20 points and a one-game delta is not evidence.

The Phase 5 requirement is that difficulty comes from *decisions*, and a decision is only worth keeping if it measurably helps.
Most of the findings below are negative: levers that sounded obviously good turned out neutral or harmful.

## Method, and two bugs that had to be fixed first

A matchup runs twice per seed — difficulty A in corner 0, then corner 1 — so the map's own asymmetry and the first-player effect
cancel. Two defects made earlier measurements untrustworthy, and both were fixed before any of the numbers below were taken.

**1. Target selection favoured the first player.** `acquireTarget` broke equal-distance ties on the lowest entity id, and ids are
allocated in player order. A mirror match gave the first-listed player **10 of 12**. The fix replaced the incremental comparison
with a symmetric total order on `(swarm desc, distance asc, symmetricRank(attackerId, targetId))`. A partial fix did NOT work: an
earlier attempt kept a running best where a false tie test simply retained the incumbent, so visit order still decided. Verified
directly — the rank prefers the first-listed candidate in 50.0% of pairs and the lower-id candidate in 50.9%.

Mirror after the fix: **11-13 over 24 decided games, 45.8%, 95% CI 27.9%–64.9%** — the interval contains 50%.

**2. Difficulty profiles were a shared mutable singleton.** `profileFor` returned the global `DIFFICULTIES` object, and the
ablation harness applies per-brain overrides with `Object.assign(brain.profile, …)`. An override therefore persisted for the rest
of the process, contaminating every later match in the same worker. The symptom was impossible to explain otherwise: two profiles
verified byte-identical (diffing all 17 fields, only the dead `reactionDelay` differed) measured 20.8% and 79.2% in the same run.
`profileFor` now returns a copy, so an override is local to the brain that requested it.

## The largest effect: Hard's build order, not any of its levers

Hard used `AGGRESSIVE_OPENING` while Normal used `STANDARD_OPENING`. With Hard's profile already identical to Normal's, swapping
only the opening gave:

| Opening | Result vs Easy |
|---|---|
| AGGRESSIVE_OPENING | 20.8% (5-19, 95% CI 9.2%–40.5%) |
| STANDARD_OPENING | **79.2%** (19-5, 95% CI 59.5%–90.8%) |

A **58-point swing** from the build order alone, same profile and same seeds. The aggressive line takes its second refinery at
60 s and its first static defence at 80 s, so it commits to army production while its economy is still thin — and a thin economy
cannot replace the army it spends. It reads as aggression and plays as a gamble.

Every difficulty now uses the standard opening, so difficulty lives entirely in the profile, which is the only thing the ablation
can measure.

## First-wave timing — the lever that dominated while it was a difficulty axis

| Condition | Result vs Easy |
|---|---|
| Normal 7, Easy 9 (as shipped) | Normal **1-7** |
| both 7 | Normal **7-1** |
| both 9 | Normal **4-4** |

Easy's entire advantage was attacking a few seconds earlier. `minWaveSize` is the same (7) for all three difficulties; keeping it
as an axis made "Easy" strong for a reason unrelated to playing well.

## Decision cadence — thinking faster measured weaker

| decisionInterval | Result vs Easy |
|---|---|
| 10 ticks (0.5 s) | 6-6 |
| 20 ticks (1.0 s) | **10-2** |
| 40 ticks (2.0 s) | **10-1** |

Measured mechanism: the faster AI issued a build attempt every half second and re-derived its economic reserve twice as often, so
its bank sat at **60 mana against 135** — permanently "saving" for a 750-cost building, **zero army for eight minutes, 23% map
coverage against 32%**. Hard's cadence is 20 ticks, the same as Normal. Reaction speed is not a legitimate difficulty axis here.

## Micro levers

Against Normal, 12 side-swapped games per condition, everything else identical:

| Lever added | Result |
|---|---|
| baseline (identical profile) | 6-6 |
| + kiting | 6-6 |
| + superweapon | 6-6 |
| + harass | 6-6 |
| + third producer | 6-6 |
| + all of the above together | **worse** (Hard fell to 20.8% vs Easy) |

Each individually neutral; the combination negative. Plausible interaction: kiting pulls ranged units out of the formation focus
fire depends on, harass splits a squad off the main push, and the superweapon diverts mana from production.

**The methodological point**: single-lever ablation cannot validate a SET. A lever only goes back on once the combination
containing it measures non-negative. None has yet, so Hard's repertoire is off.

## Static defence and scouting

Both are net-negative when they bid against army production, because a 250-mana turret or a drafted worker is a soldier not
trained and the earlier push wins:

| Condition | Result vs Easy |
|---|---|
| hard as shipped (older build) | 3-5 |
| hard without `buildsDefenses` | **6-2** |
| hard without `scouts` | **6-2** |

Removing defence *entirely* was also tested and was catastrophic — the base simply falls. Both remain enabled, with the turret
count capped by army size and workers only drafted while at least four remain.

## Where the difficulty ordering actually stands

Measured on the full 96-match bracket with the approved HQ change in place:

| Matchup | Result |
|---|---|
| Hard vs Easy | **79.2%** (19-5, 95% CI 59.5%–90.8%) |
| Normal vs Easy | **79.2%** (19-5, 95% CI 59.5%–90.8%) |
| Hard vs Normal | **67%** (16-8, 95% CI 46.7%–82.0%) |
| Mirror | **46%** (11-13, 95% CI 27.9%–64.9%, contains 50%) |

All four targets met, zero unfinished matches.

The separation rests on ONE lever, and it is not a micro skill: **Hard attacks at 5 units instead of 7**. Everything else
measured here came back neutral or worse — more workers (7-5), an extra producer (6-6), kiting (6-6), superweapon (6-6), harass
(6-6), faster decisions (6-6, while *slower* decisions scored 10-2). The largest single effect was Hard's build order: with
profiles identical, `AGGRESSIVE_OPENING` measured 20.8% against Easy and `STANDARD_OPENING` 79.2%.

So the ordering is real and reproducible, but it comes from commitment timing rather than from richer play. Stating that plainly
is more useful than implying the micro behaviours are doing work they measurably are not.

## Match length, for the record

Normal vs Normal median is **19.9 min** and the whole-bracket median is **20.3 min**, inside the 15–25 target. This was reached
by an approved rule change — `sanctum.hp` 2000 -> 4000 (Zachary, 2026-11-21) — chosen by sweeping values: 2000 gave 11.8 min,
3000 gave 12.9, 4000 gave 19.9 with the ordering unchanged. Turret toughening was measured and rejected: it equalises the
difficulties (hard>normal 75% -> 50% at damage 5) and rewards turtling (12 of 16 matches unfinished at damage 7). Every turret
stat therefore remains exactly v1.

The exhausted-economy behaviour is documented in `README.md`: node capacity is a locked v1 constant, so the whole map is 75,000
mana and it is mined out between minutes 15 and 20. Nothing in the economy was changed.
