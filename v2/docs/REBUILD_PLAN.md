# Arcane Dominion v2 — Rebuild Plan

Phase-0 design document. Companion to [`FEATURE_INVENTORY.md`](./FEATURE_INVENTORY.md), which is the
acceptance contract; this document is *how* we satisfy it.

Written from a source-level audit of `main` @ `8786665` plus headless measurements (all numbers in
this document were produced by running the v1 simulation, not estimated). v2 lives entirely in
`v2/` on branch `rebuild/v2`; nothing in the v1 tree changes.

---

## 1. Goals and non-goals

### Goals

1. **Same game, properly built.** Same rules, same content, same modes — every feature in the
   inventory present and tested, but every system reviewed, corrected and redesigned rather than
   ported.
2. **Look and feel dramatically better** on all three target devices (school Chromebook, phone in
   landscape, desktop).
3. **Run much better.** Hard, measured budgets on weak hardware, enforced in CI.
4. **AI opponents that are actually opponents** — fair, legible, difficulty-distinct, and worth
   replaying.
5. **Nothing lost.** Every unit, building, spell, screen, setting, dev tool and multiplayer
   behaviour survives, with a test.

### Non-goals (explicit, so nobody drifts)

| Not doing | Why |
|---|---|
| Server-authoritative simulation | Lockstep works, is cheap, and keeps the game hostable on one Railway box. |
| Rollback / input prediction | 6-tick input delay (~300 ms) is acceptable for an RTS; rollback is a large correctness risk for a solo dev. |
| ECS framework or physics engine | Deterministic ordered systems with a flat entity store are simpler to reason about, hash and replay than an archetype ECS. We fix the *cost* of the store (typed arrays, §3.4) without adopting the *model*. |
| A second faction | Content parity first; the data schema is designed so a faction can be added later without a rewrite. |
| Native app / app-store build | The PWA is the product; it works on managed Chromebooks with no install rights. |
| 3D engine | 2.5D dimetric is the identity of the game and is far cheaper on weak GPUs. |

---

## 2. Principles

1. **Determinism is a feature, not an invariant we hope for.** Every rule is a pure function of
   `(state, command, tick)`. Any new rule must ship with a hash test.
2. **The simulation never knows about pixels.** `v2/src/sim/**` imports only `v2/src/core/**` and
   `v2/src/data/types`. Enforced by lint, plus an import-graph test (§3.2).
3. **The renderer never mutates.** It reads a display snapshot. If the renderer needs a fact, the
   sim publishes it — never recompute gameplay logic twice.
4. **Fair AI.** The AI sees exactly what its own fog allows. Difficulty changes *judgement*, not
   *information*.
5. **Measure, then optimise.** Every perf claim in this document has a number attached and a budget
   test that fails CI when regressed.
6. **Data over code for content, code over data for rules.** A unit is JSON; a combat rule is a
   system. Don't put `if (defId === 'frost_spire')` in a system.
7. **Small surfaces.** Fewer, better-named modules than v1's 212 files; no module above ~400 lines
   without a reason.
8. **Teach in the match, not in a manual.** The coach, the HUD copy, and the inspect cards carry the
   rules.

---

## 3. Architecture

### 3.1 Layout

```
v2/
  index.html
  package.json  vite.config.ts  tsconfig.json  eslint.config.js
  vitest.config.ts  playwright.config.ts
  data/                          # content JSON (schema v2), same authoring model as v1
    units/ buildings/ spells/ projectiles/ maps/ match/ factions/ ai/ balance.json
  docs/
    FEATURE_INVENTORY.md  REBUILD_PLAN.md  ARCHITECTURE.md  DETERMINISM.md  DATA_SCHEMA.md
  src/
    core/          # zero-dependency primitives; safe for the sim to import
      constants.ts       # tick rate, tile size, caps, budgets
      fixed.ts           # deterministic math: fixed-point helpers, LUT sin/cos/atan2
      projection.ts      # the ONLY world<->screen mapping (dimetric)
      rng.ts             # xoshiro128** seeded stream, per-purpose sub-streams
      vec.ts             # allocation-free vector helpers
      clock.ts           # fixed-step accumulator (main thread only)
    data/          # loading + validation + registry
      schema.ts          # Zod schema v2
      registry.ts        # typed lookups, frozen
      loader.ts          # import.meta.glob + overlays + loud failure
      validate.ts        # cross-reference + reachability + balance sanity
    sim/           # THE PURE CORE. May import core/*, data/types only.
      state.ts           # GameState shape (plain data, serializable)
      commands.ts        # command union (plain data)
      events.ts          # event union
      step.ts            # the frozen system order
      queries.ts         # allocation-free read helpers, dense iteration
      store.ts           # entity storage: dense array + free list + dirty-sorted id view
      spatial.ts         # uniform grid, rebuilt incrementally
      nav/               # grid, passability, heights, region graph
      path/              # hierarchical flow field + local steering + separation
      systems/           # one file per system, in step order
      combat/            # damage model, targeting, projectiles, beams, statuses
      economy/           # harvesting, production queues, power, repair
      ai/                # deterministic opponents (see §4)
      hash.ts            # stable digest of every gameplay field
      serialize.ts       # save/snapshot pack + unpack, versioned with migrations
    match/         # orchestration around the sim
      runner.ts          # owns sim (worker or inline), enforces the clock
      worker.ts  worker-protocol.ts
      display.ts         # per-tick display snapshot produced by the sim worker
      interpolation.ts   # render-side lerp between snapshots
      session.ts         # view-only session state (selection, mode, ghosts)
    render/
      app.ts  camera.ts  quality.ts
      terrain/  sprites/  fog/  vfx/  overlay/
    ui/
      tokens.css  primitives/  hud/  screens/  coach/  gallery/  sandbox/
    input/
      gesture.ts  intents.ts  bindings.ts  controller.ts
    net/
      protocol.ts  protocol-schema.ts  lockstep.ts  transport.ts  lobby.ts
    audio/
    storage/
    app/           # boot, router, match wiring
```

**~110 files instead of 196, with the same capability set.** The reduction comes from deleting dead
abstractions (see §8 "things v1 has that v2 will not carry over"), not from cramming.

### 3.2 Layer rules (enforced by tests, not just lint)

```
core  ←  data  ←  sim  ←  match  ←  render / ui / input / audio / net / storage
                                  ↑
                             app (wires everything)
```

- `sim` may import `core`, `data/types` (types only), and `sim`.
- `render`, `ui`, `input` may import `sim` **only** through `sim/queries` + `sim/state` types.
- `net` may import `sim/commands` and `sim/hash` (plain functions).
- Nothing imports `app`.

Test: `v2/tests/architecture/layers.test.ts` walks the import graph with a regex AST scan (no new
dependency) and fails on any violation. This is stricter than v1's `no-restricted-imports` because it
also catches *transitive* leaks.

### 3.3 The tick contract

```
TICK_HZ = 20   (TICK_MS = 50)
```

System order is frozen and documented. v2 order:

| # | System | Responsibility |
|---|---|---|
| 1 | `commands` | Apply validated commands from the tick's ordered list |
| 2 | `ai` | Emit commands for the *next* tick (never mutates state directly) |
| 3 | `morph` | Deploy/pack progress, swaps |
| 4 | `production` | Construction, unit/research queues, repair, cooldowns, buff expiry |
| 5 | `movement` | Pathing, steering, separation, arrival |
| 6 | `visibility` | Fog masks, known-building snapshots |
| 7 | `targeting` | Acquire/lose targets, turret rotation, charge-ups |
| 8 | `combat` | Fire resolution (instant, projectile spawn, chain, splash) |
| 9 | `projectiles` | Advance + impact |
| 10 | `beams` | Continuous beam damage (+ burn linger, frost exposure) |
| 11 | `superweapon` | Beam steer/advance/damage |
| 12 | `auras` | Healing |
| 13 | `harvest` | Siphon, return, deposit |
| 14 | `channel` | Mana Weaver conjuring |
| 15 | `death` | Remove dead, eject garrisons, free nav |
| 16 | `win` | Elimination, match end |

Split from v1: `targeting` is separated from `combat` so target acquisition is unit-testable in
isolation and so "who is aiming at what" is a first-class, hashable state (v1 buries it in
`cooldowns`/`facing`).

### 3.4 State shape

`GameState` stays a plain, structured-cloneable tree — that is what makes lockstep, saves, and
snapshots cheap. Two changes from v1:

1. **`entities` is a dense array + free list**, not a `Map`. Deterministic iteration for free, no
   sort per query, cache-friendly.
2. **Every system-mutated collection is ordered by construction.** No `Set`/`Map` iteration order
   ever affects gameplay.

```ts
interface GameState {
  rulesVersion: number;          // bump on any rule change; invalidates golden replays
  tick: number;
  seed: number;
  rng: RngState;                 // 4×u32, per-purpose sub-streams
  players: Player[];             // fixed order, index = player index
  relations: Uint8Array;         // n×n, ally/enemy
  world: WorldState;             // entities + spatial index + nav version
  beams: Beam[];
  ai: AiMemory[];                // one per player slot, hashed, see §4
  outcome: { ended: boolean; winnerTeam: number | null };
}
```

