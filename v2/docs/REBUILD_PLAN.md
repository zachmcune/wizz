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
| Content | 10 units, 19 buildings, 4 spells, 6 projectiles, 1 map, 4 match presets, 2 AI strategies | `data/**` |

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

## 3. Rule changes: decisions (settled)

Zachary reviewed the six proposals and **accepted two, rejected four**. This section records the
decision and, for the rejected ones, exactly how v2 satisfies the underlying concern without
changing the rule.

### 3.1 Harvest pacing — **REJECTED (rule unchanged)**

**v1 rule (keep exactly):** `siphonPerSecond: 16`, `wisp.carry: 75`, `wisp.speed: 72`,
`manaNodeCapacity: 12000`, `vaultSiphonMultiplier: 1.3`, starting mana 900. No soft harvester cap.
No change to travel, carry, node capacity, or costs.

**Is the 16/s rate "wrong"? No — it is exactly implemented.** Verified by per-tick instrumentation
of the harvest cycle [E22]:

| Observation | Measured |
|---|---|
| Carry during node contact | 0 → 16 → 32 → 48 → 64 → 75 at exactly **1 s** intervals |
| Time to fill 75 at the configured rate | 4.69 s (75 / 16) |
| Siphon duty cycle on a realistic ~82-unit haul | **85.4 %** → **13.1 mana/s** |
| Siphon duty cycle on a deliberately long 320-unit haul | 27.4 % → 4.4 mana/s |

So `siphonPerSecond` is **honoured exactly**; the lower whole-economy number I reported in phase 0
(3.75 mana/s) was the *round-trip-average* on a badly-placed refinery, not a rate bug. The
configured value governs only the contact phase, which is the intended RA2-style model: income is
*meant* to depend on refinery placement and haul distance. **This is design, not a bug, and v2 keeps
it verbatim.**

**What v2 fixes instead (bugs, not rules):**

- **Placement guidance.** v1 gives no indication that refinery distance matters. v2's placement
  preview shows the effective mana/s for the spot under the cursor, so players can see the trade-off
  instead of discovering it by feel. Presentation only; the rule is untouched.
- **The AI's refinery placement.** v1's AI calls `findPlacement` around the HQ with no regard for
  node distance (`ai/shared.ts` `searchPlacementRings` walks rings 2..16 from the centre and takes
  the first legal tile). On a bad map seed this alone can halve its income. v2's AI scores candidate
  placements by haul distance. **This is a genuine v1 AI bug** and is the main reason its economy
  collapses; fixing it is the correct remedy rather than raising the harvest rate.
- **Opening dead time is a UI/onboarding problem, not an economy problem.** v1's coach says "build
  an Attunement Spire" but not "put it next to the node". v2's coach does.

### 3.2 Soft harvester cap — **REJECTED (rule unchanged)**

No harvester cap beyond the existing per-refinery docking behaviour. Any number of wisps may work a
node; `vaultSiphonMultiplier: 1.3` applies per wisp exactly as in v1.

*(Consequence accepted: a Vault-backed economy can scale steeply. v2 compensates only through AI
quality and map design, never by changing the multiplier.)*

### 3.3 No AI fog cheating at any difficulty — **ACCEPTED**

**v1 problem.** `omniscientEnemyHq()` is called unconditionally at three sites
(`ai/behaviors.ts:226, 369, 463`) regardless of the `intel` profile, and Hard uses
`intel: 'omniscient'` (`ai/difficulty.ts:138`). So *every* difficulty aims at the true HQ through
fog.

**v2 rule.** No AI difficulty may read any entity, position, or building that the player could not
see. Concretely:

| Tier | Sees | Learns by |
|---|---|---|
| Easy | Currently-visible enemies only; attacks nearest *visible* target or probes known start locations | nothing retained |
| Normal | Visible now + scouted buildings + last-seen army positions with a 30 s decay | one scout |
| Hard | Visible now + scouted buildings + last-seen positions with a 90 s decay | two scouts, continuous |

**Enforcement (not just intent).** The AI receives a `PerceivedWorld` façade, never `GameState`.
The façade filters through the same `isVisibleTo` the renderer uses, and the test harness swaps in a
**throwing proxy** in place of `GameState` so any hidden-state read fails loudly (§7.3).

**Difficulty is expressed only through legal levers:** reaction latency (12 s / 6 s / 2 s), number of
scouts, build-order sophistication, wave size and coordination, retreat thresholds, and spell usage.
Hard is not given information; it is given *speed and discipline*.

### 3.4 Bankruptcy elimination — **REJECTED (rule unchanged)**

