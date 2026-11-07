# Arcane Dominion v2 — Rebuild Plan

**Status:** Phase 0 complete. No v2 game code has been written yet.
**Baseline verified:** `main` @ `8786665`, branch `cursor/rebuild-v2-5642`.
**Companion document:** [`FEATURE_INVENTORY.md`](./FEATURE_INVENTORY.md) — the completeness checklist.

---

## 0. How to read this document

Every claim in §1, §2 and §10 is backed by a command that was actually run in this phase. Evidence
is cited inline as `[E#]` and collected in §12 with the exact command and its output. Where I could
not verify something I say so explicitly (§13).

---

## 1. What the current game actually is (verified)

### 1.1 Size and shape

| Measure | Value | Source |
|---|---|---|
| TypeScript source files in `src/` | 212 | `find src -type f \| wc -l` |
| Lines of TS in `src/` | 29 185 | `find src -name '*.ts' -o -name '*.tsx' \| xargs wc -l` |
| Test files / assertions | 64 files, **431 passing** | `npm test` [E1] |
| Playwright specs / passing | 4 files, **6 passing** | `npx playwright test` [E2] |
| Largest modules | `shape-sprite.ts` 1322, `renderer.ts` 1099, `hud.ts` 685, `sanctuary-spire-vfx.ts` 604, `match-lobby.ts` 595, `ai/behaviors.ts` 563 | `wc -l` |
| Production bundle | 847.8 kB main chunk (**236.7 kB gzip**) + Pixi splits; `dist/` 6.4 MB | `npm run build` [E3] |
| Content | 10 units, 20 buildings, 4 spells, 6 projectiles, 1 map, 4 match presets, 2 AI strategies | `data/**` |

The code is well-factored in places (`src/sim` is genuinely pure; the render/UI/sim split is real
and lint-enforced) but has grown organically: 212 files with a 1300-line procedural texture
generator, five hand-written bespoke VFX modules, and a 595-line lobby component.

### 1.2 Architecture (as-is)

```
input/ ─┐
ui/ ────┼──> Command[] ──> Simulation (20 Hz, fixed order) ──> GameState
ai/ ────┤                        │                                │
net/ ───┘                        └──> GameEvent[] ────────────────┤
                                                                  ├──> render/ (PixiJS)
                                                                  ├──> ui/ (DOM HUD)
                                                                  └──> audio/
```

Tick order (`src/sim/step.ts:38-59`) — 17 systems, order is load-bearing:
`applyCommands → aiHook → production → morph → movement → visibility → combat → beamWeapon →
garrison → projectile → superweapon → aura → harvest → channel → death → winCheck → sandboxCheats`.

This is a good skeleton and v2 keeps the *shape* while replacing every implementation.

---

## 2. Measured baselines (the numbers v2 must beat)

Full raw data: [`baseline-perf.json`](./baseline-perf.json) and
[`baseline-screenshots/`](./baseline-screenshots/).

### 2.1 Simulation CPU (hardware-independent, the honest metric)

The GPU in the audit container is **SwiftShader** (software rasteriser), so browser FPS there is
meaningless for Chromebooks/phones [E4]. What *is* portable is how much of the 50 ms tick budget the
simulation consumes.

| Scenario | ms/tick | % of 50 ms budget | Entities | Source |
|---|---|---|---|---|
| 1v1 hard-vs-hard, 20 sim-minutes | 0.193 | 0.4 % | 21 | [E5] `audit-bench` |
| 4 AI players, 1200 ticks | 0.609 | 1.2 % | 41 | [E7] `audit-load` |
| 187 entities, massed attack-move (4×90 units + 4×20 buildings) | **6.995** | **14.0 %** | 187 | [E7] `audit-load` |

**Reading:** the *simulation* is not the bottleneck (14 % worst case). The bottleneck is the
**renderer and the DOM HUD**, plus the AI never building enough army to reach the interesting range.
Note the 4×90-unit stress only reached 187 entities, not 440 — units were killed during the run.

### 2.2 Browser frame pacing (SwiftShader; directionally useful only)

Measured over 4 s windows at each target viewport after 20 s of match time:

| Viewport | Idle fps | Zoomed-out fps | Panning fps | p95 frame | Source |
|---|---|---|---|---|---|
| 667×375 @2× | 14.4 | 12.7 | 15.1 | 117–167 ms | [E6] `baseline-perf.json` |
| 844×390 @3× | ~14 | ~13 | ~15 | 117–167 ms | [E6] |
| 1366×768 @1× | 14.5 | 12.7 | 15.9 | 117–167 ms | [E6] |
| 1920×1080 @1× | 9.9 | 8.5 | 11.2 | 167–250 ms | [E6] |

These are SwiftShader numbers (software rasterising ~1–2 MPix/frame), **not** what a Chromebook
GPU does. They are retained only because they are internally comparable: v2's renderer, measured
on the same SwiftShader setup, must show a large improvement. That is a fair, reproducible
comparison even though the absolute numbers are pessimistic.

Additional render-side facts measured in-browser [E8]:
- Canvas backing store at 667×375 @2× DPR is **1334×750**; at 844×390 @3× it is **1688×780**
  (DPR clamped to 2 by the High profile, but still 1.3 MPix of fill for a 0.33 MPix CSS area).
- HUD DOM: **174 nodes / 35 buttons**, forced-layout cost 0.003 ms — DOM is *not* a bottleneck.
- Zero `longtask` entries >50 ms during 5 s of play — so the problem is throughput per frame, not
  isolated jank spikes.
- `dist/` is 6.4 MB, of which the main JS chunk is 848 kB raw / 237 kB gzip. On a school Chromebook
  over school wifi this is a multi-second first load; the PWA precache is **1352.79 KiB**.

### 2.3 Economy pacing

| Milestone (scripted, ideal play, no harassment) | Time | Source |
|---|---|---|
| Attunement Spire complete | 8.1 s | [E9] `audit-pace` |
| Summoning Circle complete | 52.3 s | [E9] |
| 10 Imp Swarmlings fielded | **159.1 s** | [E9] |
| Mana banked after 12 min of one wisp + one factory | 6 695 | [E9] |

Real single-wisp income measured at **3.75 mana/s**, not the configured `siphonPerSecond: 16`
[E10] — because 16/s only applies *while in contact* with a node; the round trip (spire→node→spire,
272 world units each way at speed 72) dominates. A 900-mana start therefore buys one Attunement
Spire (750) and then the player waits.

### 2.4 AI quality — the most serious finding

AI-vs-AI sweep over 4 difficulty pairings × 4 seeds, 30 simulated minutes each [E11]:

| Pairing | Resolved | Stalled (mana flat > 3 min) | Peak units |
|---|---|---|---|
| hard vs hard | 0 / 4 | 4 / 4 | 25 |
| hard vs normal | 4 / 4 | 0 | 26 |
| normal vs normal | 0 / 4 | 4 / 4 | 20 |
| easy vs easy | 4 / 4 | 0 | 28 |
| **Total** | **8 / 16 (50 %)** | **8 / 16** | **28 max** |

And the outcome is *identical across seeds 1, 2, 3, 4* — every row in a pairing has the same
winner and the same tick [E11]. Root causes, all verified:

1. **Seeds do nothing.** `GameState.rngState` is initialised from the seed (`factory.ts:172`) but
   `nextRandom()` is **never called anywhere** in `src/` [E12]. Verified empirically: seeds 1 and
   99999 produce byte-identical sim state after 1200 ticks, with `rngState` still 1 and 99999
   respectively [E13]. The AI's "sloppiness" is `ai/chance.ts`, an FNV hash of
   `tick|playerId|key` — deterministic but *seed-independent*.
2. **Both AIs destroy each other's economy and then freeze.** At 5 sim-minutes player0 has **zero
   living harvesters** and 10 mana, with 8 resource nodes holding 70 000+ mana available [E14].
   With no harvester, no income, and no way to rebuild (the Attunement Spire is still standing but
   trains Wisps only when power and mana allow), the AI is permanently stuck. It never surrenders,
   so `winCheckSystem` never fires.
3. **Peak army is 28 units, never more.** The AI's production gates (`armyThreshold`,
   `siegeArmyThresholdFactor`, `maxQueue`) cap it far below the 90-unit-per-player design cap.
4. **`MAX_UNITS_PER_PLAYER = 90` is declared but enforced nowhere** [E15] — no production or spawn
   path checks it.
5. **The AI deliberately cheats at `hard`.** `intel: 'omniscient'` (`difficulty.ts:138`) lets Hard
   see every enemy entity on the map, and `omniscientEnemyHq()` is used unconditionally in
   `issuePush`/`decideSpells` for *all* difficulties (`behaviors.ts:226,369,463`) — so even Easy
   knows exactly where the enemy HQ is.

A human player would experience this as: "the enemy sends a few units, kills my wisps, then stands
still forever and the match never ends."

---

## 3. Recommended rule changes (with reasoning)

The brief says keep the rules unless research and reasoning justify a change. These six are
justified by measurement; everything else stays identical.

### 3.1 Harvest income must be decoupled from travel time — **change**

**Problem.** `siphonPerSecond: 16` is applied *only while touching the node* (`harvest.ts:90-99`);
the ~7.5 s round trip means effective income is 3.75 mana/s [E10]. A 900-mana start = 4 minutes
before the first tank-sized unit. Every subsequent build is gated behind that, which is why the
scripted plan needs **159 s to field 10 basic infantry** [E9].

**Proposal.** Apply siphon *continuously from the moment the wisp reaches the node until it fills*
(the v1 code already models this), and raise `carry` so a trip is economically meaningful. Concretely:

- `siphonPerSecond` 16 → 20, `wisp.carry` 75 → 100, `wisp.speed` 72 → 84.
- Keep the round trip; it is what makes map control matter.
- Retune `manaNodeCapacity` 12 000 → 9 000 so 4 corner nodes still last ~7.5 min at the new rate.

**Expected effect.** ~5.0 mana/s per wisp (up from 3.75), 10 imps at ~95 s instead of 159 s. The
first 2 minutes stop being dead time.

**Why not just raise starting mana?** Because the complaint is *pacing*, not *affordability* — a
bigger bank makes the opening trivial and then re-stalls at the same wall.

### 3.2 The `resonance_vault` economy upgrade should scale with harvester count — **change**

**Problem.** `vaultSiphonMultiplier: 1.3` multiplies the *per-wisp* rate, so its value scales with
however many wisps you own. Combined with 3.1 it becomes a runaway: more wisps → more income →
more wisps. Meanwhile v1 has no diminishing returns anywhere.

**Proposal.** Keep the 1.3×, but add a soft harvester cap per refinery: each Attunement Spire
supports **4 harvesters at full rate**, with a 15 % penalty per extra harvester beyond that. This
preserves the RA2 "build more refineries" decision without letting one refinery feed 12 wisps.

### 3.3 Difficulty must not equal maphack — **change**

**Problem.** Hard literally sees the whole map (`intel: 'omniscient'`), and *all* difficulties use
`omniscientEnemyHq()` to aim pushes [E12] (`behaviors.ts:226,369,463`). That is both unfair-feeling
and bad AI design — it hides the real weaknesses instead of fixing them.

**Proposal.** Replace with a three-tier *information* model that never reads hidden state:

| Tier | Sees | How |
|---|---|---|
| Easy | Only currently-visible enemies; attacks the nearest *visible* building or probes start locations | `probe` mode, scout disabled |
| Normal | Currently-visible + remembered scouted buildings + last-seen army positions with decay | `memory` mode, one scout |
| Hard | Same as Normal but with a **scouting program**: dedicated scouts, expansion denial, and full use of `knownBuildings` | `memory`+, two scouts |

Hard gets its edge from *acting on information faster* (reaction latency 2 s vs 6 s vs 12 s) and
from better build orders — not from seeing through fog. This is both fairer and harder to exploit.

### 3.4 Matches must always resolve — **change (add a rule)**

**Problem.** 50 % of AI-vs-AI matches run forever [E11] because a player with no harvesters and no
income is not "defeated" by `winCheckSystem` (which only checks for a living HQ).

**Proposal.** Add a **stalemate clock**: if a player has had no income event (`manaDeposited` /
`manaConjured`) for **180 s** and owns no harvester and cannot afford one, they are eliminated with
a `playerDefeated` event and reason `bankrupt`. This is not a new mechanic players interact with —
it is a correctness guard that prevents unending matches. It also protects multiplayer.

### 3.5 Attack tells and projectile speeds need a readability pass — **minor change**

**Problem.** `arcane_bolt` travels at **1200 world units/s** (`data/projectiles/arcane_bolt.json`),
i.e. a 132-unit archer shot lands in 0.11 s. At 20 Hz that is ~2 ticks — visually a hitscan. The
Arcane Sentry fires the same projectile every 2 ticks.

**Proposal.** Slow bolts to 520–700 u/s (still fast, still readable), keep the sentry's own rate.
Pure presentation change; no balance impact because damage is applied on impact either way. This is
the single cheapest "feels better" win in the game.

### 3.6 The `astral_spire` cost/time wall — **keep, but surface it earlier**

**Problem.** Astral Spire costs 4500 mana and 45 s, and it gates *all four* spells including the
basic utility ones (`aegis_ward`, `blink_gate`). Nothing in the UI tells a new player that the cool
spell chips they see at match start will be locked for 10+ minutes.