Per-entity hot fields live in typed arrays inside `WorldState`:

```ts
interface WorldState {
  count: number;
  alive: Uint8Array;             // 1 alive, 0 free slot
  kind: Uint8Array;              // unit | building | node | projectile
  defIndex: Uint16Array;         // index into the registry's stable def table
  owner: Uint8Array;             // player index, 255 = neutral
  posX: Float64Array;            // world units
  posY: Float64Array;
  velX: Float64Array;  velY: Float64Array;
  hp: Float32Array;    maxHp: Float32Array;
  radius: Float32Array; facing: Float32Array;
  cooldown: Float32Array;
  flags: Uint32Array;            // garrisoned, channeling, morphing, repairing, ...
  queue: Map<EntityId, QueueItem[]>;   // cold data, rarely touched
  caps: Map<EntityId, Capability>;     // cold data
}
```

Why typed arrays: the hot loops (movement, targeting, projectile advance, fog) touch position, HP and
radius for *every* entity every tick. With a fat object, each of those is a pointer chase. With typed
arrays the same loop is a linear scan over contiguous memory. At 400 entities the difference is
measurable in milliseconds, which is exactly our budget.

Cold, rarely-touched per-entity data (production queues, garrison lists, morph state, beam runtime)
stays in plain objects keyed by id — that keeps the hot struct small and the code readable.

**This is not an ECS.** Entities are still identified by a stable integer and systems are still
ordered functions. There is no archetype, no world query DSL, no component registry.

### 3.5 Threading and the display channel

v1's worker protocol is the weakest part of its architecture: it runs the full sim in a worker, then
`JSON.stringify`s every entity *every tick* to decide what changed, ships those, and the main thread
rebuilds and re-applies a full state anyway (PERF-05). It also has to keep a mutable mirror in sync,
which is the source of the "frozen units while fog updates" class of bug.

v2 splits the worker protocol into **two independent channels**:

| Channel | Frequency | Payload | Consumer |
|---|---|---|---|
| **Display** | every tick | Per-entity render delta: `id, x, y, facing, hpFrac, flags, buildFrac` as typed arrays; plus the visible-tile bitmask and the minimap entity list | Renderer, minimap, HUD numbers |
| **Authoritative** | on demand | Full packed state (save, snapshot, hash, desync report) | Storage, lockstep, save |

Benefits:

- The renderer gets exactly the fields it draws — nothing more. Payload is ~24 bytes/entity instead of
  a JSON object.
- No mirror state, so no mirror bugs. The main thread has a display buffer, a *read-only model* of the
  world for input picking (the sim ships a compact pick model: id, kind, owner, pos, radius), and the
  last authoritative state if it happens to have one.
- Picking happens on the main thread against the pick model with zero round-trips.

For **lockstep**, the worker receives confirmed tick command batches and returns display deltas per
tick plus checksums on a cadence — the same channel, so solo and online share one code path.

### 3.6 Determinism model

v1's determinism is good (hash surface, id-ordered iteration, ESLint guard, 433 tests) but has three
real holes:

| Hole | Consequence | v2 fix |
|---|---|---|
| `Math.atan2 / sin / cos / pow / hypot` are used in gameplay code | JS does not specify these to the last bit; two engines can diverge. Works today because every peer is V8 — breaks the day someone plays in Firefox or Safari | `core/fixed.ts`: `atan2` from a precomputed octant table + rational approximation; `sin`/`cos` from a 4096-entry LUT with linear interpolation; `sqrt` only (IEEE-exact); **no** `pow` (use repeated multiply or a table). Lint bans the transcendentals in `sim/`. |
| The seeded RNG exists but is never advanced (BUG-09) | All "random" AI play is a hash of the tick — identical every seed | One `RngState` with named sub-streams (`combat`, `ai:i`, `map`), each a 128-bit xoshiro state; AI draws never perturb combat draws |
| No `rulesVersion` | A rule change silently invalidates every stored replay and save with no diagnostic | `rulesVersion` in state and in every replay header; mismatch is a loud, explained failure |

Plus, carried over from v1's good practice: id-ordered mutation, no wall-clock, no DOM, hash over every
gameplay field, and the ESLint guard — now with the transcendental ban added.

### 3.7 Data schema v2

Same authoring model (JSON in `data/`, Zod-validated at load, loud failure with file + field), with
these structural changes:

- **`schemaVersion`** at the root of every file; the loader upgrades or rejects.
- **`art` v2 block**: `{ model, scale, palette, teamMask, emissive, anim? }` where `model` names a
  procedural part graph (see §5.2). Sprites are still generated, never committed as binaries.
- **`weapon` v2**: separate `impact` (instant / projectile / beam / chain / artillery) from
  `damage` (amount, vs-armor, splash, statuses). v1 overloads one object with 12 optional fields and
  the systems have to re-derive which shape it is.
- **`requires` becomes `requiresAny` + `requiresAll`** so a future faction can express alternatives.
  For v1 parity `requiresAll` carries today's behaviour.
- **`balance.json` gains named groups** (`economy`, `combat`, `power`, `ai`, `caps`) and every value
  is a *rule parameter*, not a magic number in a system.
- **`caps`**: `unitsPerPlayer`, `queuePerBuilding`, `sitesPerDefId` — declared and *enforced* this time.

Registry is frozen after load; a dev-only "hot reload data" is available in the sandbox.

---

## 4. AI redesign

This is the largest single change. v1's AI is not "weak" — it is **broken and unfair**, in ways that
are precisely diagnosable:

| v1 defect | Evidence |
|---|---|
| Its economy collapses within ~4 minutes and never recovers | Two 20-minute soaks sampled every minute. Hard/Hard (seed 5): both AIs hold at exactly **4 buildings** — Sanctum, Attunement Spire, Ley Conduit, Summoning Circle — from minute 5 to 20, with mana stuck at **10** and **35**. Normal/Normal (seed 11): one AI stays at those same 4, the other *loses* its Spire and Circle and sits on just its Sanctum for the last 9 minutes. **Neither soak ever produced a Golem Forge, an Arcane Nexus, or an expansion.** |
| Root cause: its own units get permanently stuck | At minute 5 of the Hard/Hard soak, one AI had **zero wisps left** and the other had **four, all** `state=moving` with an unresolved `orders=[{move, 3632, 2352}]` — the centre of its own Sanctum, where a unit can never stand (BUG-01). `assignHarvesters` skips any unit that already has an order, so a stuck wisp is never rescued and the economy never restarts. Both AIs then sit on 4 buildings and 10–35 mana for the rest of the match |
| It is byte-identical on every seed | 6 seeds → same winner, same tick (6.2 min), same peak armies (22/7) |
| Hard difficulty is clairvoyant | `pickAttackObjective` falls back to `findEnemySanctum()`, which scans *all* entities regardless of fog; `densestEnemyCluster(requireVisible=false)` does the same. Hard literally attacks your base through the fog |
| It re-decides everything from scratch every pass | No persistent squads or objectives, so an army re-targets mid-march and dribbles in |

### 4.1 Design goals

1. **Fair.** Reads only its own fog. No resource bonus, no build-speed bonus, no free vision, no
   knowledge of units it has never seen.
2. **Deterministic.** Fully reproducible from `(seed, command history)`. Different seeds produce
   genuinely different matches.
3. **Legible.** A human can look at what it does and explain it ("it's massing", "it's taking the
   plateau", "it's raiding my workers"). Telegraphing beats raw difficulty for fun.
4. **Cheap.** ≤ 0.5 ms/decision-pass for 4 AI players at 200 entities.
5. **Distinct at each difficulty.** Not "easy is the same AI with a longer timer".

### 4.2 Architecture

```
AiMemory (per player, inside GameState, hashed)
  strategyId          fixed at match start
  phase               open | grow | pressure | finish
  nextThinkTick
  sightings[]         { entityId, defIndex, x, y, tick, hpFrac, kind }   // fog-honest memory
  regionsSeen         bitset over the nav region graph
  squads[]            { id, role, members[], objective, issuedTick }
  buildPlan[]         { defId, priority, reason }   // recomputed on think, not every tick
  econPlan            { nodeId -> desiredWisps, repairList[] }
  threat              { x, y, strength, tick } | null
  reserves            { mana, powerHeadroom }
  stats               counters for the debug overlay and for tests
```

`AiMemory` being *in* `GameState` is the single most important structural change. It makes the AI:

- **deterministic** (it is hashed and replayed like anything else),
- **cheap** (no re-deriving the world every pass),
- **stable** (squads and objectives persist),
- **testable** (a test can assert "after 60 s the Hard AI has a squad with role=harass of size ≥ 2"),
- **debuggable** (the sandbox overlay shows the same memory the AI uses).

### 4.3 Think loop

- Every **10 ticks (500 ms)** — the same for all difficulties. Uniform cadence keeps the AI's reaction
  profile predictable and makes difficulty a *quality* difference.
- Sub-phases run in a fixed order, each writing into `AiMemory` or emitting commands:
  `observe → econ → build → produce → military → spells`.
- **Commands are emitted only when the plan changes** (objective changed, unit idle, new build) — not
  re-issued every pass. This is what stops the v1 "re-target everything every 750 ms" jitter.

### 4.4 Subsystem design

**a) Observe.** Fold newly visible enemies into `sightings` (cap 64, evict oldest). Mark regions seen.
Never read a hidden entity. `findEnemyHq` is deleted; the AI attacks `sightings` or the *last known*
base location with a staleness timestamp.

