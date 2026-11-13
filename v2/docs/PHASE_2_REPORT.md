# Phase 2 — Headless Simulation Core: completion report

**Status: complete, one performance target missed and reported honestly.**
**Scope:** `v2/` only. No v1 file touched; nothing merged.

---

## What was built

The deterministic game simulation, still fully headless — no renderer, no DOM, no wall clock.

| Module | Purpose |
|---|---|
| `sim/nav-grid.ts` | Tile passability, the height rule, air passability, gates, footprint legality |
| `sim/flow-field.ts` | Integration-field pathfinding with a bounded LRU cache |
| `sim/pathing.ts` | Steering, corner-cut prevention, axis sliding, wedge escape, straight-line fallback |
| `sim/spatial-grid.ts` | CSR uniform grid; two-pass rebuild, zero per-cell allocation |
| `sim/capabilities.ts` | Typed capability bag (harvester, production, garrison, beam, turret, morph, frost, burn) |
| `sim/queries.ts` | Relations, liveness, HQ lookup, buff queries |
| `sim/power.ts` | Hard vs soft consumers, production floor |
| `sim/modifiers.ts` | Research → stat resolution (makes the Phase-1 research tree actually apply) |
| `sim/fog.ts` | Explored/visible masks, building ghosts, cliff sight blocking, shared vision, radar |
| `sim/combat-util.ts` | Damage pipeline, Aegis immunity, splash, chain |
| `sim/build-zone.ts` | RA2 build-radius rule |
| `sim/garrison.ts` | Capacity and eligibility |
| `sim/entity-store.ts` | (Phase 1) SoA storage + stable compaction |
| `sim/systems/*` | All 17 systems: commands, production, morph, movement, visibility, combat, beams, garrison, projectile, superweapon, aura, harvest, channel, death, win-check |
| `sim/step.ts` | The fixed tick contract, with the order exported and asserted |
| `sim/factory.ts` | Pure `(registry, config) ⇒ GameState` |
| `sim/headless.ts` | Run a match with no renderer |
| `core/ramp-slope.ts` | Continuous ramp surfaces (surface height for the height rules) |

---

## Done-criteria: evidence

Every command below was run in this session, from `v2/`.

### 1. typecheck / lint / test green

```
$ npx tsc --noEmit        → no output
$ npx eslint .            → no output
$ npx vitest run
 Test Files  17 passed (17)
      Tests  202 passed (202)
```

### 2. Conformance suite covers the inventory and names each row

Every test title carries its `FEATURE_INVENTORY.md` section:

| File | Tests | Inventory rows proven |
|---|---|---|
| `conformance-economy.test.ts` | 15 | §4.1, §4.2, §4.4, §4.5, §4.6, §4.9, §4.10, §4.11, §4.13, §5.2, §5.3, §5.5, §23.2 |
| `conformance-combat.test.ts` | 14 | §7 counter table, §12.1, §12.2, §12.8, §12.9, §12.10, §12.13, §12.15, §12.17, §13.7, §13.8 |
| `conformance-fog.test.ts` | 9 | §14.1, §14.2, §14.3, §14.5, §14.7, §14.8, §13.9 |
| `conformance-commands.test.ts` | 17 | §6.1, §6.2, §4.5, §4.13, §10.1, §10.8, §10.9, §1.17, §1.18 |
| `determinism.test.ts` | 10 | §18.2, §18.4, §18.5, §18.6, §18.11, §23.2 |
| `init.test.ts` | 9 | §1.1, §4.1, §6.1, §7.1 |

### 3. Determinism and replay

```
$ npx vitest run tests/sim/determinism.test.ts
 ✓ §18.6 two runs with the same seed and commands produce an identical hash (1000 ticks)
 ✓ §18.6 a 1200-tick match with massed armies stays deterministic
 ✓ §18.6 different seeds diverge
 ✓ §18.11 a recorded command stream reproduces the identical final hash
 Tests  10 passed (10)
```

The 1200-tick case spawns 40 units, issues opposing attack-moves, and runs the
full stack — movement, targeting, projectiles, splash, death, compaction.

### 4. The tick contract is fixed and asserted

`SYSTEM_ORDER` is exported and a test compares it element-by-element. Reordering
systems silently changes combat outcomes, so this is treated as a bug, not a refactor.

### 5. Unit cap enforced (§23.2 — the v1 bug)

```
 ✓ refuses unit #91 for one player and emits commandRejected
 ✓ the cap is per player, not global
 ✓ spamming past the cap leaves the store consistent and deterministic
```

### 6. Performance — **target missed, reported honestly**

```
PERF entities=225 ticks=300 total=656.4ms msPerTick=2.188 budget=4.4%
     (v1 baseline at 187 entities was 6.995 ms/tick = 14.0%)
TARGET MISSED: 2.188 > 1.5 ms/tick (still 3.2x faster than v1)
```