**Proposal.** Rules unchanged; add a visible tech-path preview in the build menu ("Astral Spire
unlocks Aegis / Blink / Meteor / Lance"). Zero balance risk, large clarity win.

### Explicitly **not** changing

Single resource; armor/counter `vs` table; power-offline rules; building footprints and costs
(except the §3.1 pacing retune); the 2.5D-only camera; the 20 Hz tick; fog/ghost semantics; the
win condition (HQ destruction); unit roster and abilities; spells' damage/cooldowns; the
lockstep protocol's semantics.

---

## 4. v2 architecture

### 4.1 Goals, in priority order

1. **Same rules, provably.** A conformance suite runs v1 and v2 side by side on the same command
   stream and asserts identical outcomes for every rule in the inventory.
2. **Much better frame time** on a 1366×768 Chromebook and a 667×375 phone.
3. **An AI that is fun**: builds an army, attacks in waves, defends, expands, uses spells, and
   *always finishes* — at three honestly distinct difficulties.
4. **A large visual upgrade** without abandoning the 2.5D oblique identity.
5. **Nothing lost**: every row of `FEATURE_INVENTORY.md` exists.

### 4.2 Module layout

```
v2/src/
  core/           constants, projection (2.5D only), coords, math, rng, time
  data/           zod schemas, loader, registry, balance (content stays JSON in v2/data/)
  sim/            PURE. no DOM, no Date, no Math.random. lint-enforced like v1
    state/        GameState + typed entity table (Structure-of-Arrays, not Map<string,obj>)
    systems/      one file per system, fixed order declared in one place
    commands/     one handler per command, exhaustive switch
    queries/      index-backed accessors (no full scans)
    hash/         rolling per-tick hash for lockstep
  ai/             PURE command emitters. Deterministic. No reads of hidden state.
    perception/   fog-filtered world model + memory with decay
    economy/      build-order planner, harvester allocation
    military/     threat assessment, wave planner, target selection
    strategy/     data-driven openings per difficulty
  render/         Pixi v8. batched, instanced, texture-atlas based
    terrain/      chunked, pre-rendered, cached
    sprites/      atlas-driven, no per-entity texture generation
    vfx/          pooled emitters
    hud/          DOM, but rebuilt once and diffed
  ui/             screens, lobby, gallery, sandbox
  net/            lockstep client, transport, protocol (wire-compatible with v1 relay)
  app/            orchestration only
```

### 4.3 Architectural decisions and why

**D1 — Entity storage: Structure-of-Arrays over `Map<id, Entity>`.**
v1's `entitiesSorted()` allocates and sorts a key array *on every call* (`queries.ts:29-32`), and it
is called from inside per-entity loops (e.g. `auraSystem` calls it twice per tick, `superpowerSystem`
once per beam). At 187 entities the stress test already spends 7 ms/tick [E7]. v2 stores entities in
dense typed arrays with a stable id→slot index, so iteration is a linear scan with no allocation and
sorting is only needed at hash time. **Expected: 3–5× less sim time at the same entity count.**

**D2 — Spatial index owned by the sim, rebuilt incrementally.**
v1 rebuilds the spatial hash every tick (`step.ts:39`) and then linearly scans for splash/chain/aura
(`combat-util.ts`, `aura.ts`). v2 keeps a uniform grid updated on move/spawn/death, so splash,
chain, aura, and target acquisition all become O(k) in the query radius.

**D3 — Renderer: texture atlas + instanced sprites, not per-entity procedural textures.**
v1 generates a texture per (art def × team colour × 8 facings) at runtime via a 1322-line canvas
routine and caches them (`shape-sprite.ts`). That is clever but costs first-use stalls and prevents
batching (`renderer.ts` sorts with `sortableChildren` and sets `zIndex` per sprite per frame).
v2 pre-bakes an atlas at build time (an offline script, not hand-written binary), uses one sprite
per entity with a frame reference, and batches by texture. Depth sorting moves to a sorted index
array instead of Pixi's zIndex sort.

**D4 — Terrain: chunked pre-rendered static geometry, drawn once.**
v1 rebuilds `buildTerrainGraphics` once but redraws fog every frame (`fog-draw.ts` with
`visibilityFingerprint` short-circuit) and draws shadows/shape overlays with `Graphics` calls per
entity per frame (`drawShadow` → `this.shadowLayer.ellipse(...)`). v2 renders terrain into cached
tiles and uses a shared shadow texture.

**D5 — HUD: build the DOM once; update with targeted writes.**
v1's `Hud.update()` runs every frame and rewrites `textContent` on many nodes unconditionally
(`hud.ts:379-598`) and rebuilds panel layouts keyed by a string. v2 keeps the same panel semantics
but only writes when a value actually changed, and keeps a single rAF-driven dirty check.

**D6 — AI: perception → intent → command, with an explicit world model.**
v1's AI is a 560-line `behaviors.ts` of conditionals reading `GameState` directly, so fog mistakes
are inevitable. v2 gives the AI a `PerceivedWorld` built *only* from the fog-filtered view plus a
decaaying memory, and every decision reads that. Difficulty then tunes perception and reaction, not
cheating.

**D7 — Determinism is a first-class subsystem, not a convention.**
`GameState.rngState` is wired and *used* (fixing v1's dead RNG), all iteration is index-ordered, and
`hashState` is incremental (per-entity rolling hash kept up to date on mutation) so lockstep
checksums cost ~0.

**D8 — Keep the v1 wire protocol.**
The relay (`relay/relay-app.mjs`) only sees `{playerId, cmds, forTick}`. v2 emits the same
`Command` shapes, so v1's relay and protocol tests remain valid and v2 can be deployed beside v1
without touching the Railway service. That is a real constraint-saver and avoids re-certifying the
multiplayer path.

---

## 5. AI redesign

### 5.1 Structure

```
PerceivedWorld          (fog-filtered, built each AI tick, cached)
  ├─ myUnits, myBuildings, myResources   (ground truth, free)
  ├─ enemySeen:  {id, defId, pos, hp, tickSeen}
  ├─ enemyMemory: same but age-weighted, positions decay to last-known
  ├─ threatMap:  influence field over 8×8-tile buckets
  └─ economy:    node list with remaining amount + assigned harvesters
        │
        ▼
Intent (one per ~2 s of sim time, i.e. every 40 ticks)
  ├─ opening:    which build order step am I on
  ├─ economy:    harvest allocation, refinery count, expansion decision
  ├─ military:   defend / mass / harass / push / retreat
  └─ tech:       which branch (air, siege, superweapon, defenses)
        │
        ▼
Command[]  (identical command vocabulary to a human)
```

### 5.2 The three difficulties (honest, measurable)

| | **Easy** | **Normal** | **Hard** |
|---|---|---|---|
| Reaction latency | 12 s | 6 s | 2 s |
| Perception | visible-only | visible + memory (30 s decay) | visible + memory (90 s decay) |
| Scouting | none | 1 scout every 45 s | 2 scouts, continuous |
| Build order | fixed, 12 steps | data-driven, 20 steps | data-driven + reactive tech switch |
| Max production buildings | 1 | 2 | 3 |
| Waves | dribbles of 4–6 | coordinated 12–18 | multi-axis 20–30 + harassment |
| Retreats wounded units | no | below 25 % HP | below 35 % HP |
| Defends expansions | no | 2 guards each | 3 guards + a turret |
| Uses spells | never | Meteor on ≥6 clumped, Aegis on 8+ | all four, incl. Blink on siege |
| Superweapon | never | yes, 1 | yes, aimed at economy |
| Deliberate mistakes | 32 % skip chance | 5 % | 0 % |

**Fairness rule (hard requirement).** No difficulty may read an entity that
`isVisibleTo(player, entity)` returns false for, and no difficulty may use the true HQ position
unless it has been scouted. This is enforced by an automated test (§7.3) that runs the AI against a
`PerceivedWorld` proxy which *throws* on any hidden-state read.

### 5.3 Build orders (data, not code)

`v2/data/ai/openings/*.json`, each a list of steps with a precondition predicate name and a
priority. Example (Normal):

```json
{ "id": "standard", "name": "Balanced", "steps": [
  { "build": "attunement_spire", "when": "mana>=750 && !has(attunement_spire)" },
  { "build": "ley_conduit",      "when": "powerUsed+20 > power" },
  { "build": "summoning_circle", "when": "has(attunement_spire) && !has(summoning_circle)" },
  { "train": "wisp",             "when": "harvesters < 4 && has(attunement_spire)" },
  { "build": "arcane_bunker",    "when": "army >= 6" },
  { "build": "resonance_vault",  "when": "harvesters >= 4 && mana >= 1100" },
  { "build": "scrying_obelisk",  "when": "has(attunement_spire) && has(ley_conduit)" },
  { "build": "golem_forge",      "when": "has(ley_conduit)" },
  { "build": "arcane_nexus",     "when": "has(golem_forge) && army >= 12" },
  { "build": "astral_spire",     "when": "has(arcane_nexus) && army >= 18" }
] }
```

The planner evaluates the list top-down each intent tick and issues at most one build command, which
guarantees the AI never batches conflicting constructions.

### 5.4 Combat

- **Threat assessment.** Per-yard threat radius scan; if enemy value inside the radius exceeds
  friendly value × 1.2, switch to `defend`.
- **Massing.** Units gather at a staging point 220 units toward the objective; the AI pushes when it
  has `minPush` units or when it detects the enemy is out of position.
- **Waves.** `wave = floor(idle × waveFraction)`, minimum 8 (Normal) / 12 (Hard).
- **Multi-axis.** Hard splits a wave into 2–3 approach vectors 260 units apart (`approachPoints`).
- **Retreat.** Units under `retreatHp` walk home and the AI does not re-commit them for 10 s.
- **Focus fire.** Target scoring = `threatValue(defId) + 15 × woundedness`, deterministic
  id-tiebreak.
- **Siege handling.** Siege units target defenses first (`isDefenseBuilding`), else the nearest
  economic building; Blink is used to skip a wall.

### 5.5 Determinism of the AI

The AI is a pure function of `(GameState, tick, playerId)`. It uses **no** randomness in v2 —
difficulty comes from latency and mistake *schedules* (a deterministic tick-period skip), not dice.
That makes AI-vs-AI replays exactly reproducible and makes lockstep with AI peers trivially safe
(which v1 already relies on, `lockstep-integration.test.ts`).

---

## 6. Visual upgrade direction

Keep the identity — dark arcane palette, bold silhouettes, oblique 2.5D — and fix the three things
that make v1 look "programmer art":

**V1. Silhouette and material separation.** v1 renders flat colour + black outline (`shape-sprite.ts`
voxel boxes). v2: two-tone shading per face (top / left / right) from a fixed 3-axis light, plus a
1-px inner rim light on team-coloured parts. Same geometry cost, dramatically more readable at
667×375.

**V2. Real terrain with height.** v1 draws a flat checkered platform with a wood-textured side.
v2: cliff faces get banded strata, ramps get a lit surface gradient matched to the slope
(`ramp-slope.ts` already gives the exact surface height — it becomes a shader parameter), and the
ground gets a subtle tiled arcane motif instead of a plain grid.

**V3. Motion.** v1 units glide (`DISPLAY_SMOOTH_HZ` exponential smoothing) with a static texture.
v2: 4-frame walk cycles for 8 facings baked into the atlas (bob + limb offset), attack poses driven
by the existing `attackFx` timing, and hit-flash. This is the largest perceived-quality jump per
unit of work.

**V4. VFX.** v1 has five bespoke 450–600-line VFX modules. v2 replaces them with a single pooled
particle/beam system driven by data (`v2/data/vfx/*.json`), so adding a new tower's look is data,
not a 500-line file.

**V5. UI.** The HUD stays DOM (it is 0.003 ms to layout and perfectly accessible) but gets a proper
design system: 8-pt spacing scale, three type sizes, one accent per player, and real touch targets
(≥44 px) on the compact layout. The `cmd-card` 0-height bug (§10.1) disappears because the panel is
rebuilt around CSS grid with explicit row definitions.

---

## 7. Test and proof strategy

The standing rule is "prove it". Each phase must produce artifacts, not assertions.

### 7.1 Test layers

| Layer | What it proves | Tool | Gate |
|---|---|---|---|
| **Unit** | each system in isolation | Vitest | 100 % of inventory rules have a unit test |
| **Conformance** | v2 matches v1 rule-for-rule | Vitest, both sims in one process | **the key new suite** (§7.2) |
| **Determinism** | identical hash for identical input | Vitest | 2 runs × 1200 ticks, plus 4-peer lockstep |
| **AI behaviour** | AI resolves, scales, and is fair | Vitest harness | see §7.3 metrics |
| **Perf** | frame/tick budgets | Vitest + Playwright trace | §7.4 budgets |
| **E2E** | real browser flows | Playwright | every screen, 4 viewports |
| **Visual** | look matches intent | Playwright screenshots | diffed against committed goldens |

### 7.2 Conformance suite (the "same rules" proof)

`v2/tests/conformance/*.test.ts`. For each rule, a scripted match is played in **both** v1 and v2
from the same seed and command list, and the two final states are compared on a normalized
projection (positions rounded to 0.01, HP to integer, entity sets compared by `defId`+owner+order):

```
rule: "archer does 1.2× to light armour"
  v1: 16 dmg × 1.2 = 19.2 → imp (90 HP) survives at 70.8
  v2: must equal 70.8
```

If a rule is *deliberately* changed (§3), the conformance test asserts the **new** number and the
test name links to the plan section. That way every deviation is documented in code rather than
forgotten.

### 7.3 AI quality gates (automated, in CI)

`v2/tests/ai/*.test.ts` — the following must all pass or the build fails:

| Gate | Threshold |
|---|---|
| Match resolution | **100 %** of 5 seeds × 3 difficulty pairings end within 15 sim-minutes |
| Seed variety | at least 3 distinct winners across 5 seeds at equal difficulty |
| Army scale | peak army ≥ 40 units for Hard by 8 minutes |
| No hidden-state reads | `PerceivedWorld` proxy throws on out-of-sight reads → 0 throws in 10 matches |
| Difficulty ordering | Hard beats Normal ≥ 80 % over 10 seeds; Normal beats Easy ≥ 80 % |
| No deadlock | 0 matches end with a player holding 0 harvesters and no income for > 180 s |
| Economy curve | Hard reaches 4 harvesters before 90 s; Normal before 120 s |

### 7.4 Performance budgets (pass/fail, not "looks fine")

Measured with a Playwright harness that runs a **scripted 40-unit battle** and records
`requestAnimationFrame` deltas plus `performance.measure` around `sim.step()` and `renderer.render()`:

| Budget | Chromebook 1366×768 | Phone 667×375 @2× | Desktop 1920×1080 |
|---|---|---|---|
| Frame time p95 (real GPU) | ≤ 16.7 ms | ≤ 16.7 ms | ≤ 16.7 ms |
| Frame time p99 | ≤ 33 ms | ≤ 33 ms | ≤ 33 ms |
| Sim ms/tick @ 187 entities | ≤ 1.5 ms | ≤ 1.5 ms | ≤ 1.5 ms |
| JS render ms/frame @ 187 entities | ≤ 4 ms | ≤ 4 ms | ≤ 6 ms |
| First-load JS (gzip) | ≤ 150 kB | ≤ 150 kB | ≤ 150 kB |
| Time to interactive (cold, Fast 3G) | ≤ 6 s | ≤ 6 s | ≤ 6 s |
| Memory after 20 min | ≤ 250 MB | ≤ 180 MB | ≤ 350 MB |

v1 baselines to beat: sim 6.995 ms/tick at 187 entities [E7]; bundle 236.7 kB gzip main chunk [E3];
precache 1352.79 KiB.

**Honest caveat:** the audit container has no GPU, so the *frame-time* budgets can only be verified
on real hardware. §13 lists this as an open item. The sim/bundle/memory budgets *are* verifiable
here and will be enforced in CI.

### 7.5 Visual proof

Every phase ships a screenshot/video gallery at the four target sizes
(667×375, 844×390, 1366×768, 1920×1080) under `v2/docs/proof/phase-N/`, plus a 10–20 s screen
recording of the new behaviour. The v1 baseline images are already committed at
`v2/docs/baseline-screenshots/` (36 images, 5 per viewport across 9 states).

---

## 8. Build phases with done-criteria

Each phase ends with: all tests green, `npm run lint`, `npm run typecheck`, a perf number against
the §7.4 budget, and committed proof artifacts. No phase starts before the previous one's criteria
are met.

### Phase 1 — Foundation (no gameplay)
- Repo scaffold under `v2/`, Vite + TS strict + Vitest + Playwright, own Cloudflare Pages target.
- `src/sim` purity lint rules ported (import bans + `Math.random`/`Date`/`DOM` bans).
- Deterministic RNG that is **actually consumed**; seeded map/starting-state variation.
- `hashState` with incremental rolling hash.
- Data pipeline: Zod schemas + loader + registry for all v1 content, byte-identical values.
- **Done:** `v2` builds; all content loads; schema rejects a deliberately corrupted file with a
  file+path error; 30+ schema/registry tests pass; `npm run lint` clean.

### Phase 2 — Simulation core
- SoA entity store, spatial grid, flow-field pathing, nav/height grid, command handling for all
  **23 player commands + 12 dev commands**, all 17 systems in the v1 order.
- **Done:** conformance suite covers **every rule in §4–§15 of the inventory** and passes;
  determinism test (2 runs, 1200 ticks, identical hash); 4-peer lockstep to 1200 ticks;
  sim ≤ 1.5 ms/tick at 187 entities.

### Phase 3 — Renderer and art
- Atlas build step, batched sprites, chunked terrain, pooled VFX, camera, fog, minimap.
- Visual upgrade V1–V4.
- **Done:** all inventory §13 and §20 rows implemented; visual golden screenshots at 4 sizes;
  JS render cost ≤ 4 ms/frame at 187 entities; 60 fps verified on a real GPU machine.

### Phase 4 — UI, HUD, and screens
- Menu, lobby, settings, pause, result, coach, gallery, sandbox (all 10 tabs).
- **Done:** every inventory §2, §3, §8, §9, §10, §11 row implemented; Playwright covers every
  screen at 4 viewports with zero page errors; HUD occupancy ≤ 18 % of a 667×375 screen;
  no element overflows the viewport at any of the 4 sizes (automated geometry assertion).

### Phase 5 — AI
- Perception model, planner, combat, all three difficulties, openings as data.
- **Done:** every §7.3 gate passes in CI; two 10-minute AI-vs-AI matches recorded as video at
  1366×768 showing real waves, defense, expansion, and a decisive ending.

### Phase 6 — Multiplayer
- Lockstep client + relay compatibility (same wire protocol), rejoin, stall handling.
- **Done:** 2/3/4 human peers in real browsers stay in sync for 5 minutes (checksums match);
  forced desync is detected and reported with a replay; tab-background/resume does not stall;
  rejoin restores a live match.

### Phase 7 — PWA, polish, performance
- Manifest, SW, install prompt, orientation lock, resume handling, audio.
- **Done:** installable on Android Chrome + desktop Chromium; cold-load TTI ≤ 6 s on Fast 3G
  throttling; all §7.4 budgets met; 20-minute memory soak passes.

### Phase 8 — Balance and final proof
- Full conformance re-run, balance harness across 5 seeds × 3 pairings, final video suite.
- **Done:** every inventory row `[x]` or `[~]` with a linked justification; final report with
  measured before/after tables.

---

## 9. Audit harnesses committed with this phase

All under `v2/audit/`, runnable but outside v1's test glob (so v1 CI is untouched):

| File | What it measures | Command |
|---|---|---|
| `audit-bench.test.ts` | sim ms/tick over 20 sim-minutes | `npx vitest run tests/audit-bench.test.ts`* |
| `audit-ai-sweep.test.ts` | resolution rate, stall rate, peak units across pairings/seeds | same |
| `audit-ai-trace.test.ts` | per-minute economy/army trace | same |
| `audit-mana-stall.test.ts` | harvester/node/spire state at the stall point | same |
| `audit-load.test.ts` | sim cost at 187 entities; 4-player AI load | same |
| `audit-pace.test.ts` | scripted build-order timings | same |
| `verify-claims.test.ts` | seed-independence proof | same |
| `verify-econ.test.ts` | real mana/s per wisp | same |
| `count-commands.mjs` | enumerates the Command union | `node v2/audit/count-commands.mjs` |
| `audit-baseline.mjs` | 36 baseline screenshots + frame pacing | `node v2/audit/audit-baseline.mjs` |
| `audit-baseline-2.mjs` | lobby / gallery / HUD states | `node v2/audit/audit-baseline-2.mjs` |
| `audit-baseline-3.mjs` | HUD geometry audit, build flow | `node v2/audit/audit-baseline-3.mjs` |
| `audit-ui-overlap.mjs` | hit-testing / overlap proof | `node v2/audit/audit-ui-overlap.mjs` |
| `audit-render-cost.mjs` | canvas size, DOM count, long tasks | `node v2/audit/audit-render-cost.mjs` |

\* The `*.test.ts` harnesses import from `../src`, so they must be copied into `tests/` to resolve;
they are kept in `v2/audit/` so v1 CI never picks them up. Copy → run → remove. The four
browser-driven `*.mjs` harnesses run in place from the repo root against a live dev server.

---

## 10. Known bugs, weak spots and things that feel bad

Each item has the evidence that established it.

### 10.1 [BUG — blocking] Tutorial card steals clicks from the build-confirm bar on phones
At 667×375 and 844×390 the `.coach-card` sits in the bottom-centre band. `elementFromPoint` at the
centre of the **Place** button returns `BUTTON.btn.coach-skip` ("Skip tutorial"), not the Place
button. Playwright cannot click Place at all (4 s timeout) [E16].
Consequence: a new player on a phone who follows the tutorial literally cannot place their first
building with the Place button. They must first dismiss the coach or tap the map directly.
Evidence: `v2/audit/audit-ui-overlap.mjs` output —
`"placeHitTest": {"same": false, "topClass": "btn coach-skip", "topText": "Skip tutorial"}`,
`"placeClick": "failed: TimeoutError"`.
Root cause: `.coach-card--cmd` uses `bottom: 8px` (`hud.css:1112`) with `z-index: 18`
(`hud.css:1102`), and `.build-confirm` is bottom-anchored at `bottom: var(--hud-gap)` with
`z-index: 13` (`hud.css:885-897`) — so the coach sits on top and eats the click.

### 10.2 [BUG — critical] AI deadlocks; half of all matches never end
8 of 16 AI-vs-AI runs stall with flat mana for >3 simulated minutes and never resolve [E11].
At the stall, player0 has **0 harvesters**, 10 mana, and 8 nodes holding 70 000+ mana [E14].
Cause: harvesters are killed, the AI's `assignHarvesters` only assigns *idle* harvesters it already
owns (`behaviors.ts:51-63`), and nothing re-trains them once mana is gone. `winCheckSystem` only
looks at HQ ownership, so the match never terminates.

### 10.3 [BUG — critical] The match seed has no effect on anything
`rngState` is set from the seed and threaded through state, hashed for lockstep, and reported in
diffs — but **`nextRandom` is never called in `src/`** [E12]. Two matches with seeds 1 and 99999
produce identical state after 1200 ticks with different (unused) `rngState` values [E13].
Player-visible consequence: every match plays out identically for a given lobby configuration;
"seed" in the lobby is decorative.

### 10.4 [BUG] Every difficulty knows where your HQ is
`omniscientEnemyHq()` is called unconditionally in `behaviors.ts:226` (`decideSpells`),
`behaviors.ts:369` and `:463` (`decideCombat` / `issuePush`) regardless of the `intel` profile.
So Easy and Normal also aim at the true HQ position through fog. Combined with Hard's
`intel: 'omniscient'`, the AI's "skill" is largely maphack.

### 10.5 [BUG] `MAX_UNITS_PER_PLAYER` is declared but never enforced
`src/core/constants.ts:21` declares `MAX_UNITS_PER_PLAYER = 90` with the comment "Practical unit
caps (mobile performance budget)". Grepping `src/` finds **no other reference** [E15]. Neither
`handleProduce` nor `spawnFreeUnit` checks it, so the documented performance budget does not exist.

### 10.6 [BUG] Desktop build panel collapses to zero height
`.cmd-card` measures `height: 0` at 1366×768 and 1920×1080 (`getBoundingClientRect() → h: 0`) [E17],
even though its children are laid out. It is `position:absolute` with `height:auto` inside a
`display:flex` parent and only `max-height` — the flex parent gives it no height. Visually the build
list still renders (it overflows), so this is a layout-integrity bug that makes the card
un-scrollable and its hit area wrong rather than an obvious blank panel.

### 10.7 [Weak spot] Harvest income is far below its stated rate
Configured 16 mana/s; measured **3.75 mana/s** per wisp because siphon only accrues during node
contact [E10]. The `balance.json` number is therefore misleading to anyone tuning the game, and the
opening 2–3 minutes are dead time [E9].

### 10.8 [Weak spot] Projectiles are effectively hitscan
`arcane_bolt` speed 1200 u/s; archer range 132 ⇒ flight time 0.11 s ≈ 2 ticks [E18]. Attack
readability (and therefore the value of the recently added attack tells) is undermined.

### 10.9 [Weak spot] Per-frame full-entity work with allocation churn
`entitiesSorted()` allocates a new array and sorts it on **every call** (`queries.ts:29-32`).
There are **33 call sites**, 21 of them inside `src/sim/systems/` (aura ×3, beam-weapon ×7,
harvest ×4, combat ×3, movement ×3, and 2 each in garrison, morph, production, projectile,
superweapon, channel). At 187 entities the measured cost is 6.995 ms/tick [E7], i.e. 14 % of the
tick budget on this CPU — and a school Chromebook's CPU is 3–5× slower.

### 10.10 [Weak spot] Renderer redraws per-entity vector art every frame
`drawShadow()` calls `this.shadowLayer.ellipse(...)` per unit per frame; overlay/selection rings are
pooled but re-issued each frame; `n.sprite.zIndex = depth` forces Pixi's per-frame sort [E19].
At 1920×1080 the same code path costs ~9.9 fps on SwiftShader vs 14.4 at 667×375 [E6] — the cost
scales with pixels, confirming it is fill/geometry bound.

### 10.11 [Weak spot] 848 kB main chunk / 1.35 MiB precache
`vite build` reports a single 847.80 kB chunk (236.70 kB gzip) and the PWA precaches 1352.79 KiB
[E3]. On school wifi, first load is several seconds before anything renders.

### 10.12 [Weak spot] AI never exceeds ~28 units and never uses its own design cap
Peak units across 16 matches: **28** [E11]. `armyThreshold` for Hard is 16 and every production gate
is expressed as a fraction of it, so the AI structurally cannot reach the 90-unit cap.

### 10.13 [Weak spot] No research content despite a full research system
`ResearchDef`, schemas, `researchQueue`, `handleResearch`, `building-actions-panel.ts` buttons and
`modifiers.ts` resolution all exist — but `data/research/` does not exist, so the feature is dead
code with no player-visible content [E20]. The Arcane Nexus description even promises "future
research upgrades".

### 10.14 [Weak spot] One map, one faction
`data/maps/` has a single 128×88 map; `data/factions/` a single faction. The lobby exposes both
pickers, so both are single-option dropdowns — visible but pointless.

### 10.15 [Minor] `attackFx` and turret crystal audio are hardcoded per def
`crystalIndex % 3` pitch cycling and three attack-tell kinds are baked into render/audio rather
than data, which is why the five VFX modules are 450–600 lines each.

### 10.16 [BUG — onboarding] The lobby opens already showing a red error
On a fresh "Custom Game" the lobby immediately renders `validation.errors[0]` in the error style
because the default slots have `startIndex: null` (`build-config.ts:98-105`). The user has done
nothing wrong yet, but the first thing they read is a red
*"Every player needs a start corner. Tap a slot, then tap a number on the map."*
(`match-lobby.ts:489-494`).
Evidence: `baseline-screenshots/phone-667x375--10-lobby.png` and the other three
`--10-lobby.png` captures all show the red line plus a disabled Start button before any interaction.
Fix for v2: neutral instructional state until the user attempts to start, or auto-assign the first
available corner per slot on load.

### 10.17 [Minor] `docs/ARCHITECTURE.md` is out of date
It documents 12 systems in the tick order; `step.ts` runs 17 (adds `morph`, `beamWeapon`,
`garrison`, `superweapon`, `aura`, `channel`, `sandboxEconomy`). A rebuild must not inherit this
drift.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Rewriting 29 k lines is a large surface | conformance suite gates every phase; v1 stays deployed |
| Visual upgrade regresses frame time | perf budgets are pass/fail in CI from Phase 3 |
| AI rewrite makes matches too easy/hard | automated ordering gate (Hard>Normal>Easy ≥80 %) |
| Lockstep changes break online play | keep the v1 wire protocol; relay untouched |
| Canvas GPU differences | verify on real hardware; SwiftShader used only for relative comparison |
| Sandbox/QA tooling lost | inventory §11 is a hard checklist; sandbox ships in Phase 4 |

---

## 12. Evidence index

Commands were run in `/workspace` on the audit VM. Outputs quoted are verbatim excerpts.

**[E1] Unit tests** — `npm test`
```
 ✓ 64 test files, Tests  431 passed (431), Duration 27.82s
```

**[E2] E2E** — `npx playwright test`
```
Running 6 tests using 2 workers … 6 passed (29.4s)
```

**[E3] Production build** — `npm run build`
```
dist/assets/index-B34qHjoz.js   847.80 kB │ gzip: 236.70 kB
(!) Some chunks are larger than 500 kB after minification.
PWA precache  20 entries (1352.79 KiB)
```

**[E4] Browser GPU** — `node -e` querying `WEBGL_debug_renderer_info`
```
{ "renderer": "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
  "cores": 4, "mem": 16 }
```

**[E5] Sim benchmark** — `audit-bench.test.ts`
```
BENCH {"ticks":24000,"ms":4626.7,"msPerTick":0.1928,"tickBudgetPct":0.39,
       "entities":21,"units":3,"buildings":5,"ended":false,"finalTick":24000}
```
Note: after 20 simulated minutes only 3 units and 21 entities existed and the match had not ended.

**[E6] Frame pacing** — `audit-baseline.mjs` → `v2/docs/baseline-perf.json`
```
desktop-1920x1080  idle avg 100.85 ms (9.9 fps) p95 200 ms
                   zoomOut avg 117.99 ms (8.5 fps)
phone-667x375      idle avg 69.25 ms (14.4 fps) p95 133 ms
```
Captured with SwiftShader; see §2.2.

**[E7] Load benchmark** — `audit-load.test.ts`
```
LOAD   {"entities":187,"ticks":600,"ms":4196.9,"msPerTick":6.995,"tickBudgetPct":14,
        "realtimeFpsCeiling":143}
LOADAI {"ms":731,"msPerTick":0.609,"entities":41}
```

**[E8] Render-side cost** — `audit-render-cost.mjs`
```
phone-667x375    canvas {w:1334, h:750}  css {667,375}  domNodes 174  hudButtons 35
phone-844x390    canvas {w:1688, h:780}  css {844,390}
chromebook       canvas {w:1366, h:768}
longTasks: {count: 0} at every viewport; forced layout 0.003 ms
```

**[E9] Pacing** — `audit-pace.test.ts`
```
PACE {"startingMana":900,"siphonPerSecond":16,"wispCarry":75,
      "spireCompleteSec":8.1,"circleCompleteSec":52.3,"tenImpsSec":159.1,
      "finalMana":6695,"finalUnits":15}
```

**[E10] Real harvest rate** — `verify-econ.test.ts`
```
ECON {"totalManaAfter60s":225,"manaPerSecOneWisp":3.75,
      "siphonPerSecondConfigured":16,"spireToNodeDist":272}
```

**[E11] AI sweep** — `audit-ai-sweep.test.ts`
```
SUMMARY {"total":16,"resolved":8,"stalled":8,"peakUnitsMax":28}
hardvhard    seed 1..4 → ended:false, 30 min, peakUnits 25, h0 0, h1 0, stall:true, winner null
normalvnormal seed 1..4 → ended:false, 30 min, peakUnits 20, stall:true, winner null
hardvnormal  seed 1..4 → ended:true, 6.2 min, winner 0 (identical for every seed)
easyveasy    seed 1..4 → ended:true, 6.9 min, winner 0 (identical for every seed)
```

**[E12] RNG is never consumed** —
`grep -rn "nextRandom|new Rng|rngState" src/` returns only `rng.ts` (definition),
`types.ts`/`factory.ts` (state field), and `sync-delta.ts`/`sync-surface.ts` (state copying).
No call site in any system, AI, or factory path.

**[E13] Seed independence** — `verify-claims.test.ts`
```
SEEDCHECK {"manaA":[400,175],"manaB":[400,175],"entA":27,"entB":27,"rngA":1,"rngB":99999}
```

**[E14] Stall forensics** — `audit-mana-stall.test.ts` at 5 sim-minutes, player0
```
"mana": 10
"wisps": [ { "defId": "arcane_archer", … }, { "defId": "imp_swarmling", … } ]   // zero harvesters
"nodes": 13 nodes, corner nodes still hold 9525 / 12000 / 12000 / 9606 mana
```

**[E15] Unit cap not enforced** —
`grep -rn "MAX_UNITS_PER_PLAYER" src/ | grep -v constants.ts` → no output.

**[E16] Tutorial steals clicks** — `audit-ui-overlap.mjs`
```
"placeHitTest":      {"same": false, "topTag": "BUTTON",
                      "topClass": "btn coach-skip", "topText": "Skip tutorial"}
"placeClick":        "failed: TimeoutError: locator.click: Timeout 4000ms exceeded."
```
(fails identically at 667×375 and 844×390; passes at 1366×768 and 1920×1080 where the coach has
already been dismissed)

**[E17] Zero-height command card** — `audit-baseline-3.mjs`
```
chromebook-1366x768  ".cmd-card": {x:1090, y:42, w:272, h:0}
desktop-1920x1080    ".cmd-card": {x:1644, y:42, w:272, h:0}
```

**[E18] Hitscan projectiles** — `data/projectiles/arcane_bolt.json` `"speed": 1200`;
`data/units/arcane_archer.json` `"range": 132` ⇒ 132/1200 = 0.11 s ≈ 2.2 ticks at 20 Hz.

**[E19] Per-frame redraw** — `src/render/renderer.ts:430-433`
```ts
private drawShadow(worldX: number, worldY: number, radius: number): void {
  const p = this.groundPos(worldX, worldY);
  this.shadowLayer.ellipse(p.x, p.y + 2, radius * 0.55, radius * 0.28).fill({ color: 0x000000, alpha: 0.28 });
}
```
called from the per-entity loop at `renderer.ts:548`; depth is written per sprite per frame at
`renderer.ts:522` inside a `sortableChildren` container (`renderer.ts:159-162`).

**[E20] No research content** —
`ls data/research` → `No such file or directory`, while `src/data/loader.ts:55` handles
`/research/` and `src/ui/hud/building-actions-panel.ts:74` builds buttons from
`registry.research.values()`.

**[E21] Lobby red-error-on-first-paint** — `src/ui/match-lobby.ts:489-494`
```ts
const validation = validateLobby(this.state, this.opts.mode, map, this.opts.localSlotId);
if (this.errorText) { this.setHint(this.errorText, true); }
else if (!validation.valid) { this.setHint(validation.errors[0] ?? 'Invalid setup', true); }
```
with `defaultLobbyState()` (`src/lobby/build-config.ts:98-105`) setting `startIndex: null` for every
slot. Visible in all four `v2/docs/baseline-screenshots/*--10-lobby.png` captures.

---

## 13. What I could NOT verify in this run

Stated plainly, per the standing rule:

1. **Real-device frame rate.** The audit VM has no GPU (SwiftShader, [E4]). I measured *relative*
   frame pacing and CPU-side costs, but I cannot state v1's fps on a real Chromebook or phone.
   The §7.4 frame-time budgets therefore require a real-hardware run in Phase 3.
2. **Live multiplayer against the deployed Railway relay.** I verified the relay logic with
   `tests/relay-lobby.test.mjs` (12 tests) and 2/3/4-peer lockstep determinism in-process
   (`tests/lockstep-integration.test.ts`, 4 tests) — both green [E2-adjacent]. I did **not** connect
   two real browsers to the production Railway URL in this run.
3. **The live Cloudflare Pages deployment (`wizz-aw8`).** Not exercised; the local production build
   was verified instead [E3].
4. **Touch gestures on physical hardware.** Gesture FSM is unit-tested (`tests/gesture.test.ts`,
   9 tests) and the mobile viewports were driven with Playwright's touch emulation, but no real
   finger input was tested.
5. **Audio output.** The procedural audio runs (no page errors) but I cannot verify what it sounds
   like.
6. **Balance feel.** I measured pacing numerically; whether the result is *fun* needs playtesting.

---

## 14. Open questions only Zachary can answer

1. **Visual direction.** Do you want to keep the current "flat shapes + bold outline" language and
   simply polish it (lower risk, closer to v1), or move toward richer illustrated 2.5D sprites
   (bigger perceived jump, but every unit/building needs new art)? The plan is written for the
   polish-first path with atlas-ready hooks; the other path changes Phase 3 substantially.
2. **Art production.** Should v2 ship **procedurally generated** art (as v1 does — no binary assets,
   tiny bundle, fully team-colourable) or may it include authored sprite sheets? Procedural keeps the
   bundle small and the palette consistent; authored art looks better but adds megabytes and asset
   pipeline work — which matters on school Chromebooks.
3. **Rule changes in §3.** Do you accept 3.1 (harvest rate), 3.2 (soft harvester cap), 3.3 (no
   maphack), 3.4 (bankruptcy elimination), 3.5 (slower bolts)? 3.3 and 3.4 are the ones that change
   how matches feel; 3.1 is the one that changes pacing most.
4. **Match length target.** With the reworked AI, what is the ideal 1v1 length — 8 minutes (snappy,
   school-friendly) or 15–20 (full tech tree incl. superweapons)? This directly sets the economy
   constants and the AI's tech timing.
5. **Research tree.** `data/research/` is empty but the whole system exists. Should v2 ship an
   actual research tree (e.g. +damage, +armour, faster harvest at the Arcane Nexus), or delete the
   dead system? Shipping it adds content and depth; deleting it reduces surface area.
6. **More maps and factions.** v1 ships one map and one faction. Is content expansion in scope for
   v2, or strictly a like-for-like rebuild?
7. **Multiplayer scope.** Keep 2–4 player lockstep over the existing Railway relay? Or is 1v1 the
   only supported mode and the rest is best-effort?
8. **Deployment.** Should v2 deploy to a **separate** Cloudflare Pages project (e.g.
   `wizz-aw8-v2`) so the live game is never at risk, with a cutover only after you approve? My
   recommendation is yes.
9. **Sandbox.** Keep the full developer sandbox in v2 (it is 8 files, ~39 tests, and the main QA
   tool), or is it out of scope for a shipped rebuild?