**b) Economy.** Per-node saturation model:

```
desiredWisps(node) = clamp(round(node.reserve / reservePerWisp), 1, 4)
                     adjusted by travel time to the nearest refinery
```

Idle wisp → node minimising `travelTicks + queuePenalty(assigned, desired)`. Wisps on a depleted or
contested node are redirected. Worker threats pull wisps to the *nearest refinery*, not a blocked tile.
Repair list ordered by (def importance × damage), capped by a mana reserve.

*Explicitly fixes BUG-01/BUG-03:* the AI never issues a move order into a building footprint, and any
wisp idle for > 40 ticks is re-tasked (a watchdog the human player also benefits from, see RULE-02).

**c) Build planner.** Not a fixed list. Maintain `desiredCounts` per phase:

| Phase | Enter when | Wants |
|---|---|---|
| `open` | always | 1 refinery, 1 conduit, 1 factory, 1 extra wisp producer |
| `grow` | 8 army units or 3 min | +1 factory, vault, radar, 1–2 defense ring, forge |
| `pressure` | army ≥ 40 % of target | +2nd factory, nexus, advanced defenses |
| `finish` | enemy base located and army ≥ 70 % | superweapon, siege, second expansion, all-in |

Each pass: pick the highest-priority unmet want that is affordable *and* keeps the reserve; find a
legal spot with the **same placement validator the player uses**; score candidate spots by
(refinery proximity, path-choke coverage, not blocking own pathing, distance to enemy approach); place
one building per pass so mana is not dumped into six half-built structures.

**d) Production planner.** Composition is a target vector, not a rotation:

```
target = base[phase]                       // e.g. { light: 0.4, ranged: 0.35, heavy: 0.25 }
       × enemyCompositionAdjustment        // observed ≥40 % heavy → +caster/siege; ≥30 % air → +archer/skimmer
```

Queue up to `caps.queuePerBuilding`, keep a mana reserve for the next build goal, and stop producing
when at `caps.unitsPerPlayer`.

**e) Military planner — squads.** This is what makes Hard feel like an opponent.

| Squad | Size | Behaviour |
|---|---|---|
| `main` | most of the army | Rallies at a staging point 200–300 units from base, pushes one objective when strength ≥ threshold, retreats when strength < 60 % of the enemy sighted |
| `harass` | 2–4 fast/air | Targets sightings of workers/refineries, never engages the main army, retreats at 50 % HP, re-tasked after 20 s |
| `home` | 2–4 + garrisoned | Holds a guard point, responds to `threat` after the reaction delay, returns home when clear |
| `siege` | behemoths | Attacks defenses first, screened by `main`, never leads |
| `scout` | 1 fast | Visits unseen regions; joins `harass` in `finish` |

Squad orders persist. A squad is re-tasked only when its objective dies, it goes idle, or a
higher-priority threat appears. Multi-pronged attacks are **timed**: the `finish` phase staggers launch
times so three lanes hit within ~2 s, instead of arriving 40 s apart (v1's FEEL-02).

**f) Spells and superweapon.** Value-based, not "cast if off cooldown":

```
meteorValue    = Σ expectedDamage(units in radius)        → cast if ≥ 1.5× the mana-equivalent
aegisValue     = Σ hp of units under fire                  → cast if army is engaged and ≥ 4 units
blinkValue     = distance saved × unit value               → cast on siege that is 1 screen away
lanceValue     = enemy value along the beam's projected path, sampled every 8 ticks
```

Hard aims the Lance at clusters and steers it through the enemy base; Normal aims at the base; Easy
does not build it.

### 4.5 Difficulty ladder (fair, and legible)

| Knob | Easy (Recruit) | Normal (Veteran) | Hard (Warlord) |
|---|---|---|---|
| Reaction delay to a threat | 60 ticks (3 s) | 24 ticks (1.2 s) | 8 ticks (0.4 s) |
| Build reserve discipline | spends to 0, restarts goals | keeps 1 build in reserve | keeps 1 build + 1 unit in reserve |
| Composition adaptivity | fixed rotation | type-level (air/heavy) | full target-vector |
| Micro | none | focus fire | focus fire + kiting + retreat at 45 % |
| Scouting | none (probes start corners) | 1 scout from `grow` | 1 scout from `open` + harass intel |
| Attack axes | 1, unsynchronised | 2, semi-synchronised | 3, synchronised |
| Expansion | none | 1 camp | 2 camps + guard |
| Spells | none | Meteor | all three |
| Superweapon | no | yes, at `finish` | yes, aimed at clusters |
| Wave discipline | dribbles 1–2 units | 1 wave / 60 s | coordinated waves, holds for strength |
| Economy management | saturates one node | saturation model | saturation + repair + power headroom |

**No resource handicap, no vision cheat, no build-speed cheat on any level.** Easy is easy because it
plays badly (slow reactions, no spells, no adaptivity), not because the player was given a hidden
bonus. If playtests show Easy is still too hard, the fix is a *Cadet* modifier that cuts AI income
15 % and is **shown in the lobby** — never silent.

### 4.6 Fairness rules (testable)

`v2/tests/ai/fairness.test.ts` asserts, over a 10-minute AI-vs-AI match:

1. Every `attack` command the AI issues targets an entity that is in that player's `visible` mask, or
   is a `sighting` recorded while it was visible.
2. No AI command references an entity id that has never been visible to that player (dev commands
   excluded).
3. AI players receive exactly `balance.startingMana` and the same siphon rate as a human.
4. AI build times equal human build times (same `productionRate` path).
5. Swapping a human seat for an AI seat at tick *t* produces a hash-equal state at tick *t* + 1
   (proves no hidden AI-only state leaks into the world).

### 4.7 Determinism

- All AI draws come from `rng.sub('ai:' + playerIndex)`.
- `AiMemory` is hashed in `hashState`.
- Two runs of the same seed produce byte-identical matches; **different seeds must produce different
  matches** — asserted by a test that runs 8 seeds and requires ≥ 6 distinct (winner, duration) pairs.

### 4.8 Cost

Target ≤ 0.5 ms per think pass with 4 AI players at 200 entities (v1 measured ~3× the whole
no-AI tick at 454 entities). Achieved by: thinking every 10 ticks instead of every 10/15/20 per
player, keeping memory instead of re-scanning, and using the same spatial grid as combat instead of
`entitiesSorted` scans.

---

## 5. Visual upgrade direction

Art direction: **"Obsidian and aurora."** Deep indigo ground, teal mana, warm gold power, violet
arcane, aurora-green and ember-orange for the two extreme factions of VFX. Silhouettes read at 1×
zoom on a 1366×768 screen; colour never carries meaning alone.

### 5.1 The problem with v1's look

v1 draws every entity as a procedural "voxel box" from `art.shape` + an accent glyph. It is
surprisingly coherent, but:

- flat shading, no light direction, so buildings read as stickers rather than objects;
- one rim colour, so a building at 0.4 zoom is a coloured blob;
- the ground is a single flat `Graphics` of 11 264 quads with two-tone checkerboard and no material
  variation, so the battlefield has no texture or depth cue;
- VFX are additive circles and lines — readable, but they don't sell impact;
- the HUD is functional but visually unowned: default system font, flat panels, inconsistent spacing.

### 5.2 Sprites: procedural models, baked once

Keep the "no committed binary art" property (it is genuinely useful: reviewable diffs, no asset
pipeline, no licence risk) but replace the single extruded polygon with a **part-graph model**:

```json
"art": {
  "model": "sanctum",
  "scale": 1.0,
  "palette": { "stone": "#3a3550", "metal": "#8b7fb8", "glow": "#c9b8ff" },
  "teamMask": ["banner", "trim"],
  "emissive": ["glow"],
  "anim": { "idle": "spin:crystal@0.2", "work": "pulse:glow@1.0" }
}
```

A model is a list of boxes/prisms/cylinders with per-part materials. The bake step (once, at load):

1. Project each part into the dimetric view with correct depth order.
2. Shade per face from a fixed sun direction (`-0.6, -0.8, 0.5`) with a 3-band ramp — hard, stylised,
   readable at small sizes.