No new elimination rule. `winCheckSystem` keeps its v1 semantics: a player is defeated only when
they hold no HQ (Sanctum / Waystone Camp).

**But matches must still not stall**, so the stall is fixed at its real cause. Phase-0 forensics
showed the stall is *not* a rules problem — it is an AI bug [E11, E14]:

1. The AI assigns harvesters only when they are already `idle` (`ai/behaviors.ts:51-63`). Once its
   wisps are killed it never replaces them, because `produceArmy`'s harvester check
   (`behaviors.ts:187-190`) only *reserves* mana for a wisp when `wispCount < diff.wispTarget` — and
   that reserve is inside the army-production path, which returns early on other conditions.
2. Its refinery placement ignores haul distance (§3.1), so income was already fragile.
3. Nothing re-evaluates "I have no income" as an emergency, so it sits at 10 mana forever.

**v2 fix (AI, plus genuine bugs — no rule change):**

- **Harvester economy is self-healing.** Every intent tick the AI computes `harvesters <
  wantedHarvesters` and, if so, puts a Wisp at the *front* of its production priority with a mana
  reservation. A player with zero wisps will always re-train.
- **No-income is a first-class emergency state** in the planner, ranked above attacking.
- **Refinery placement is scored by haul distance** (§3.1).
- **A stalled AI always has a fallback offensive.** If it cannot grow its army for a configured
  period, it sends what it has at the enemy's last-known position rather than idling.
- **Real bug fixed:** if any path can leave a player with no income *and* no ability to produce
  (e.g. no producer left but an HQ alive), the AI surrenders via the existing `surrender` command.
  Surrender is a v1 command and v1 rule; no new elimination mechanic.

With those fixes, every AI-vs-AI match resolves by *legitimate* means: armies are rebuilt, attacks
continue, and an HQ falls. Phase-5 gate: **100 % of 15 seeded matches terminate inside 20 minutes**
(§7.3), enforced in CI.

### 3.5 Slower projectiles — **REJECTED (rule unchanged)**

`arcane_bolt` stays at **1200 u/s**; all projectile speeds, damage, and cooldowns are unchanged.

**Readability is solved in the renderer instead**, which is where the phase-0 concern actually
belongs: a 2-tick projectile is legible if it is *drawn* legibly. v2 gives fast projectiles a
motion-streak (a velocity-aligned trail spanning several frames of travel) and an impact flash, so
the eye reads the shot even though it crosses the screen in ~0.1 s. No rule, timing, or balance
change.

### 3.6 Surface what the Astral Spire unlocks — **ACCEPTED**

Content and UI only; no numbers change.

- The build menu shows, on the Astral Spire entry, the four spells it unlocks
  (`meteor_storm`, `aegis_ward`, `blink_gate`, `astral_lance`) with their cooldowns.
- The spell chips remain visible but locked, and their tooltip names the prerequisite chain
  (`Arcane Nexus → Astral Spire`) instead of the current generic "unlocks later".
- The tech tree view (new in v2, part of the research feature) shows the same dependency.

### 3.7 Summary table

| # | Proposal | Decision | v2 treatment |
|---|---|---|---|
| 3.1 | Harvest pacing retune | **REJECTED** | v1 values verbatim; fix AI placement + add placement readout |
| 3.2 | Soft harvester cap | **REJECTED** | v1 values verbatim |
| 3.3 | No AI fog cheating | **ACCEPTED** | `PerceivedWorld` façade + throwing-proxy test |
| 3.4 | Bankruptcy elimination | **REJECTED** | v1 win check verbatim; fix AI economy instead |
| 3.5 | Slower projectiles | **REJECTED** | v1 speeds verbatim; renderer-side motion streaks |
| 3.6 | Surface Astral Spire unlocks | **ACCEPTED** | Build menu + spell tooltips + tech tree |

### 3.8 Everything else is unchanged

Single resource; armour/`vs` counter table; power offline rules; all building costs, footprints and
build times; the 20 Hz tick; fog and building-ghost semantics; HQ-destruction win condition; the
unit roster and stats; spell damage and cooldowns; projectile speeds; node capacity; starting mana;
harvest rate and carry; repair and sell ratios.

### 3.9 v1 bugs that v2 must fix (rule-neutral)

These are defects, not design choices. Each is listed with the evidence that established it; §10 has
the full repros.

