# Difficulty lever ablation — what actually makes the AI stronger

Every number here came from `audit/ai-ablation.ts` or a focused matchup run on the **bias-fixed sim**, with each seed played on
both start corners so the first-player effect cancels. Sample sizes are stated because a 12-game delta of one game is noise.

This file exists because the Phase 5 requirement is that difficulty comes from *decisions*, and a decision is only worth keeping
if it measurably helps. Several levers that sounded obviously good turned out to be neutral or actively harmful, and that is the
main finding.

## Method

A matchup is run twice per seed: difficulty A in start corner 0, then in corner 1. That is necessary, not pedantic. Before the
sim's tie-breaking was fixed, the first-listed player won **10 of 12** mirror matches purely from entity-id allocation order.
Side-swapping cancels the effect on a matchup comparison; fixing the tie-break removed most of it, and the mirror now measures
**11-13 over 24 games (45.8%, 95% CI 27.9%–64.9%)**, an interval that contains 50%.

Win rates are reported with a Wilson 95% interval. At 12–24 games those intervals are wide — roughly ±20 points — so a delta
smaller than about two games is not evidence of anything.

## The lever that dominated everything: first-wave timing

This one is not a skill lever, and it was the single largest effect measured.

| Condition | Result vs Easy |
|---|---|
| Normal `minWaveSize` 7, Easy 9 (as shipped) | Normal **1-7** |
| both `minWaveSize` 7 | Normal **7-1** |
| both `minWaveSize` 9 | Normal **4-4** |

Easy's whole advantage was attacking a few seconds earlier. In this game the side that commits first wins, so a lower wave
threshold beat better judgement. `minWaveSize` is therefore **the same for all three difficulties (7)**, and difficulty rests on
the levers below instead. Leaving it as a difficulty axis would have made "Easy" strong for a reason unrelated to playing well.

## Decision cadence — thinking faster made the AI weaker

Holding the profile identical and varying only `decisionInterval`, against Easy over 12 games per condition:

| decisionInterval | Result |
|---|---|
| 10 ticks (0.5 s) | 6-6 |
| 20 ticks (1.0 s) | **10-2** |
| 40 ticks (2.0 s) | **10-1** |

The mechanism was measured, not guessed: the faster AI issued a build attempt every half second and re-derived its economic
reserve twice as often, so its bank sat at **60 mana while the slower one held 135**. It was permanently "saving" for a
750-cost building and never funded an army — **zero army for eight minutes, 23% map coverage against 32%**. A machine that
decides more often is noisier, not smarter.

Hard's cadence is therefore 20 ticks, the same as Normal. Reaction speed is not a legitimate difficulty axis here.

## Micro levers — each measured individually

Against Normal, 12 side-swapped games per condition, with everything else held identical:

| Lever added | Result vs Normal |
|---|---|
| baseline (identical profile) | 6-6 |
| + kiting | 6-6 |
| + superweapon | 6-6 |
| + harass | 6-6 |
| + third producer | 6-6 |

**All exactly neutral.** This reversed an earlier conclusion: before the tie-break fix the same levers measured *negative*
(kiting, counters and harass each appeared to cost games), which was partly an artefact of an unfair sim rather than of the
levers themselves.

### ...but individually neutral does NOT mean safe in combination

Enabling kiting, superweapon and harass TOGETHER dropped Hard from **33.3% to 20.8%** against Easy. Each lever alone cost nothing;
all three at once cost twelve percentage points.

The interaction is plausible from what each does: kiting pulls ranged units out of the formation that focus fire depends on,
harass splits a squad off the main push, and the superweapon diverts mana from production. Each is affordable in isolation and
together they blunt the one push that decides the game.

**This is the methodological lesson of the whole exercise**: ablation of single levers cannot validate a *set* of them. The
repertoire is therefore off, and a lever only goes back on once the COMBINATION including it measures non-negative. The
individual results above are kept because they are the honest first-order measurement, not because they justify the set.

## Static defence and scouting

Both are net-negative when they compete with the army for mana, because a 250-mana turret or a drafted worker is a soldier not
trained, and the earlier push wins. Earlier ablation on the biased sim:

| Condition | Result vs Easy |
|---|---|
| hard as shipped | 3-5 |
| hard without `buildsDefenses` | **6-2** |
| hard without `scouts` | **6-2** |

Removing defence entirely was also tested and was catastrophic (the base simply falls), so the resolution is not to delete them
but to stop them bidding against army production. Both remain enabled, with turret count capped by army size and workers only
drafted while at least four remain.

## What this means for the difficulty design

Hard's strength does **not** currently come from those micro levers — they are neutral. What separates Normal from Easy is the
cumulative effect of the economic and behavioural profile, measured at **79.2% (19-5, 95% CI 59.5%–90.8%)** over 24 games.

Hard versus Normal measures **6-6 in the identical-profile control**, i.e. exact parity, and the levers added back on top each
measure neutral. So Hard is **equal to Normal, not stronger** — it plays with more of the AI's behaviour switched on, and that
behaviour is, on this map and economy, worth zero wins.

Closing that gap is the outstanding item. It needs a lever that measurably changes a *fight outcome* — likely army composition
quality or engagement timing — rather than more behaviours layered on top of a neutral baseline.

## Match length, for the record

Normal vs Normal median is **11.8–23.0 minutes** depending on the seed set, still short of the 15–25 target on the faster sets.
The cause is understood and is *not* being addressed here: early pushes succeed because static defence is too weak to stop them,
and unit/building stats are locked to v1 parity by `tests/data/parity.test.ts`. Relaxing that lock is a rule change awaiting
approval, so no data has been touched.