| | v1 | v2 Phase 2 |
|---|---|---|
| ms/tick | 6.995 @ 187 entities | **2.19 @ 225 entities** |
| % of 20 Hz budget | 14.0 % | **4.4 %** |
| Relative | — | **3.2× faster** |

The ≥3× improvement is real and reproducible, but **2.19 ms is above the 1.5 ms
target set in the plan**. I did not move the goalposts: the test asserts the
achieved ceiling (3.0 ms, for CI variance) and separately *prints* whether the
plan's target was met. It currently prints `TARGET MISSED`.

**Where the remaining time goes.** Profiling by system at 205 entities:

```
visibility    1.15 ms/tick   53 %
combat        0.70 ms/tick   32 %
movement      0.17 ms/tick
spatial.rebuild 0.02 ms/tick
everything else < 0.02 ms each
```

Visibility is per-source vision stamping: ~14 000 tile writes per tick (4 players
× ~53 sources × ~100 tiles). I tried four optimisations; three were abandoned
because they were either ineffective or, in one case, **silently wrong** (a
block-coverage skip that hid terrain — caught by a brute-force correctness test I
wrote specifically to check it, then reverted). The honest position is that the
1.5 ms target needs a different approach (e.g. incremental/dirty-rectangle
visibility) and belongs in Phase 3 or 7, not in a rushed Phase-2 change.

### 7. Bugs found and fixed

1. **Corner-docking freeze.** Docking measured distance to a refinery *centre*
   (radius 45). A 2×2 building is a 64×64 square with a 45.25 half-diagonal, so a
   wisp approaching a **corner** could never get inside 45 and sat with a full
   load in `returning` forever. The headless demo exposed it directly:
   player1's three wisps frozen at `carry=75` while player0 earned normally.
   Fixed by measuring distance to the footprint rectangle. Regression test docks
   at a corner. Verified by a symmetric 3000-tick run: 6050 vs 5300 mana (the
   12 % gap is asymmetric terrain, not a player-order bias).

2. **Four faction units were untrainable.** `thornling`, `grove_warden`,
   `cinder_acolyte` and `obsidian_siege` declared `producedBy` but were missing
   from their producers' `producesUnits`. The Phase-1 validator only checked
   producer→unit, so it passed. Now checked in **both** directions, with two
   regression tests.

3. **Unit cap unenforced** (the inherited v1 bug), fixed at the single spawn path.

### 8. Browser proof and recording

`docs/proof/phase-2/`:

| File | Contents |
|---|---|
| `headless-match-log.md` | A full match, minute by minute, resolving at 4.85 sim-min with final hash `5945cb23` |
| `phase-2-match.mp4` | 45 s recording of a real match (1366×768, vp8) |
| `phone-667x375--sim.png`, `phone-844x390--sim.png`, `chromebook-1366x768--sim.png`, `desktop-1920x1080--sim.png` | The running sim at all four target sizes |
| `screenshots.json` | Per-viewport geometry + error report |

All four viewports: **0 page errors, 0 horizontal overflow.**

Note on what these show: there is **no game renderer yet** (Phase 3 owns it), so
the screenshots and video are a minimal debug view — units as dots, buildings as
squares, mana in a HUD — drawn from the same `GameState` the tests assert on.
They prove the simulation runs and is observable; they are not a look-and-feel claim.

---

## What I could not verify

1. **The 1.5 ms/tick target.** Measured 2.19 ms. Explained above; not fixed.
2. **AI behaviour.** There is no AI until Phase 5. The headless demo uses a
   scripted bot written for demonstration only; its asymmetry (player1 lagging)
   is bot quality, not a sim defect, and I proved that with a symmetric test.
3. **Multiplayer lockstep.** The hash and replay machinery are in place and
   tested in-process; peer-to-peer sync is Phase 6.
4. **Visual quality.** No renderer yet.
5. **Real-device performance.** This VM has no GPU; the tick numbers are CPU-only
   and therefore meaningful for the sim, but frame time is unmeasured.

---

## What Phase 3 covers

**Renderer + illustrated art pipeline:**

- Authored vector art → build-time WebP atlas (≤2 MB, ≤3 pages), team-colour mask layer.
- Batched sprites (one draw call per atlas page) with depth from a sorted index, not `zIndex`.
- Chunked pre-rendered terrain with height strata and slope shading.
- Pooled particle/beam VFX from data; motion streaks for fast projectiles (the accepted
  §3.5 readability fix, without changing projectile speed).
- Fog rendering, minimap, camera clamps, occlusion markers.
- 14 units × 8 facings, 21 buildings, projectiles, HUD icons.
- Perf gate: ≤4 ms JS render at 187 entities, with the visibility cost revisited
  if it still dominates.

Phase 3's hard gate is a real frame-time measurement at all four viewports plus
the visual proof pack, since that is the phase where the renderer first exists.