| Bug | Evidence | Fix in v2 |
|---|---|---|
| Match seed has no effect (`nextRandom` never called) | [E12][E13] | seeded RNG is actually consumed by map/gen/AI tie-breaks |
| `MAX_UNITS_PER_PLAYER = 90` never enforced | [E15] | enforced at production + spawn, with a test |
| Coach card intercepts the Place button on phones | [E16] | coach never overlaps an interactive control; geometry asserted in tests |
| `.cmd-card` collapses to 0 px on desktop/Chromebook | [E17] | explicit grid rows; height asserted at 4 viewports |
| Lobby shows a red error before user input | [E21] | neutral first-run state; corners auto-assigned |
| AI keeps zero harvesters and freezes | [E11][E14] | self-healing economy (§3.4) |
| AI reads hidden state at every difficulty | [E12] | `PerceivedWorld` façade (§3.3) |
| AI refinery placement ignores haul distance | §3.1 | scored placement |

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

### 5.5 Self-healing economy (the anti-stall fix)

Rule changes to the economy were **rejected**, so match termination is an AI-and-bugs problem. The
planner therefore treats economy loss as a top-priority emergency, above any attack decision:

| Priority | Condition | Action |
|---|---|---|
| 0 | no refinery finished | build one at the best-scored node (see below) |
| 1 | `harvesters < wanted` | queue a Wisp, reserving mana for it *before* any army |
| 2 | `harvesters == 0 && mana < wispCost` | sell the least valuable building for the refund |
| 3 | enemy inside the base radius | pull harvesters home, fight with everything idle |
| 4 | no growth possible for N s | attack with whatever exists at last-known enemy position |

**Refinery placement is scored, not first-fit.** v1's `findPlacement` returns the first legal ring
tile radiating from the HQ (`ai/shared.ts` `searchPlacementRings`), which can put a refinery far from
the node it serves and halve income. v2 scores every candidate by
`expectedManaPerSecond(candidate, nearestNode)` — computed from the same travel/siphon model the
simulation uses — then by distance to the HQ, then by tile coordinates for determinism. Given the
measured duty cycle of **85.4 % on an 82-unit haul vs 27.4 % on a 320-unit haul** [E22], this single
change more than triples early income without touching a single balance number.

**Stall freedom is a gate, not a hope.** Phase-5 CI requires 100 % of 15 seeded matches to terminate
within 20 sim-minutes (§7.3). No elimination rule is added; the AI simply keeps replacing workers
and attacking, so an HQ eventually falls.

### 5.6 Determinism of the AI

The AI is a pure function of `(GameState, tick, playerId)`. It uses **no** randomness in v2 —
difficulty comes from latency and mistake *schedules* (a deterministic tick-period skip), not dice.
That makes AI-vs-AI replays exactly reproducible and makes lockstep with AI peers trivially safe
(which v1 already relies on, `lockstep-integration.test.ts`).

---

## 6. Visual upgrade direction

**Decision: illustrated sprites.** v1 draws everything from code (`shape-sprite.ts`, 1322 lines of
procedural canvas drawing). v2 ships **authored illustration** as the primary art path. This is the
largest single change in the rebuild and drives several architectural choices below.

### 6.1 Art pipeline (chosen implementation)

**Decision: illustrated sprites, produced by offline 3D-into-2D rendering.**

v1 drew everything procedurally at runtime (`shape-sprite.ts`, 1322 lines of canvas draw calls) and
the result read as flat programmer art: one fill plus one outline per face, no light direction, and
team colour applied as a whole-sprite tint. v2 bakes proper illustrated sprites instead.

**How the art is authored.** Rather than hand-painting (no tablet or artist in this loop) or
hand-writing thousands of vector paths (enormous and inconsistent), every sprite is described as a
small **assembly of 3D primitives** — boxes, cylinders, cones, prisms, spheres — with per-part
material. `v2/art/mesh.ts` + `v2/art/raster.ts` then render that assembly offline:

```
v2/art/
  mesh.ts        primitives → triangles, three-point lighting, material definitions
  raster.ts      supersampled rasteriser (3x SSAA), Gouraud shading, outline pass
  palette.ts     36 materials in three value bands + the four team colours
  units.ts       14 unit assemblies
  buildings.ts   21 building assemblies
  build-atlas.ts bakes every assembly × facing × team colour into WebP atlas pages + frame JSON
```

This is illustrative rendering, not procedural placeholder art, and the difference is measurable:

| | v1 (`shape-sprite.ts`) | v2 (offline rendered) |
|---|---|---|
| Source | runtime canvas draw calls, flat fills | 3D part assemblies with 36 materials |
| Shading | 1 fill + 1 stroke per face | three-point light + ambient + specular + rim + grain, interpolated per vertex |
| Anti-aliasing | canvas default | 3× supersampled then box-filtered |
| Team colour | whole-sprite tint (a blue golem is blue) | **mask-based**: only runes/crystals/banners tint, stone stays grey |
| Facings | 8 rotations of one shape | **8 real yaw angles** — you see a unit's back from behind |
| Outline | stroke on every shape | silhouette-derived 1 px outline, so it reads at 24 px |
| Runtime cost | texture generated on first use (frame hitches) | zero generation; atlas lookup |