3. Add ambient occlusion between parts (a cheap per-vertex darkening from overlap).
4. Add a 1 px rim light on the team-facing edge.
5. Tint team-masked parts by the player colour, keeping luminance.
6. Emissive parts get a bloom-able additive pass.

Bake **8 facings × 4 team colours + 1 neutral** per entity into two atlases. Cost: ~15 ms on first load
for all 29 defs on a Chromebook; cached to IndexedDB (`arcane:v2:atlas@<hash>`) so later loads are ~2 ms.

This is a genuine upgrade (lighting, AO, rim, emissive, real depth) with no binary assets, and it keeps
team-colour swapping instant.

### 5.3 Terrain

- **Chunked static geometry.** Terrain is baked into 16×16-tile textures, up to 8 chunks in view, each
  one draw. Kills PERF-09 (11 264 quads per frame).
- **Three material bands** (grass / rock / blight) chosen by a cheap noise function seeded from the map,
  with blending at band edges — the ground stops being a checkerboard.
- **Decals**: rubble, rune circles, path wear along the two most-travelled corridors between bases
  (computed once at map load from the region graph).
- **Cliffs** get strata (3 horizontal bands), a darker base AO gradient, and grass overhang on the top
  edge — the single biggest "this looks like RA2" win.
- **Ramps** get a proper slope with visible treads and side walls.
- **Mana nodes**: crystal cluster with a pulsing inner glow, reserve shown by *filled crystal height*
  (not just a ring), plus a world-space label only when in sight.
- **Ambient**: slow-moving cloud shadows (one scrolling texture, one draw), and drifting motes near
  mana nodes (batched particles, low density).

### 5.4 Fog of war

Rendered into a **single low-resolution RenderTexture** (1 texel per 2×2 tiles), upsampled with a
1-px blur, drawn as one quad. Unexplored = near-black with a faint blue tint; explored-but-not-visible
= 45 % veil with a cool cast. This replaces up to hundreds of `Graphics` fills per frame (PERF-10) with
one draw, and it looks better (soft edges instead of hard tile steps).

### 5.5 VFX and impact

- **One batched particle system** (single `ParticleContainer`, fixed 2 000-particle pool, additive and
  normal layers). v1's per-effect `Graphics` objects are replaced.
- **Impact feedback**: every projectile hit gets a 3-frame white flash *and* a short scale-punch on the
  target sprite (1.08 → 1.0 over 120 ms). This is cheap and is most of what "feels crunchy".
- **Death**: sprite shatters into 5–9 palette-matched shards that fall and fade (pooled), instead of a
  grey puff.
- **Build-up**: scaffolding silhouette grows with the construction bar, with a per-tick spark at the
  build front.
- **Selection**: a projected ellipse ring with a 2 px team-colour edge and an inner glow, plus a subtle
  ground pulse on the first selection.
- **Signature buildings keep and extend their current bespoke VFX** (Sentry crystals, Storm Conductor
  arcs, Celestial sky-strike, Sanctuary ward, Astral Spire star-cathedral) — those are v1's best work;
  v2 ports the *intent* and rewrites the implementation for batching.
- **Screen effects**: a 6-px radial shockwave on Celestial impact and a 1-frame 0.9× zoom punch on
  superweapon fire (with a `reduced motion` opt-out).

### 5.6 UI

A real design system, in `v2/src/ui/tokens.css`:

| Token group | Values |
|---|---|
| Spacing | 4 px base, scale 4/8/12/16/24/32 |
| Radius | 6 / 10 / 16 px |
| Type | 11 / 12 / 14 / 18 / 24 / 32 px; system display stack; tabular numerals for resources |
| Elevation | 3 levels (panel, floating, modal) with consistent border + inner highlight |
| Colour | semantic tokens (`--mana`, `--power`, `--danger`, `--ok`, `--team-N`) not raw hex |
| Motion | 120 / 200 / 320 ms, `cubic-bezier(.2,.8,.2,1)`, all disabled by `prefers-reduced-motion` |
| Touch | minimum 44×44 hit area, 8 px gutters, thumb-zone layout on phones |

Concrete improvements over v1:

- **Top bar** becomes a resource ribbon: mana with a fill meter against a soft cap, power as a bar with
  headroom/overdraw, spell chips with radial cooldowns.
- **Command card** becomes a two-column card with larger icons, cost badges, and a persistent
  "requirement chain" line (what this unlocks).
- **Selection** shows portraits (baked from the same atlas), a stance toggle, and a compact stat strip.
- **Compact-phone mode** is a genuinely different layout: bottom-left thumb cluster for build/train,
  bottom-right for commands, top ribbon only. Not a squeezed desktop layout.
- **Onboarding**: the coach becomes a 4-beat *live* lesson that highlights the actual control
  (§11 covers the content change).
- **Legibility**: 9 px labels become 11 px minimum; HP bars thicken with distance; team colours get
  distinct *shapes* on the minimap (square/triangle/diamond/circle) for colourblind safety.

---

## 6. Performance targets

### 6.1 Hardware envelope

| Class | Reference device | Render | Sim |
|---|---|---|---|
| **Low** (must work) | Celeron N4020 / 4 GB, Intel UHD 600, 1366×768, ChromeOS | 1366×768, DPR 1, no AA | 20 Hz |
| **Mid** | Any 2020+ Chromebook, iPad 9, mid Android, 1920×1080 | DPR ≤ 1.25 | 20 Hz |
| **High** | Desktop, discrete or modern iGPU | DPR ≤ 2 | 20 Hz |

### 6.2 Budgets (measured, CI-enforced)

| Metric | v1 measured (audit VM) | v2 target | Guard |
|---|---|---|---|
| Sim tick, 200 entities, p95 | 2.65 ms (2 players, 109 entities, no AI) | **≤ 2.0 ms** | `tests/perf/sim-budget.test.ts` |
| Sim tick, 400+ entities, p95 | 5.28 ms (8 players, 454 entities, **no** AI) and 14.96 ms (same, with AI) | **≤ 4.0 ms** with AI | same |
| AI think pass, 4 AI / 200 entities | not isolated; AI multiplies the whole tick cost ~2.8× at 8 players | **≤ 0.5 ms** | `tests/perf/ai-budget.test.ts` |
| Frame time, Low, 200 entities on screen | not measured; no cap | **≤ 25 ms p95 (40 fps)** | Playwright perf trace on the Low preset |
| Frame time, Mid | — | **≤ 16.7 ms p95 (60 fps)** | same |
| Input → visible response | — | **≤ 80 ms** | Playwright interaction timing |
| Cold start to interactive menu, Low | — | **≤ 2.5 s** | Lighthouse CI budget |
| Cold start, desktop | — | **≤ 1.2 s** | same |
| Main bundle (gz) | 230 KB | **≤ 180 KB** | `vite build` size assertion |
| Worker bundle (gz) | 52 KB | **≤ 45 KB** | same |
| Total initial transfer (gz) | ~282 KB (app + worker) | **≤ 260 KB** | same |
| Memory, 30-min match, Mid | — | **≤ 180 MB** | `performance.memory` in a Playwright soak |
| Flow-field construction share of tick | **25 %** | **≤ 5 %** | profiler test |

### 6.3 How each target is met

