# Phase 7 — AI expansion: the real blocker, measured

**Branch:** `cursor/rebuild-v2-5642`
**Status:** diagnosis complete on the final build; the fix described here is implemented and measured in
`README.md` alongside this file.

This file exists because the previous pass's conclusion — "the expansion competes with army production for the same
mana, so garrison the site in `planMilitary`" — is **wrong about the mechanism**, and acting on it would have spent the
whole pass optimising a branch that the activity floor does not reach. The floor is tripped by an economy problem that
predates the expansion change, and it is the same problem on both builds.

---

## 1. What the previous pass got right, and what it did not measure

Right, and reproduced here:

- The eight causes in `README.md` §1 are real. Re-applying `655429f` + `e02d154` restores the expansion.
- The activity floor in `tests/net/latency-jitter.test.ts` does fail on that build, at **95** issued on `p1`.
- All four peers stay in sync (identical hashes, 0 desyncs), so it is an activity floor and not a sync failure.

Not measured by that pass:

- **Which commands went missing.** "The AI issues fewer commands" is compatible with production stopping, movement
  stopping, or the match ending earlier. The pass assumed the first without counting.
- **Whether the baseline's activity was real.** The floor is only a useful instrument if the commands under it mean
  something. They do not, on this seed — see §3.

## 2. The instrument

`src/net/harness.ts` now accepts four observation hooks (`onPeerCommands`, `onPeerDecision`, `onPeerStats`, and a
`PeerStats` type that carries counts only, never state). They are observation-only: nothing in the harness reads them
back, so a harness cannot change a result through them. `audit/jitter-command-tally.ts` replays the exact peers of the
committed latency-jitter case and tallies commands by type, per minute, and by squad size, plus every note the planners
emit.

## 3. The baseline's 84 `attackMove`s are ONE unit in a loop

Seed 1021, four normal AIs, 14-minute cap — the committed case, unmodified baseline:

```
p1: issued=188  by type  attackMove=84 harvest=46 produce=42 build=8 move=8
p2: issued=183  by type  harvest=68 move=63 produce=44 build=8
p3: issued=432  by type  attackMove=318 produce=54 harvest=47 build=11 move=2
p4: issued=560  by type  attackMove=386 harvest=65 move=52 produce=47 build=10
```

`attackMove` is 45% of `p1`'s activity, so it needs to be attributable. Tallying squad sizes and the army size at the
moment of issue:

```
attackMove commands by squad SIZE (all four peers)
    292  p3 n=1
    101  p4 n=1
     19  p1 n=1
      6  p3 n=3
      3  p1 n=2

army count at each attackMove (p1)
     18  army=1 n=1
      3  army=2 n=2
      1  army=2 n=1
```

**Every `attackMove` in the whole match is a squad of one.** `p1` issues 18 of them with exactly one combat unit on the
map, and 84 in total with never more than two. This is `planMilitary`'s stuck/idle re-task loop (§5 in `military.ts`)
firing pass after pass on a unit that holds an order it cannot satisfy. It is activity in the sense the floor measures —
the channel is used — but it is not a match happening.

**The consequence for this pass:** a build that removes those re-tasks will fail the floor *even if it plays better*,
because 84 of the 188 commands were the loop. That is exactly what the expansion build does, and it is why the pass
concluded the expansion "spends the army's mana" when in fact **there was no army on either build.**

## 4. Why there is no army — production is starved, and it is not the expansion

The same trace, at 30-second resolution, on BOTH builds (the expansion change is applied in one and not the other; the
numbers are identical to the digit):

```
t=2m  p1 army=0 harv=7 bld=4 ref=1 mana=65
t=4m  p1 army=0 harv=6 bld=7 ref=1 mana=190
t=6m  p1 army=0 harv=6 bld=7 ref=1 mana=30
t=8m  p1 army=0 harv=6 bld=7 ref=1 mana=70
t=10m p1 army=1 harv=6 bld=7 ref=1 mana=45
t=12m p1 army=0 harv=4 bld=7 ref=1 mana=35
```

Every side fields **zero to one** combat units for fourteen minutes while running six to eight harvesters. Counting what
actually spawned and what was rejected over the whole match (`audit/rejection-probe.ts`):

```
produce by unit
     46  p3 wisp
     45  p4 wisp
     45  p1 wisp
     44  p2 wisp
      4  p3 imp_swarmling
      3  p1 imp_swarmling
      2  p4 imp_swarmling

rejections
      3  each peer — reason `mana`
```

**The AI spends essentially its entire production budget on workers and buys three to four soldiers in fourteen
minutes.** The expansion branch is not involved: the counts are the same with the branch removed.

### 4.1 The arithmetic that causes it

`brain.ts` gates army production on

```ts
const aboveReserve = spendable > Math.max(150, target.cost * 2);
```

where `spendable = mana - reservedForBuild`, and `reservedForBuild` is the build-order share in `economy.ts`. For any
pending step whose cost is above the bank, that share is

```ts
Math.max(0, Math.min(Math.floor(mana * share), Math.max(0, mana - 260)))
```

— i.e. **spendable is pinned at exactly 260** for every bank between ~300 and ~750. `audit/reserve-convergence.ts`
tabulates the same saturation and the previous pass quoted it as cause #3.

The cheapest combat unit a summoning circle can make is `rift_familiar` at **125**, so the gate demands
`260 > 250` — true, but by **ten mana**. The planner then issues a produce in the same pass as up to three `wisp`
produce commands (the worker batch), the worker commands are applied first, and the combat produce is rejected for
`mana`. Measured: **45 of p1's 48 produce commands are wisps**, and the three that are not are the only soldiers it ever
gets.

This is a genuine defect and it is **pre-existing** — it is identical on the baseline and on the expansion build, and it
is the reason the ladder and the mirror are measured against an AI that fields one unit. It is also why the "stuck unit"
loop is so large a share of the activity: with an army of one, the re-task loop IS the army.

### 4.2 What this means for the eight causes

They are still correct and still necessary. But an expansion built on an AI that fields no army cannot be measured
fairly, and its forward refinery will always die to the first two enemy units — which is precisely what the previous
pass recorded ("destroyed at 8.3 min on all five seeds, killed by two enemy swarmlings"). **Two swarmlings kill a
refinery because the AI has no army, not because the site is indefensible.**

## 5. The order of work this forces

1. **Fix production starvation first.** Otherwise every expansion measurement is a measurement of an AI with one unit.
2. **Then** re-apply the eight expansion causes.
3. **Then** the garrison, which is the previous pass's recommendation and remains the right way to hold a forward site —
   but it can only be evaluated once there is an army to garrison with.

`README.md` records what each step measured.