**Why 8 real yaws matters.** v1 rotated a single drawing, so a unit "facing away" still showed its
face. Rendering at 8 yaws gives correct silhouettes per direction, which is what makes a melee unit
look like it is charging rather than sliding sideways.

**Budgets.** Unit frames 112 (14 × 8), buildings 21, projectiles/icons the rest. Atlas target
**≤ 2 MB across ≤ 3 WebP pages**, with a build-time assertion that fails the build if exceeded.

**Fallback path.** The atlas loader accepts a `procedural` provider behind the same `SpriteProvider`
interface, so phases after this one can run even if an atlas is missing.

### 6.2 Visual targets

**V1. Silhouette and material separation.** Every unit gets a distinct silhouette readable at 32 px
tall (the actual on-screen size at 667×375 zoomed out). Buildings get a roof/body/base separation
and a cast shadow that matches the light direction.

**V2. Terrain with real height.** Cliff faces get banded strata and a darker base; ramps get a lit
surface gradient driven by the exact slope from `ramp-slope.ts`; ground gets a tiled arcane motif
instead of a visible grid. Height levels are readable from colour and shadow alone, which matters
because cliffs block line of fire (§13.7 of the inventory) — players must *see* the mechanic.

**V3. Motion.** 4-frame walk cycles per facing, attack poses keyed to the existing `attackFx` timing
data, hit flash, death dissolve, and a spawn shimmer. This is the biggest perceived-quality jump per
unit of work.

**V4. VFX.** v1's five bespoke 450–600-line modules are replaced by one pooled particle/beam system
driven by data (`v2/data/vfx/*.json`). Motion streaks for fast projectiles implement the accepted
readability fix for §3.5 without touching projectile speed.

**V5. UI.** DOM HUD (0.003 ms to lay out, accessible) with a real design system: 8-pt spacing scale,
three type sizes, per-player accent colour, ≥44 px touch targets on compact layouts. Panels are CSS
grid with explicit rows so the `.cmd-card` zero-height bug cannot recur.

**V6. Readability at 667×375.** Every screen is reviewed at the smallest target first, not last.
Acceptance: at 667×375 with the game at minimum zoom, a player can distinguish Imp / Archer / Golem
/ Skimmer silhouettes and identify a powered vs unpowered turret at a glance.

---

## 6b. Content expansion (decided)

Zachary approved **more maps and more factions on top of everything existing**. This is additive:
every v1 map, faction, unit, building and spell remains.

### 6b.1 Factions

v1 has one faction (`arcane`) and the unit roster is effectively global — `factionId` exists on the
player and on building/unit defs but nothing filters by it. v2 makes factions real:

| Faction | Identity | Roster emphasis | Availability |
|---|---|---|---|
| **Arcane Dominion** | the v1 faction, unchanged | balanced, storm casters, Rift Skimmers | always |
| **Verdant Concord** | living / growth | cheaper infantry, strong healing, weaker siege | new |
| **Obsidian Pact** | industry / sacrifice | heavier armour, stronger defenses, slower | new |

Implementation: a `factionId` filter on build/train menus plus per-faction stat modifiers resolved
through the existing `modifiers.ts` pipeline. **Every v1 unit and building remains buildable by
Arcane Dominion with identical numbers** — cross-faction variants are additive content, so the
conformance suite still proves v1 parity for the Arcane roster.

### 6b.1a Faction roster expansion (noted at Phase 1 review — later content phase)

Zachary flagged that Obsidian Pact and Verdant Concord currently field only **2 units each** against
Arcane's 10. That gap is expected at this stage (Phase 1 shipped the factions as proof that faction
filtering works, not as finished content), and filling it is a **content task, not a Phase 2 task**.

Target rosters, to be built in the content phase (Phase 7), so each faction has a real identity
rather than being a subset of Arcane:

| | Arcane Dominion | Verdant Concord | Obsidian Pact |
|---|---|---|---|
| Workers / econ | Wisp, Mana Weaver | Wisp, Thorn Harvester (tankier, slower) | Wisp, Cinder Drudge (cheaper, frailer) |
| Cheap melee | Imp Swarmling | Thornling | Cinder Acolyte |
| Ranged | Arcane Archer | Grove Warden | Obsidian Lancer (short range, heavy dmg) |
| Fast scout | Rift Familiar | Sylph Scout | Ash Runner |
| Heavy | Stone Golem | Bark Colossus | Obsidian Juggernaut |
| Siege | Siege Behemoth | Rootbreaker (weaker, cheaper) | Obsidian Siegebreaker |
| Support | Storm Caster | Grove Matron (heals) | Ember Warden (buffs armour) |
| Air | Rift Skimmer | Pollen Drifter | Cinder Kite |
| Mobile HQ | Waystone Wagon | Waystone Wagon | Waystone Wagon |
| **Total** | **10** | **9-10** | **9-10** |