| Perf problem | Fix |
|---|---|
| PERF-01 `entitiesSorted` allocates per call (30 sites) | Dense array + a dirty-flagged sorted id view rebuilt once per tick. Allocation-free iteration. |
| PERF-02 full-map BFS per goal, 25 % of tick | **Hierarchical pathing**: precompute a region graph (flood-fill walkable areas into ~150 regions, connect by ramps/gates). Long paths = A* over the region graph (≈150 nodes, microseconds) → then a *local* flow field only within the 3×3 regions near the unit, at 1-tile resolution. Cache key = `(goalRegion, ownerBlockMaskVersion)`, LRU 32. |
| PERF-03 unbounded flow cache | LRU with a hard cap and a memory budget; eviction is deterministic (oldest insertion, tie-broken by key). |
| PERF-04 fog O(p×e×sight²) per tick | Sight stamping into a `Uint8Array` with a *dirty-rect* update: only re-stamp sources that moved or appeared; visibility recomputed only inside the changed AABB. Typically < 5 % of the map per tick. |
| PERF-05 JSON stringify per entity per tick | Display channel with typed arrays (§3.5). |
| PERF-06 5.28 ms/tick at 454 entities | Typed-array hot loops, spatial grid for all neighbour work (v1's `swarmScore` is O(n²) inside the target loop), and no per-candidate allocation. |
| PERF-07 HUD reconciles everything every frame | Dirty-flag HUD: each panel holds a `lastKey` string; DOM writes only on change. Numbers update on tick, not on frame. `content-visibility: auto` + CSS containment. |
| PERF-08 minimap hashes 11 264 tiles per frame | Update the minimap canvas only when the visibility mask version or entity positions change (checked with a cheap 64-bit sample), and only repaint the dirty rect. |
| PERF-09 terrain drawn in full every frame | Chunked static textures, culled per frame (§5.3). |
| PERF-10 fog redraws N polygons | Single textured quad (§5.4). |
| PERF-11 one 828 KB chunk, Pixi ships unused backends | Split: `pixi-core` (tree-shaken: `Application`, `Container`, `Sprite`, `Graphics`, `Text`, `RenderTexture`) + app + data. Drop the WebGPU and Canvas renderer imports entirely (WebGL2 only, with a canvas fallback message). Route-based dynamic import for the gallery and sandbox. |
| PERF-12 uncapped render FPS | Optional 30/60 fps cap (default 60, auto-30 on Low when the frame budget is exceeded), decoupled from the fixed 20 Hz sim. |
| PERF-13 per-frame text/aria writes | Value-diffed writes, and `aria-live` only on the resource ribbon. |
| PERF-14 event object churn | Events written into a reusable struct-of-arrays buffer per tick; the display channel carries the small subset the renderer needs. |

### 6.4 Quality presets

| | Low | Medium | High |
|---|---|---|---|
| Resolution cap | 1.0 | 1.25 | 2.0 |
| Antialias | off | off | on |
| Shadows | off | soft blobs | soft blobs + AO |
| Particles cap | 200 | 700 | 2 000 |
| Cloud shadows | off | on | on |
| Fog blur | 0 | 1 px | 2 px |
| Impact scale-punch | off | on | on |
| Screen shake | off | subtle | full |
| FPS cap | 30 | 60 | 60 |

Default remains **High** for Chromebooks (matching v1's considered decision), with **Auto** measuring a
3-second rolling frame time and stepping down one preset if p95 > 28 ms — and stepping back up only
once, with a HUD notice, so it never oscillates.

---

## 7. Recommended rule & design changes

Each entry states the v1 behaviour, the evidence, the proposal, and how confident I am. **None of
these ship without Zachary's sign-off.** Default position: implement the proposal, but they are
individually revertible.

### RULE-01 — Tech should be revocable (confidence: high)

- **v1:** `unlockedTech` is a permanent latch. Sell or lose the Astral Spire and you keep all four
  spells forever; lose every refinery and you can still build anything.
- **Evidence:** `productionSystem` only ever appends; nothing removes.
- **Proposal:** gate production and construction on **currently completed** buildings, with a 10 s
  grace window so losing one refinery mid-queue doesn't cancel a unit. Keep a separate
  `techEverSeen` list purely for UI disclosure ("you have built this before").
- **Why:** the tech tree currently costs mana once and can never be contested. Making tech buildings
  *worth defending* adds a whole strategic layer (raid the Forge, not the army). RA2 players expect
  "prerequisite building must exist".
- **Risk:** soft-lock if you lose the ability to rebuild the prerequisite. Mitigated by two rules:
  (a) a building that is *under construction* still satisfies `requires`, so rebuilding is never
  blocked; (b) a **construction yard implies the Sanctum tier** — a player surviving on only a Waystone
  Camp (legal today: `hasHQ` accepts either) can still build an Attunement Spire. Without (b), losing
  your Sanctum while a camp stands would leave you unable to rebuild anything, which v1's permanent
  latch happens to hide.

### RULE-02 — Movement arrival is a radius, not a point (confidence: very high — it's a bug)

- **v1:** a move order completes only within `TILE * 0.4 = 12.8` world units of the exact goal, but a
  unit physically cannot enter a building footprint. Ordering any unit onto a building centre makes it
  walk into the wall and stand there **forever**, with the order still active.
- **Evidence:** measured. Also the direct cause of the AI's economic collapse (BUG-01/BUG-03).
- **Proposal:** an order completes when the unit reaches the closest *reachable* point to the goal, or
  within `max(radius + 6, TILE × 0.4)` of it, or after 3 s of no progress (then it stops and reports
  `arrived`). Plus a per-unit watchdog: idle > 40 ticks with an order → recompute the path; still stuck
  → stop and become idle (harvesters re-task automatically).
- **Why:** silent permanent unit loss is the worst class of bug in an RTS.

### RULE-03 — Enforce a unit cap: 60 per player (confidence: high)

- **v1:** `MAX_UNITS_PER_PLAYER = 90` is declared and **never enforced**; there is no cap at all.
- **Evidence:** declaration only; soak runs grew unbounded.
- **Proposal:** 60 units per player, enforced in the produce handler and surfaced in the HUD as
  "Army 47/60" with the button showing "Army full". Buildings and projectiles excluded.
- **Why:** (a) our measured 454-entity brawl costs 5.28 ms/tick before AI — 4×60 + buildings ≈ 300
  entities keeps us inside budget; (b) a cap turns "build everything" into a real composition choice;
  (c) it bounds worst-case memory. 60 is chosen because 4 players × 60 is the largest count that fits
  the Low-tier sim budget with headroom.

### RULE-04 — Arcane Sentry is overtuned (confidence: high)

- **v1:** 3 dmg / 2 ticks = **30 dps** (33 vs light) at **165 range**, 600 HP, 20 power, 250 mana.
- **Evidence:** an Arcane Archer is 17.8 dps (21.3 vs light) at 132 range, 70 HP, 210 mana. The turret
  is ~1.7× the DPS at 1.25× the range with 8.5× the HP, for 19 % more mana — and unlike a unit it can't
  be kited, so it always gets full value.
- **Proposal:** 3 dmg / **4** ticks (15 dps, 16.5 vs light), cost 250 → **300**, power 20 → 25.
- **Why:** a static defense should be a strong deterrent, not out-damage the units it is supposed to
  support. At 15 dps (16.5 vs light) it sits just under one archer's output while being unkillable by
  anything that isn't a dedicated push — the right shape for a fixed emplacement.

### RULE-05 — Celestial Cannon should not delete armies (confidence: medium-high)

- **v1:** 180 dmg ×1.3 vs heavy in a **90-radius** area, every **5 s**, at **420 range** with a 120
  minimum. 46.8 dps vs heavy, area-of-effect, outranging every unit by ~3×.
- **Evidence:** one shot deletes every light unit in a 90-radius circle (archers are 70 HP, imps 90 —
the shot does 180), and three shots kill a 600 HP Stone Golem. It outranges the longest-ranged unit in
the game (Storm Caster, 142) by **278 units — very nearly 3×** — so it can never be answered in kind.
- **Proposal:** 180 → **140** dmg, radius 90 → **72**, cooldown 100 → **140** ticks, min range 120 →
  **140**, cost 2200 → 2400.
- **Why:** keep the identity (long-range siege with a real blind spot) while making it a *positional*
  threat rather than an "I win the army fight" button. 140 still one-shots archers, which is the
  intended punishing feel.

### RULE-06 — Sanctuary Spire makes armies immortal (confidence: high)

- **v1:** 0.4 HP/tick = **8 HP/s** to *every* friendly unit in a 150 radius. An Archer (70 HP) heals
  to full in 8.75 s; a Golem in 75 s — while fighting.
- **Evidence:** `auraSystem` applies it unconditionally each tick, no combat check.
- **Proposal:** heal **out of combat only** — a unit that has taken damage in the last 60 ticks is not
  healed; healing rate 0.25 HP/tick (5 HP/s). Radius 150 → 130.
- **Why:** the current version removes the reward for focusing fire, which is the core skill of the
  game. "Withdraw, heal, return" is a better loop than "stand in the glow and win". The rule is also
  *legible*: the HUD can show "warded / suppressed".

### RULE-07 — Stances must exist in the UI (confidence: high)

- **v1:** `Stance` has three values, `setStance` is a wire command, `standground` is honoured in combat,
  `hold` order is dead code — and **no UI or binding reaches any of it**.
- **Evidence:** `grep setStance src/ui` → nothing; `InputController.setStance` has no caller.
- **Proposal:** a three-state toggle on the selection panel (Aggressive / Defensive / Hold) bound to a
  keyboard key, plus a leash: aggressive units chase at most 260 units from their ordered position and
  then return.
- **Why:** this is the single biggest "my units wander off and die" fix (FEEL-01), and it is already
  90 % implemented.

### RULE-08 — Decide the research system (confidence: medium — needs Zachary)

- **v1:** full research pipeline (queues, `unitStatModifier` / `buildingStatModifier` /
  `economyModifier`, hash coverage, UI buttons, validation) with **zero content**. `data/research/`
  does not exist.
- **Proposal (recommended):** ship **6** researches, each at an existing building, each with a clear
  fantasy and an explicit counter:

| Research | At | Effect | Cost / time |
|---|---|---|---|
| Warded Plate | Golem Forge | +15 % HP to heavy units | 500 / 25 s |
| Honed Runes | Summoning Circle | +15 % damage to light units | 500 / 25 s |
| Swift Ley | Attunement Spire | +10 % wisp speed, +10 % siphon | 400 / 20 s |
| Far Sight | Scrying Obelisk | +15 % sight on all units | 450 / 20 s |
| Quickened Casting | Arcane Nexus | −12 % weapon cooldown, buildings only | 900 / 35 s |
| Reinforced Foundations | Ley Conduit | +20 % building HP | 600 / 30 s |

- **Why:** the pipeline already exists and is hashed; six entries create a real mid-game mana sink and
  a reason to keep production buildings alive. If scope is tight, **delete the system entirely** —
  dead code is worse than no feature. Either is fine; leaving it dormant is not.

### RULE-09 — Cap production queues at 5 (confidence: high)

- **v1:** unlimited. 30 clicks queue 30 units and lock 4 200 mana with no way to see it except a scroll
  strip.
- **Proposal:** 5 per building, with a clear "Queue full" state and a per-building queue count on the
  producer chip (already rendered in v1).

### RULE-10 — Split spells from the superweapon (confidence: medium)

- **v1:** the Astral Spire (4 500 mana / 45 s) unlocks **all four** spells *and* is the only path to
  any spell at all. Every AI build order ends there; the mid-game is a race to one building.
- **Proposal:** Arcane Nexus unlocks Meteor Storm, Aegis Ward and Blink Gate (so the mid-game has
  spells); the Astral Spire unlocks **only** Astral Lance. Adjust cooldowns: Meteor 1800 → 2400,
  Aegis 1200 → 1500, Blink 900 → 1200.
- **Why:** it turns one gate into a curve, gives the Nexus a purpose beyond "unlock tier 3", and keeps
  the superweapon special. This *is* a gameplay change, so it needs sign-off.

### RULE-11 — Delete the three unused projectile defs (confidence: high — cosmetic)

- `frost_bolt`, `inferno_orb`, `celestial_shot` are defined and referenced by nothing (the frost and
  inferno towers became beams; the cannon became a sky strike).
- **Proposal:** delete, and add a `validate.ts` check that every projectile def is referenced by at
  least one weapon so this cannot rot again.

### RULE-12 — Node reserves: let the map mean what it says (confidence: high)

- **v1:** every node amount is silently clamped to `balance.manaNodeCapacity` (12 000), so the map's
  authored 25 000 corner nodes are actually 12 000. Editing the map above the cap does nothing.
- **Proposal:** remove the global capacity clamp; author real amounts per map. Tight pacing scales
  node reserves by 0.66 instead of clamping.
- **Why:** hidden global clamps make map design lie, and they make "node quality" a meaningless
  authoring axis.

### RULE-13 — Retune / rename "Tight economy" (confidence: medium)

- **v1 Tight:** starting mana 600 (−33 %), siphon 12 (−25 %), node cap 8 000 (−33 %), wisp carry 60
  (−20 %), conjure 1/s (−50 %), **all unit costs ×1.5 and 12 building costs ×1.5**.
- **Effect:** income −25 %, costs +50 % ⇒ roughly **2× slower** to every army, not "tighter".
- **Proposal:** rename to **"Marathon"** and retune to income −25 %, costs **+15 %**, starting mana
  750. Keep a second preset **"Blitz"** (income +25 %, starting mana 1200) for short sessions — school
  Chromebook play is often 15-minute windows.
- **Why:** the label should describe the experience. Two presets that bracket the default are more
  useful than one that is just "the game, but you'll be late for class".

### RULE-14 — Map variety (confidence: high — content addition)

- **v1:** exactly one map. 1v1 on a 4-corner 128×88 map puts opponents **3 688 world units** apart: an
  archer needs ~60 s to cross, a Siege Behemoth ~108 s. The first meaningful contact is ~3 minutes in.
- **Proposal:** ship **three** maps in v2:
  1. **Duel Glade** (parity, rebuilt by a generator that actually produces what ships — BUG-12).
  2. **Crosswinds** — 2-player, 96×96, mirrored, with a contested central plateau and two side nodes.
     ~1 800 units between starts (~30 s for an archer): the "quick match" map.
  3. **Fourfold Reach** — 4-player rotational, 144×112, four corner plateaus + a centre mesa and four
     expansion pockets.
- **Why:** map choice is the cheapest source of replayability, and 1v1-on-a-4-player-map is a
  pacing bug in disguise.

### RULE-15 — The coach should teach the game that exists (confidence: high)

- **v1:** 4 steps, ending on a static card about radar. It never mentions power, the win condition,
  harvesting with more than one wisp, or how to counter anything.
- **Proposal:** keep it short (5 steps max) but make each step **live** — highlight the real control,
  wait for the real action, and give one sentence of *why*:

| # | Teach | Success condition |
|---|---|---|
| 1 | Select your Sanctum, open Build | HQ selected |
| 2 | Place an Attunement Spire near the glowing node | refinery placed |
| 3 | You have 2 free wisps — send both to the node | two harvest orders issued |
| 4 | Build a Ley Conduit (power) and a Summoning Circle (troops) | both placed |
| 5 | Win by destroying the enemy Sanctum. Build an army, attack-move it, and check the minimap (it needs a Scrying Obelisk). | match ends |

- Plus a dismissible "Field Manual" panel in Settings with the 12 facts a new player needs (armor
  counters, power, high ground, garrison, expansions).

### RULE-16 — Fix what "defense building" means (confidence: high)

- **v1:** `isDefenseBuilding()` returns true only if the def has a weapon, an aura, or a garrison — so
  **Stone Wall and Arcane Gate are not defenses**. The AI therefore never prioritises walls as a siege
  target and walks into them.
- **Proposal:** classify by `menuCategory === 'defenses'` **or** the presence of a weapon/aura/garrison,
  and make walls/gates "obstacle" targets that siege units clear.

### Summary table

| Rule | Change | Confidence | Needs Zachary |
|---|---|---|---|
| RULE-01 | Revocable tech with 10 s grace | high | yes |
| RULE-02 | Arrival radius + stuck watchdog | very high | no (bug fix) |
| RULE-03 | 60-unit cap, enforced | high | yes |
| RULE-04 | Sentry: 15 dps, 300 mana, 25 power | high | yes |
| RULE-05 | Cannon: 140 dmg, r72, 7 s, min 140 | medium-high | yes |
| RULE-06 | Sanctuary heals out of combat only | high | yes |
| RULE-07 | Stances in the UI + chase leash | high | no (completing a half-built feature) |
| RULE-08 | 6 researches, or delete the system | medium | **yes — pick one** |
| RULE-09 | Queue cap 5 | high | no |
| RULE-10 | Nexus → 3 spells, Spire → Lance only | medium | yes |
| RULE-11 | Delete 3 unused projectiles | high | no |
| RULE-12 | Remove the node-capacity clamp | high | no |
| RULE-13 | "Marathon" retune + new "Blitz" | medium | yes |
| RULE-14 | Three maps | high | yes |
| RULE-15 | Live 5-step coach + Field Manual | high | yes |
| RULE-16 | Fix defense classification | high | no (bug fix) |

---

## 8. Things v1 has that v2 will not carry over

| Removed | Why |
|---|---|
| `src/sim/capabilities/*` indirection | Eight capability slots with 40 accessor functions for state that five entities use. In v2 a unit that harvests has `harvest?: { carry, max }` on its type — the type system does the work, no accessor layer. Removes ~430 lines and all `ensureCaps` mutation. |
| `sim/views.ts` facade | It exists because the layer guard was too coarse to allow `render` to import `sim/queries`. v2's layer test allows read-only query imports and bans mutation imports, so the extra hop goes away. |
| `sync-surface.ts` + `sync-delta.ts` (2 files, 409 lines) | Replaced by the display channel + a single `serialize.ts`. The delta path stringified every entity per tick and rebuilt full state on arrival. |
| `modifiers.ts` research pipeline **if** RULE-08 resolves to "delete" | Dead abstraction. |
| `ai/chance.ts` hash-rolls | Replaced by real seeded RNG streams. |
| `ai/intel.ts` omniscient paths | Unfair; deleted with the fairness test as the guard. |
| `sandbox/*` bespoke DOM | Rebuilt on the same UI primitives as the rest of the HUD, so it stops being a second design language. |
| Per-building bespoke VFX **files** | Replaced by a data-driven VFX emitter (`art.fx: [{ on: 'fire', emitter: 'storm-arc', ... }]`) plus a small library of emitters. Five custom renderers (2 278 lines) become ~400 lines of data + 300 lines of generic emitter. |
| `EventBus` residue, `makeEntity` deprecated shim, `hasSanctum` alias | Dead code. |
| Sourcemaps in the production build | 6.4 MB → ~1.2 MB dist; debug builds keep them. |

Net effect: **fewer lines, fewer concepts, same features** — which is what makes the "rebuilt, not
copied" claim true.

---

## 9. Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| RISK-01 | **Cross-engine float divergence.** v1 uses `Math.atan2/sin/cos/pow` in gameplay. V8 is used everywhere today so nobody has noticed; Firefox or Safari peers would desync | Lockstep breaks on non-Chrome | Deterministic LUT math in `core/fixed.ts`; lint ban; a `sim` test runs a 3 000-tick scripted match and compares hashes across V8 and (CI) SpiderMonkey via a smoke job |
| RISK-02 | Scope: full parity is 16 groups and ~400 inventory rows | A half-built v2 | Phases gate on *tests*, not vibes; each phase ships a playable increment; §11 defines a hard "no phase skips the previous exit criteria" rule |
| RISK-03 | Typed-array rewrite makes code harder to read and invites off-by-one bugs | Slow development, subtle bugs | Wrap in a `Store` class with typed accessors and `debugAssert` in dev builds; keep cold data in objects; a fuzz test that runs 10 000 random ticks and asserts invariants (hp ≥ 0, no NaN, no overlap, ids stable) |
| RISK-04 | Multiplayer regression during the rewrite | The one feature that is hardest to test and most visible when broken | Protocol is ported in Phase 5 with a deterministic replay harness that runs 4 peers in-process; a nightly 2-browser Playwright lockstep smoke test; and a "no merge to v2 main without a 20-minute 2-peer AI match hash-equal" gate |
| RISK-05 | Art bake cost on a Celeron | 2 s of jank on first load | Bake to an atlas texture, persist to IndexedDB, show a progress splash, and bake progressively (units first, buildings second) |
| RISK-06 | The AI rewrite is the biggest unknown | The headline goal fails | It is a separate phase with its own benchmark harness and acceptance numbers (§4.5, §10.4); the old config-driven AI stays available behind a flag until the new one beats it in the benchmark |
| RISK-07 | Two codebases drift while v1 is live | Players on v1 see different balance than v2 | v1 is frozen for content; any balance fix that matters is applied to both by hand until cutover, and documented |
| RISK-08 | Chromebook GPU variance (UHD 600 vs Mali) | Low preset still stutters | Software fallback path: if WebGL2 is unavailable or the first 60 frames average > 40 ms, drop to a 2D-canvas sprite renderer with the same atlas (no shaders, no fog blur) |
| RISK-09 | Golden-replay maintenance becomes a tax | Every rule tweak breaks tests, people start deleting tests | Golden replays are regenerated by an explicit `npm run update-goldens` that prints a diff of why hashes changed; the test asserts on *replay determinism*, not on a frozen hash, unless `rulesVersion` is unchanged |

---

## 10. Test strategy

### 10.1 Shape

```
v2/tests/
  unit/            pure functions & single systems (fast, thousands of assertions)
  sim/             multi-system behaviour on real matches (seconds)
  determinism/     hash equality across runs, threads, peers, save/load
  ai/              fairness, difficulty separation, benchmark harness
  perf/            budget assertions
  content/         schema, reachability, balance sanity
  net/             lockstep, relay pacing, stall/snapshot, protocol schemas
  ui/              HUD logic, gestures, compact layout, coach
  e2e/             Playwright (phone + Chromebook + desktop viewports)
```

### 10.2 Determinism suite (the most important one)

| Test | Assertion |
|---|---|
| `two-runs` | Same seed + same commands ⇒ identical hash every 100 ticks |
| `worker-parity` | Worker sim and inline sim produce the same hash at 1 200 ticks |
| `snapshot-roundtrip` | Pack → unpack → continue 600 ticks ⇒ same hash as uninterrupted |
| `save-roundtrip` | Save at tick N → load → continue ⇒ same hash |
| `peer-parity` | 2, 3 and 4 in-process peers merged through the real relay merge function ⇒ same hash at 1 200 |
| `cross-engine` | 3 000-tick scripted match hash-equal on V8 and SpiderMonkey (CI smoke) |
| `math-lint` | No transcendental calls in `sim/` |
| `rules-version` | Loading a replay/save with a different `rulesVersion` fails loudly with an explanation |

### 10.3 Simulation suite

- **Fuzz**: 10 000 ticks of random-but-seeded commands against a fixed match; assert invariants after
  every tick (no NaN, hp in `[0, max]`, no entity inside a blocked tile, no two units overlapping by
  more than 1 unit, `nextId` monotonic, queues never negative).
- **Rule tests**: one file per rule area mirroring the inventory sections (economy, power, tech,
  production, construction, combat, height, fog, spells, garrison/air/MHQ, win).
- **Property tests** for the counter system: for every unit pair, `damage(a→b)` uses `vs[armor(b)]` and
  the sum of a projectile's splash never exceeds `damage × n`.

### 10.4 AI suite

| Test | Assertion |
|---|---|
| `fairness` | §4.6, five assertions |
| `difficulty-ladder` | Hard beats Normal ≥ 70 % and Normal beats Easy ≥ 80 % over 20 seeds, *without* any resource handicap |
| `seeds-differ` | 8 seeds ⇒ ≥ 6 distinct (winner, duration) outcomes |
| `no-collapse` | In 10 of 10 seeds, the AI reaches ≥ 8 buildings and ≥ 15 army units by minute 8 (regression guard for BUG-03) |
| `no-stuck` | Zero AI units idle-with-an-order for > 120 ticks over a 20-minute match |
| `telegraph` | Time to first attack ≥ 2:30 and ≤ 6:00 on Easy/Normal/Hard (so matches have a shape) |
| `determinism` | AI-vs-AI 1 200 ticks twice ⇒ same hash |

Benchmark harness (`npm run ai:bench`) prints a table: win rates, avg match length, tech timings, worker
uptime, army value curve, peak entity count per difficulty. It is the instrument for tuning, and it is
committed so results are reproducible.

### 10.5 Performance suite

Each budget in §6.2 becomes a test that fails CI on regression. Run with `--cpu-throttle=4` (via
Playwright CDP) for render budgets so a beefy CI box doesn't hide a Chromebook problem.

### 10.6 E2E

| Spec | Flow |
|---|---|
| `boot` | Menu loads, no console errors, main thread < 2.5 s to interactive |
| `solo-match` | Menu → lobby → template → start → select → build → train → attack-move → victory overlay |
| `coach` | Fresh profile walks the 5 coach steps and they advance on real actions |
| `gallery` | Every card renders; opening a preview runs 5 s with no errors; colour switch re-renders |
| `sandbox` | All tabs, representative actions, scenario save/load, palette |
| `mp-smoke` | Two browser contexts, real relay, create/join/ready/start, both issue commands, hashes agree for 300 ticks |
| `reconnect` | Drop one socket mid-match, auto-reconnect, snapshot resync, both hashes agree |
| `layouts` | 1366×768, 1920×1080, 844×390, 667×375: no clipped or overlapping HUD, no horizontal scroll |
| `a11y` | Keyboard-only path through the menu and lobby; focus visible; contrast ≥ 4.5:1 on HUD text |

### 10.7 Definition of done for any rule change

1. A test that fails before the change and passes after.
2. `rulesVersion` bumped if hashes change.
3. Goldens regenerated with a printed diff.
4. Inventory row ticked.

---

## 11. Build phases

Ten phases. Each has an **exit criteria** that is a test result, not a judgement. No phase starts
before the previous one's exit criteria are green in CI. Each phase ends with a commit on
`rebuild/v2` and a deployable preview build.

### Phase 0 — Audit & plan *(this run)*

- Source-level audit of every system, screen, rule and data file.
- `FEATURE_INVENTORY.md` (~400 checklist rows, 33 bugs, 14 perf problems, 20 feel problems).
- `REBUILD_PLAN.md` (this document).
- Branch `rebuild/v2`, draft PR.
- **Exit:** both docs reviewed; rule changes signed off or overruled.

### Phase 1 — Foundations *(nothing playable yet)*

- `v2/` scaffold: Vite + TS strict + ESLint + Vitest + Playwright, all independent of the root config.
- `core/`: constants, fixed-point math with LUTs, RNG with sub-streams, projection, vec helpers.
- `data/`: schema v2, Zod, loader, registry, validation (cross-refs, reachability, unused-def detection).
- Content migration: all 29 defs + 4 spells + 6 projectiles + factions + match configs into schema v2
  (hand-checked, not copied verbatim).
- `sim/store.ts`: dense entity store with free list + sorted id view; fuzz test for invariants.
- `sim/hash.ts`, `sim/serialize.ts` with `rulesVersion`.
- `tests/architecture/layers.test.ts`.
- **Exit:** `loadRegistry()` succeeds with zero validation issues; 10 000-tick fuzz on an empty world
  is invariant-clean; layer test green; bundle builds.

### Phase 2 — Simulation core *(headless, playable by commands)*

- Nav grid (terrain, heights, ramps, gates), region graph, hierarchical pathing, local steering,
  separation, arrival + stuck watchdog (RULE-02).
- Systems 1–16 in fixed order.
- Full rule set: economy, power, tech (RULE-01), production (RULE-09), construction, combat (all five
  weapon shapes), statuses, height rules, fog, spells, superweapon, garrison, air, morph, win.
- Commands + validation; events.
- Headless harness: run a match from a command script.
- **Exit:** a full 1v1 can be played to a win by scripted commands; determinism suite green (except
  cross-engine, which lands here too); all rule-area unit tests green; perf test *recorded* (not yet
  budgeted).

### Phase 3 — Renderer

- Pixi app, dimetric camera, chunked terrain with material bands, decals, cliff strata, ramp slopes.
- Procedural model bake → atlas + IndexedDB cache; team masks; emissive.
- Display-channel consumer + interpolation; depth sorting; occlusion markers.
- Fog as a texture; selection/HP/queue overlays; placement overlay.
- Batched particles; impact feedback; death shards; build-up scaffolding.
- Quality presets + auto-detect.
- **Exit:** matches render at 40 fps on the Low preset with 200 entities; gallery-quality screenshots
  of every def; fog costs one draw call (asserted).

### Phase 4 — Input, HUD, screens *(first genuinely playable build)*

- Gesture FSM with touch/mouse parity; intents; all 9 input modes; wall drag; stances (RULE-07);
  shift-queue, control groups, right-click orders, idle cycling.
- HUD rebuilt on the design system: ribbon, selection card, command card, producer chips, queues,
  minimap, radar states, hints, pause, result, settings.
- Menus, lobby (solo), coach v2 (RULE-15), Field Manual.
- Compact-phone layout as its own layout, not a squeeze.
- **Exit:** a human can play a full skirmish against a placeholder AI on all three viewports; E2E
  `solo-match`, `coach`, `layouts` green.

### Phase 5 — Multiplayer

- Protocol v2 (bumped version), Zod on both sides, lockstep client, transport with backoff.
- Relay: rooms, lobby sync, peer-paced clock, acks, stall drop, snapshot resync, rejoin, health.
- Lobby UI for host/guest; ready states; error surfaces.
- Desync UX: visible report, replay download, "continue offline" option (NET-21).
- Host-migration-safe snapshot (NET-22: any peer can serve a snapshot from its own state).
- Deploy: one Node service serving build + relay; document Railway.
- **Exit:** 2/3/4-peer in-process hash parity; `mp-smoke` and `reconnect` E2E green; a 20-minute
  real-network 2-peer match with a 6 s artificial stall stays in sync.

### Phase 6 — AI

- `AiMemory` in state, hashed; observe/econ/build/produce/military/spells; squads; reaction model;
  difficulty ladder; spells and superweapon logic.
- Fairness + ladder + seeds-differ + no-collapse + no-stuck tests.
- Benchmark harness + tuning pass.
- Debug overlay that visualises the AI's own memory (same data, no cheating view).
- **Exit:** §10.4 all green; Hard beats the v1 AI ≥ 80 % head-to-head; no difficulty uses hidden info.

### Phase 7 — Content parity & balance

- Every inventory content row ticked; three maps (RULE-14); research decision implemented (RULE-08).
- Balance pass driven by the AI benchmark + human playtests: time-to-first-contact, average match
  length 8–14 min, every unit built in ≥ 20 % of matches, no unit above 60 % pick rate.
- Data validation: every def reachable, every projectile used, no unused field.
- **Exit:** content suite green; a `balance:report` artifact shows the distribution.

### Phase 8 — Presentation polish

- VFX pass on every weapon and every signature building.
- Audio: procedural ambience layer, per-faction stingers, mix bus with ducking; SFX now actually read
  from data (fixes BUG-29).
- Entity Designs gallery rebuilt on the new pipeline, with live previews and a scrub timeline.
- Sandbox rebuilt on the design system with the new overlays.
- Settings: graphics, audio, UI scale, colourblind palette, reduced motion, drag mode, tips.
- Save/load with migrations; Continue; online session.
- **Exit:** gallery `every card renders + preview runs`; sandbox E2E green; `a11y` green.

### Phase 9 — Performance hardening & ship

- Budget tests locked and green (sim, AI, frame time at Low/Mid, cold start, bundle size, memory soak).
- Chromebook hardware pass (real device or a throttled profile that reproduces it).
- PWA: precache the right file set, atlas cache, update strategy that never reloads mid-match
  (FEEL-18).
- Deploy v2 to `/v2/` on the existing Pages project + a second Railway service; v1 untouched.
- Beta with a handful of real players; fix; then decide on cutover.
- **Exit:** all §6.2 budgets green in CI; 30-minute soak with no leak; v1 still deploys and works.

### Phase dependency graph

```
P0 ──▶ P1 ──▶ P2 ──▶ P3 ──▶ P4 ──┬──▶ P5 ──┐
                                  └──▶ P6 ──┴──▶ P7 ──▶ P8 ──▶ P9
```

P5 and P6 can run in parallel once P4 is green (they touch different subsystems).

---

## 12. Isolation from v1 (hard constraint)

| Concern | How v2 stays out of v1's way |
|---|---|
| Source | Everything under `v2/`. No edits to `src/`, `tests/`, `e2e/`, `data/`, `relay/`, `scripts/`, `index.html`, `vite.config.ts`, `package.json`, `wrangler.toml`, `nixpacks.toml`, `railway.json`. |
| Dependencies | `v2/package.json` is its own workspace with its own `node_modules` and lockfile. |
| CI | v1's `.github/workflows/ci.yml` is untouched. A **new** `.github/workflows/v2-ci.yml` runs only on paths `v2/**`. |
| Deploy | v1 keeps building `dist/` → Cloudflare Pages `wizz-aw8`. v2 builds `v2/dist/` and is published under `/v2/` (separate Pages project or a second build step). Relay: a second Railway service, or the same service with a `/v2` WebSocket path — decided in Phase 5. |
| Docs | `v2/docs/*`. Root `docs/` and `README.md` untouched until cutover. |
| Branch | `rebuild/v2` only. **Never merged to `main`.** Cutover, if it ever happens, is a separate deliberate decision by Zachary. |

Commands that must keep working exactly as they do today, from the repo root:
`npm ci`, `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`,
`npm run test:full`, `npm run test:e2e`, `npm run relay`, `npm run start`.

v2 gets its own equivalents, run from `v2/`: `npm run dev|build|typecheck|lint|test|test:full|e2e|relay|ai:bench|update-goldens`.

---

## 13. Open questions — only Zachary can answer

1. **Target browsers.** ChromeOS + Chrome Android + desktop Chrome are a given. Are **Safari/iPad** and
   **Firefox** in scope? This decides whether RISK-01 (deterministic math) is mandatory or merely
   prudent, and whether we can rely on WebGL2, `OffscreenCanvas`, and modern CSS.
2. **Art pipeline.** Keep zero-binary procedural art (§5.2, my recommendation), or move to
   authored/generated sprite atlases committed to the repo? Atlas art buys another large visual jump at
   the cost of an asset pipeline, binary diffs, and a licence question.
3. **RULE-08 — research.** Ship the six researches, or delete the dormant system?
4. **RULE-10 — spell split.** Move Meteor/Aegis/Blink to the Arcane Nexus, or keep all four on the
   Astral Spire?
5. **Difficulty count.** Keep Easy/Normal/Hard, or add a fourth tier ("Archmage") for players who beat
   Hard? A fourth tier is cheap once the ladder exists, but it needs its own tuning pass.
6. **v2's home.** Live at `/v2/` beside v1 until a deliberate cutover, or replace v1 at the root once v2
   is ready? (Recommendation: `/v2/` + a menu "try the new build" link, then cut over.)
7. **Protocol compatibility.** Should v1 and v2 players be able to share a room? (Recommendation: **no**
   — bump `PROTOCOL_VERSION`, run a separate relay service; mixed rooms would require two rule engines
   in one peer.)
8. **Max players.** v1's sim supports 8 but the lobby exposes 4. Should v2 expose 8-player FFA (needs a
   bigger map and a perf pass) or stay at 4?
9. **Replays as a player feature.** v1 has a recorder that only fires on desync. Should v2 ship
   watch/share/download replays? (It is nearly free once `rulesVersion` + serialization exist, and it is
   a big deal for a school game where bragging rights matter.)
10. **Factions.** One faction for parity, or should the schema and the lobby be built for two now? (A
    second faction doubles the content and balance surface; I would not do it in v2.0.)
11. **Analytics.** None today. Do you want any anonymous match-outcome telemetry to tune difficulty?
    (For school Chromebooks I would default to **no**.)
12. **Name and identity.** Does "Arcane Dominion" stay for v2, or is this a chance to rename before the
    PWA is re-registered?

---

## 14. What "done" looks like

- Every row in `FEATURE_INVENTORY.md` ticked, each backed by a test.
- All 433 v1-equivalent behaviours covered, plus the new ones; no dropped feature without a signed-off
  RULE entry.
- §6.2 budgets green on the Low tier in CI.
- 4-player AI-vs-AI matches that are *interesting*: different on different seeds, 8–14 minutes,
  escalating tech, visible scouting and harassment.
- A first-time player on a school Chromebook finishes the coach and wins a match against Easy inside
  15 minutes.
- Two players on school wifi play a 20-minute match with one 6-second stall and never desync.
- The Entity Designs gallery makes someone say "that's the same game, but it looks *good* now".