Buildings stay mostly shared (Sanctum, Spire, Vault, Nexus, Forge, Conduit, Astral Spire) with one
exclusive defense each plus one exclusive economy building, so each faction has a distinct line
without tripling the building count. Balance target: no faction above 60 % win rate over 20 matches
(Phase 8 gate).

### 6b.2 Maps

v1 ships one map (`duel_glade`, 128×88, 4 start locations, 13 nodes). v2 ships **at least 5**:

| Map | Size | Players | Character | Proves |
|---|---|---|---|---|
| Duel Glade | 128×88 | 2–4 | v1 map, verbatim | parity |
| Ashen Steps | 112×96 | 2 | height-heavy, 3 tiers, chokepoints | verticality |
| Tideglass | 144×80 | 2–4 | wide, open, contested centre node | expansion pressure |
| Sunken Vault | 96×96 | 2 | tight, fast, few nodes | rush viability |
| Ember Reach | 160×112 | 4 | 4-corner FFA, long hauls | 20-minute pacing |

Each map is generated by a checked-in script and validated by a map-lint test (all start locations
reachable from each other, no node unreachable, no start location starved of a nearby node,
footprints legal).

### 6b.3 Research tree (decided)

v1 has a complete research *system* but **zero content** (`data/research/` does not exist) [E20].
v2 ships a real tree. Because Zachary rejected economy retuning, research is the intended long-game
progression instead of a bigger harvest rate.

| Building | Research | Effect | Cost / time |
|---|---|---|---|
| Resonance Vault | Attuned Siphons | `siphonPerSecond` +8 % per rank (2 ranks) | 400 / 30 s, 700 / 45 s |
| Arcane Nexus | Runed Armour | `hp` +12 % for light units | 500 / 35 s |
| Arcane Nexus | Heavy Plating | `hp` +15 % for heavy units | 600 / 40 s |
| Arcane Nexus | Focused Bolts | `damage` +10 % for ranged units | 650 / 40 s |
| Arcane Nexus | Ley Efficiency | `powerUsed` −15 % on defenses | 550 / 35 s |
| Astral Spire | Astral Attunement | spell cooldowns −20 % | 900 / 60 s |
| Golem Forge | Forge Tempering | `cooldownTicks` −8 % for siege | 600 / 40 s |

All effects flow through the existing `ResearchEffect` schema and `modifiers.ts`, so the pipeline is
already proven; v2 only supplies content plus the UI (a research panel per building and a tech-tree
view). Every research is optional, none gates a v1 unit, and all are visible in the tech tree.

### 6b.4 Match length target

**~20 minutes** for 1v1. That sets the design targets:

- Economy and tech timings must let a full tech tree + superweapon be reachable by ~12–14 minutes
  with competent play, so the last third is superweapon-and-siege play.
- Research ranks are paced so a player completes ~4–5 of 7 by minute 20.
- The AI's tech schedule is written against this curve (§5.3), and the Phase-8 balance harness
  asserts median 1v1 length **14–24 minutes** across seeds.

Because §3.1 and §3.2 were rejected, this target is met by *AI competence* and *map design*, not by
changing harvest numbers.

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

Re-planned after Zachary's decisions: illustrated art, a real research tree, more maps and factions,
2–4 player lockstep, sandbox retained, ~20 minute 1v1 target, and a separate Pages project.

Each phase ends with **all** of: `typecheck` clean, `lint` clean, full test suite green, the phase's
perf number against budget, and committed proof artifacts (screenshots at 667×375, 844×390,
1366×768, 1920×1080 plus a short screen recording of the phase's headline behaviour). No phase
starts before the previous one's criteria are met.

---

### Phase 1 — Foundation: project, data pipeline, determinism, seeded RNG

**Build**
- `v2/package.json`, own Vite config, own tsconfig (strict, `noUncheckedIndexedAccess`), own
  Vitest config, own ESLint config that ports the v1 determinism guard (`src/sim/**` may not import
  render/ui/audio/input/storage; no `Math.random`, `Date.now`, `window`, `document`, `performance`).
- `v2/src/core/`: constants, coordinates, **2.5D-only projection** (dimetric, X×0.5 / Y×0.25),
  math, seeded PRNG.
- **RNG that is actually consumed** (fixes [E12][E13]): a documented draw-order contract, used by
  map variation, cosmetic tie-breaks, and AI tie-breaks. Seed must visibly change outcomes.
- Deterministic `hashState` with an incremental per-entity rolling hash.
- Data pipeline: Zod schemas + loader + registry, covering **every v1 content file** plus the new
  research / faction / extra-map schemas. Values byte-identical to v1 for Arcane content.
- Content files copied into `v2/data/` (units, buildings, spells, projectiles, factions, matches,
  balance, the v1 map) with a **parity test** asserting every field matches v1.
- `v2/scripts/` tooling: content validator, `npm run build` producing a static bundle.

**Done-criteria**
1. `npm run typecheck && npm run lint && npm test` green in `v2/`.
2. Every v1 content definition loads and equals v1 field-for-field (automated parity test, listing
   the count: 10 units, 19 buildings, 4 spells, 6 projectiles, 1 faction, 4 match presets).
3. A deliberately corrupted data file fails to load with **file + field path** in the error.
4. Same seed + same commands ⇒ identical hash (2 runs, 2000 ticks); **different seeds ⇒ different
   hashes**, proving the RNG is live.
5. Determinism lint guard actually fires (a test fixture that imports `pixi.js` into `src/sim` must
   fail lint; captured as evidence).
6. Zero imports from `v1 src/` — enforced by a test that greps `v2/src` for `../src/` and `../data/`.
7. `v2` builds to a static `dist/` and the bundle's JS gzip is recorded as the Phase-1 baseline.

---

### Phase 2 — Simulation core

**Build**
- Structure-of-arrays entity store with stable ids, owned spatial grid, incremental spatial index.
- Nav/height grid, ramp slope, flow-field pathing, local separation.
- All **23 player commands + 12 dev commands**, exhaustive switches.
- All 17 systems in the v1 order (order is load-bearing; asserted by a test that snapshots the order).
- Fog of war with `explored` / `visible` / `knownBuildings` ghost semantics and radar gating.
- Height rules: ramp-only ±1 steps, cliffs block ground fire, high ground +1 tile range, high
  ground hides lower tiles.
- Combat: armour `vs` table, splash, chain, beams, turret arcs, charge-up, min-range, air layers,
  garrison fire, stances.
- Economy: harvest cycle, refinery deposit, Vault multiplier, repair, sell, conjure, Tight pacing.
- Power: hard vs soft consumers, production slowdown floor.
- **`MAX_UNITS_PER_PLAYER` enforced** at produce + spawn (fixes [E15]).
- Win check identical to v1 (HQ destruction only — no bankruptcy rule, per §3.4).

**Done-criteria**
1. Conformance suite covers **every rule in inventory §4–§15** and passes (each test names its
   inventory row).
2. `npm test` green; determinism green at 2000 ticks.
3. Sim ≤ **1.5 ms/tick at 187 entities** (v1 baseline: 6.995 ms [E7]) — measured and recorded.
4. Unit cap enforced: a test spawns 200 units and asserts the 90th+ is refused at the command layer.
5. Zero allocations in the steady-state tick (measured via `--expose-gc` heap delta over 2000 ticks,
   asserted under a threshold).
6. Replay: recorded command stream reproduces the identical final hash.

---

### Phase 3 — Renderer, art pipeline, and the illustrated atlas

**Build**
- Atlas pipeline: authored vector sources → build-time rasteriser → WebP atlas pages + frame JSON.
- `SpriteProvider` with `illustrated` (primary) and `procedural` (fallback) backends.
- Batched rendering: one draw call per atlas page; depth via a sorted index, not `zIndex`.
- Chunked pre-rendered terrain with height strata and slope shading.
- Pooled particle/beam VFX from data; motion streaks for fast projectiles (§3.5 fix).
- Fog rendering, minimap, camera (clamped, overscan), occlusion markers.
- All 14 units × 8 facings, 26+ buildings, projectiles, icons drawn and reviewed.

**Done-criteria**
1. Inventory §13 and §20 rows all implemented.
2. Art ≤ 2 MB across ≤ 3 atlas pages (measured); bundle recorded.
3. JS render cost ≤ **4 ms/frame at 187 entities** (measured).
4. Screenshots at all 4 sizes for: idle base, massed battle, zoomed out, max zoom, height/cliff
   showcase, each faction's palette.
5. Short recording (10–20 s) of a 40-unit battle showing walk cycles, attack poses, streaks, VFX.
6. Silhouette test at 667×375: all 14 units distinguishable (side-by-side sheet committed).
7. Real-GPU fps verified on available hardware (see §13 — this VM has no GPU).

---

### Phase 4 — UI, HUD, screens, sandbox, research UI, content UI

**Build**
- Menu, lobby (fixing [E21] red-error-on-load and auto-assigning corners), settings, pause, result.
- HUD on a design system: grid panels (structurally prevents the [E17] 0-px bug), ≥44 px touch
  targets, compact layout variants.
- Coach/tutorial with a **layout guarantee** that it can never overlap an interactive control
  (fixes [E16]); geometry asserted in tests at all 4 viewports.
- Build/train menus with faction filtering, research panel per building, tech-tree view.
- Full developer sandbox: **all 10 tabs, all dev commands, command palette, scenarios, overlays,
  pause/step/timescale, multi-player control switching** (Zachary: keep it).
- Entity Designs gallery with live 2.5D previews, now showing illustrated sprites.

**Done-criteria**
1. Inventory §2, §3, §8, §9, §10, §11 all implemented; §16 (research UI) implemented.
2. Playwright: every screen at 4 viewports, **zero page errors**, zero console errors.
3. Automated geometry assertions: nothing overflows the viewport; `.cmd-card` height > 0; the Place
   button is the topmost element at its own centre on all 4 viewports (the exact [E16] test, now
   passing).
4. HUD occupies ≤ 18 % of a 667×375 screen.
5. Sandbox: all 10 tabs visited with no errors; representative action per tab asserted.

---

### Phase 5 — AI

**Build**
- `PerceivedWorld` façade — the **only** input to AI decisions (fixes the [E3.3] maphack).
- Economy planner with self-healing harvester logic and scored refinery placement (§5.5).
- Military planner: threat map, staging, waves, multi-axis, retreat, focus fire, siege handling.
- Three difficulties using only legal levers (latency, scouts, build order, wave size, spells).
- Openings as data.
- Tech/research decisions driven by the 20-minute target.

**Done-criteria (all automated in CI)**
1. **100 %** of 15 seeded matches terminate within 20 sim-minutes (v1: 50 % [E11]).
2. Zero hidden-state reads: throwing-proxy harness reports 0 violations over 10 matches.
3. Peak army ≥ **40 units** for Hard by 8 minutes (v1: 28 [E11]).
4. Difficulty ordering: Hard > Normal and Normal > Easy each ≥ 80 % over 10 seeds.
5. Seed variety: ≥ 3 distinct winners across 5 seeds at equal difficulty.
6. No match has a player with 0 harvesters for > 60 s (self-healing proof).
7. Median 1v1 length 14–24 sim-minutes across seeds (the ~20-minute target).

---

### Phase 6 — Multiplayer (2–4 players)

**Build**
- Lockstep client + rejoin + stall policy, keeping the **v1 wire protocol** so the Railway relay
  needs no change.
- Host/guest lobby sync, ready states, claim, seed negotiation.
- Checksum comparison per tick, desync capture with replay, reconnect with backoff.

**Done-criteria**
1. 2, 3 and 4 **real browser peers** stay in sync for 5 minutes (checksums equal every ACK window).
2. A forced desync is detected and reported with a serialized replay.
3. Background/resume does not trip the stall banner; a genuine stall does.
4. Rejoin restores a live match mid-game.
5. Relay compatibility: the unchanged v1 relay serves v2 peers (proven by running `relay/server.mjs`
   and connecting a v2 client).

---

### Phase 7 — PWA, content completion, polish, performance

**Build**
- Manifest, service worker, cache headers, icons, install prompt, orientation lock, resume.
- **5 maps** completed and map-linted; **3 factions** with real filtering.
- Research tree content wired into AI and UI.
- Audio pass.
- Bundle splitting (code-split the renderer and sandbox) to hit the gzip budget.

**Done-criteria**
1. Installable on Android Chrome and desktop Chromium (documented manual check).
2. Cold TTI ≤ 6 s on throttled Fast 3G.
3. Bundle ≤ **150 kB gzip** main chunk (v1: 236.7 kB [E3]).
4. All 5 maps pass map-lint (reachability, no starved start, legal footprints).
5. All 3 factions buildable and playable; Arcane numbers still byte-identical to v1.
6. 20-minute memory soak ≤ 250 MB.

---

### Phase 8 — Balance, conformance re-run, deploy, final proof

**Build**
- Full conformance re-run against v1 for every unchanged rule.
- Balance pass against the 20-minute target.
- **Separate Cloudflare Pages project `wizz-aw8-v2`**; `wizz-aw8` untouched.

**Done-criteria**
1. Conformance: every unchanged rule matches v1; every changed rule (only §3.3 and §3.6) is
   asserted as the new behaviour with a link to its decision.
2. Balance harness: median 1v1 14–24 min; no faction above 60 % win rate over 20 matches.
3. v2 deployed to `wizz-aw8-v2` and verified live; `wizz-aw8` still serving v1 (verified).
4. Final evidence pack: before/after tables, full video suite, inventory checklist fully `[x]`/`[~]`.

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

**[E22] The harvest siphon rate is exactly as configured — travel overhead is design, not a bug.**
Per-tick instrumentation of the harvest cycle (`v2/audit/harvest-forensics.test.ts`,
`v2/audit/income-model.test.ts`) plus a position/velocity trace (`v2/audit/wisp-stuck.test.ts`).

While in node contact, `carry` rises exactly 16 per second (sample: carry `0 → 16 → 32 → 48 → 64 → 75`
at 1 s intervals), i.e. `siphonPerSecond: 16` is honoured precisely and a full 75 load takes
`75 / 16 = 4.69 s`. What varies is the *duty cycle* of contact, because the wisp must travel
spire→node→spire:

```
INCOME {
 "short": { "hopDistance": 320, "mana": 525,  "manaPerSec": 4.375,  "siphonDutyCycle": 0.274 },
 "long":  { "hopDistance":  82, "mana": 1575, "manaPerSec": 13.125, "siphonDutyCycle": 0.854 },
 "configured": 16
}
```

Reading the "long" row: a refinery built ~82 world units from its node achieves an **85.4 %** contact
duty cycle and therefore **13.1 mana/s** — within 18 % of the configured ceiling, the difference
being turn-around time. The low figure I reported in phase 0 (3.75 mana/s) came from a refinery
placed **320 units** away (27.4 % duty cycle), which is a *placement* outcome, not a rate defect.

The wisp position trace further rules out a stuck-unit bug: over a 60 s run it moves continuously
between node (`dNode` 391 → 10) and spire (`dSpire` 310 → 41), with `vel` 72 while travelling and
0 only while siphoning, exactly as designed.

**Conclusion for §3.1: no bug in the harvest rate. v1's rule is correctly implemented and is kept
verbatim in v2.** The actionable defect is the AI's refinery placement (`ai/shared.ts`
`searchPlacementRings` takes the first legal ring tile with no regard for node distance), which v2
fixes in the AI (§5.5), not in the economy.

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

## 14. Decisions recorded (settled) and remaining questions

### 14.1 Settled — Zachary's decisions

| # | Question | Decision |
|---|---|---|
| 1 | Visual direction | **Illustrated sprites** (§6) |
| 2 | Art production | **Illustrated/atlas art**, not procedural (§6.1) |
| 3 | Rule changes | **Accept §3.3** (no AI fog cheating) and **§3.6** (surface Astral Spire unlocks). **Reject §3.1, §3.2, §3.4, §3.5** — keep v1 rules. Matches must still not stall; fixed through AI + genuine bug fixes (§3.4, §5.5) |
| 4 | Match length target | **~20 minutes** for 1v1 (§6b.4) |
| 5 | Research tree | **Build a real research tree** (§6b.3) |
| 6 | More maps and factions | **Yes, additive** on top of everything existing (§6b) |
| 7 | Multiplayer scope | **2–4 player lockstep** |
| 8 | Deployment | **Separate Pages project `wizz-aw8-v2`**; `wizz-aw8` switches over only on Zachary's approval |
| 9 | Sandbox | **Keep** the full developer sandbox |

Additional guidance recorded: fix the real bugs listed in §3.9 (dead seed, unenforced unit cap,
coach card blocking Place, 0-px `cmd-card`, lobby error, AI stall). Where a measured rate differs
from a configured value, determine whether it is a bug or intended design and say which — done in
§3.1: the harvest siphon rate is **exactly as configured**, and the lower whole-economy figure is
travel overhead (design), not a bug.

### 14.2 Remaining questions (new, non-blocking — Phase 1 proceeds regardless)

1. **Faction identity.** I have drafted Verdant Concord (living/growth) and Obsidian Pact
   (industry/sacrifice) in §6b.1. Are those the right directions, or would you rather they be
   different archetypes? Changing them later only affects content files and menu copy, not the
   simulation.
2. **Art review gate.** Since art is now a first-class deliverable, should each phase's screenshots
   be reviewed by you before the next phase starts, or should I proceed and batch the review at
   Phase 3 completion?
3. **`wizz-aw8-v2` provisioning.** I can produce the build output and the exact deploy steps, but
   creating the Cloudflare Pages project and its credentials needs your account access. Are you
   happy to create the project when Phase 7 lands, or should I prepare a one-command deploy script
   for you to run?

None of these block Phase 1.

