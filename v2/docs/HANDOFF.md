# HANDOFF — Arcane Dominion v2

**Written:** 2026-11-23, at the end of Phase 6, on branch `cursor/rebuild-v2-5642`.
**Updated:** 2026-11-24, after the playtest-response pass (§8.0) that rebuilt the HUD, the menus and the
touch controls, and wired multiplayer to the live relay.
**Reader:** a new agent picking up the next phase with no history of this branch.
**Scope of this document:** enough context to continue without re-deriving anything. Every number here
was measured on this branch; where something is unresolved it says so instead of smoothing it over.

**If you read only three sections:** §0.2 (the working rules), §7 (the open issues — one Step 0 target
is not obtainable, and the reasons are measured), and §8 (what Phase 6 did and what Phase 7 asks for).

---

## 0. Read this first

### 0.1 What this project is

Arcane Dominion — a mobile-first, landscape, 2.5D (dimetric / RA2-style oblique) real-time strategy
game. TypeScript + Vite + PixiJS, tested with Vitest. It is a **static, client-only** app: there is
no backend and no database.

**v1** is the original game at the repository root (`src/`, `data/`, `tests/`). It shipped and is
what `main` serves.

**`v2/` is the rebuild**, and it is where all new work happens. It is a self-contained project with
its own `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` and `eslint.config.js`.
It never imports from v1 and v1 never imports from it — `v2/tests/isolation.test.ts` enforces that.

### 0.2 Working rules — these are not negotiable

1. **`v2/` only.** Do not modify v1 (`src/`, `data/`, `tests/`, `public/`, `relay/` at the root).
2. **Never merge.** Do not merge this branch to `main`, do not enable auto-merge.
3. **Never touch `main`.** Do not commit to it or force-push it.
4. **Prove every claim.** A claim is not accepted because the code looks right. Every number in this
   document came from a command that was run, and the harness that produced it is committed in
   `v2/audit/`. If you cannot measure something, say so.
5. **Repo-relative paths** in docs and comments (`v2/src/ai/brain.ts`), never absolute paths from a
   container.
6. **All CI green.** The `v2` job in `.github/workflows/ci.yml` must pass before you claim a phase is
   done. It typechecks, lints, runs the isolated gates, runs the browser UI gates, and builds.
7. **Every turn makes a tool call.** Never narrate a wait; use one blocking command with a long
   timeout instead.

### 0.3 Where the plan lives

`v2/docs/REBUILD_PLAN.md` (1398 lines) is the authoritative plan: measured baselines, settled rule
decisions, architecture, per-phase done-criteria, risks, and an evidence index. Read §8 for the phase
definitions and §3 for the rule decisions. `v2/docs/FEATURE_INVENTORY.md` is the completeness
checklist.

---

## 1. Phase status

Phases 0–6 are complete. Phase 7 has not started.

| Phase | What it proved | Proof lives in |
|---|---|---|
| **0 — Audit** | v1 measured and understood before rebuilding: sim CPU per tick, frame pacing at 4 viewports, economy pacing, and the AI's failures. Established that v1's sim is *not* the bottleneck (14% of budget worst case) and that the AI is where it collapses. | `v2/docs/REBUILD_PLAN.md` §1–2, §10–12; `v2/docs/baseline-perf.json`; `v2/docs/baseline-screenshots/` |
| **1 — Foundation** | An independent project scaffold; a typed, validated data pipeline; determinism with named seeded RNG streams; v2 cannot import v1. | `v2/docs/PHASE_1_REPORT.md`; `v2/docs/proof/phase-1/` (4 viewport boot shots + `proof.json` + `phase-1-boot.mp4`) |
| **2 — Simulation core** | A fully headless, deterministic 20 Hz simulation with a fixed-order system pipeline; replayable; hash-stable; within CPU budget. One performance target was missed and reported honestly (see §7.1). | `v2/docs/PHASE_2_REPORT.md`; `v2/docs/proof/phase-2/` (4 viewport sim shots, `headless-match-log.md`, `phase-2-match.mp4`) |
| **3 — Renderer & art pipeline** | A 2.5D dimetric renderer and an offline 3D→2D sprite pipeline that produces every sprite in code (no image generation). Art proof includes a before/after against v1. | `v2/docs/PHASE_3_REPORT.md`; `v2/docs/proof/phase-3/`, `phase-3-final/` (`README.md`, `proof-index.json`, `gallery/`, `sprites/`, `phase3-final-gameplay.webm`), `phase-3-pilot/` (v1-vs-v2 comparison), `atlas-archive/` |
| **4 — UI, HUD, screens** | Real rendered layout gates: HUD area, zone overlap, the Place button being topmost, `.hud-cmd` height, unit separation — measured at 4 viewports in a real browser. The "Obsidian & Brass" style, with the no-purple rule enforced on both chrome and baked art. | `v2/docs/PHASE_4_REPORT.md`; `v2/docs/proof/phase-4/` (`README.md`, `screens/`, `hud-geometry.json`, `phase4-proof.json`, `phase4-full-flow.webm`), `phase-4-polish/` (alignment grids), `ui-style/` (`README.md`, `styleguide-*.png`, `ui-proof.json`) |
| **5 — AI** | No fog cheating (proven, not asserted); three difficulties ordered by measured win rate; every match terminates; no idle armies; a full tournament as committed evidence. **Re-measured in Phase 6 after three sim defects were fixed — see §7.0.** | `v2/docs/proof/phase-5/ai/` (`report.md`, `README.md`, `ablation.md`, `tournament.json`, match + overview screenshots, `full-match-expansion.webm`, **`phase6-fairness.md`**, `footprint-*.png`) |
| **6 — Multiplayer** | Deterministic 2–4 player lockstep over the **unmodified v1 relay**: lobby create/join, input delay, desync detection with replay capture, reconnect and clean drop, stall policy, AI fill-in. 2/3/4 headless peers reach decided matches with zero desyncs; two real browser contexts stayed in sync across **38 compared ticks with 0 mismatches**. | `v2/docs/proof/phase-6/` (`README.md`, `BALANCE_PROPOSALS.md`, 7 screenshots, `video/two-browser-lockstep-match.webm`, `browser-match.json`, `browser-match.log`) |
| **7a — Playtest response** | Zachary's live-playtest report answered point by point: the HUD is a docked C&C command console, the menus are command consoles, the touch model is v1's (re-derived inside `v2/`), the starting camera frames the base in the battlefield, and multiplayer is wired to the live Railway relay and proven with **two browser contexts playing a real match** — both building, training, marching and fighting, with **132 common ticks compared and 0 mismatches**. | `v2/docs/proof/phase-7/` (`ui/` 75 captures + `ui-proof.json` + `README.md`; `multiplayer/` 10 screenshots, `browser-match.json`, `browser-match.log`) |

**Phase 5's remaining caveats are real and are listed in §7**, with the Phase 6 re-measurement in §7.0. One
Step 0 target (the "both bases with expansions" shot) is not obtainable; the rest are met.

---

## 2. Approved rule changes — the complete list

v2 is measured against v1 field-for-field. The **only** gameplay values allowed to differ are the
three below, each recorded in `v2/tests/data/parity.test.ts` in `APPROVED_VALUE_EXCEPTIONS`, keyed
`<defId>.<field>`, **naming the exact replacement value**. That keying is deliberate: an exception
covers one number, so any further change to that field fails the parity test until it is itself
approved and recorded. All three were approved by **Zachary on 2026-11-21**.

| Key | v1 value | Approved value | Why it changed (measured) |
|---|---|---|---|
| `sanctum.hp` | 2000 | **4000** | At 2000 an even 1v1 was decided in 11.8 min because the first credible push killed the HQ as soon as the defending army was spent. Swept: 3000 → 12.9 min, **4000 → 19.9 min**, 8000 → 18.5–31.7 min. 4000 is the smallest value inside the 15–25 min band. Turret damage was swept first and **rejected**: at damage 7 the difficulty ordering collapsed and 12 matches stopped finishing inside the cap, because stronger static defence substitutes for good decisions. Turrets therefore stay at v1 (hp 600, damage 3, range 165). |
| `balance.manaNodeCapacity` | 12000 | **25000** | The map authors 127,000 mana but a 12,000 clamp made only 75,000 reachable, so income had no margin and the first raid that killed the worker line was unrecoverable. Swept: 12000 → 1073 s worst no-spend, **25000 → 301 s**, 40000 identical (no node authors more). 25000 is exactly the largest amount the map authors, so it honours the map as designed rather than inventing a number. |
| `balance.sanctumTricklePerSecond` | 0 (absent) | **2 / s** | A side with zero harvesters has no income, so it can never afford the worker that would restore its income. Observed: a player holding 155 mana against a 200-cost worker, stuck 45 short for the rest of the match while its opponent sat on 111,700 unspent mana. Swept: 0 → 1 unfinished match and a 1243 s no-spend; 0.6 → 407 s; 1.0 → 201 s but left a **real 115 s deadlock** (at 1.0/s a worker takes 3.3 min to fund and was killed first); **2.0 → 180 s, no deadlock**. It is still eight times below mining (a single worker earns 16/s), so it is a recovery floor, not an income source. |

### 2.1 Accepted design decisions (not number changes)

**No AI fog cheating at any difficulty — ACCEPTED (2026-11-21).** No AI difficulty may read any
entity, position or building the player could not see. Enforced structurally: the AI receives a
`PerceivedWorld` façade, never `GameState`, and `v2/tests/phase5-maphack.test.ts` proves
non-dependence two ways — indistinguishability (perturb every hidden entity; the commands must be
byte-identical) and a throwing proxy. Difficulty is expressed **only** through legal levers: reaction
latency, scout count, build order, wave size, retreat thresholds, spell use. Hard is given speed and
discipline, never information.

**Surface what the Astral Spire unlocks — ACCEPTED (2026-11-21).** Content and UI only; no numbers
change. The build menu shows on the Astral Spire entry the four spells it unlocks (`meteor_storm`,
`aegis_ward`, `blink_gate`, `astral_lance`) with their cooldowns; locked spell chips name the
prerequisite chain (`Arcane Nexus → Astral Spire`) instead of a generic "unlocks later"; the tech tree
shows the same dependency.

### 2.2 Rejected proposals (rules kept exactly as v1)

Zachary reviewed six proposals and accepted two. The rejected four and what v2 does instead:

| Proposal | Decision | v2 treatment |
|---|---|---|
| Harvest pacing retune | **REJECTED** | `siphonPerSecond: 16`, `wisp.carry: 75`, `wisp.speed: 72`, `vaultSiphonMultiplier: 1.3`, starting mana 900 — all verbatim. The 16/s rate was verified to be implemented exactly (carry 0→16→32→48→64→75 at 1 s intervals); the low whole-economy number was a round-trip average on a badly-placed refinery, which is the intended RA2 model. v2 fixes the **AI's placement** and adds a placement readout showing effective mana/s — presentation and AI, never the rule. |
| Soft harvester cap | **REJECTED** | No cap beyond the existing per-refinery docking behaviour. v2 compensates only through AI quality and map design. |
| Bankruptcy elimination | **REJECTED** | `winCheckSystem` keeps v1 semantics: a player is defeated only when holding no HQ. Stalls are fixed at their real cause (AI economy bugs), never by adding an elimination rule. |
| Slower projectiles | **REJECTED** | `arcane_bolt` stays at 1200 u/s; all projectile speeds, damage and cooldowns unchanged. Readability is solved in the renderer with motion streaks and an impact flash. |

### 2.3 Art and UI decisions (Zachary)

These were chosen by Zachary and are held consistently. They are enforced by tests, not by
convention.

- **"Obsidian & Brass"** is the UI style, documented in `v2/docs/UI_STYLE_GUIDE.md`. Dark machined
  plates, warm brass/copper fittings, bone type. Flat achromatic steel in five elevation steps,
  chamfered rectangles (a hard 45° corner cut, not a rounded corner), 1px inset ring plus a bevel.
  Copper appears **only** where the player can act. Nothing glows, nothing blurs, nothing floats.
- **No purple.** Hue **250–330° is banned outright** — violet through magenta. One definition governs
  both chrome and art: `v2/tests/ui-tokens.test.ts` parses every UI colour to HSL and rejects that
  band, and `v2/tests/art-no-purple.test.ts` measures the share of visible pixels in baked sprites
  falling in the same band. The reason is that the old UI used the same violet as the game's own
  Arcane faction, so chrome and battlefield content read as the same material — and it is the
  generic "AI-generated app" look.
- **Code-built art only. No AI-generated images anywhere in the pipeline.** Every sprite is a small
  assembly of 3D primitives with per-part materials, rendered offline by a real rasteriser. Every
  vertex is produced by a function in `v2/art/`. See `v2/docs/ART_DIRECTION.md`.
- Additional bans from the same brief: no glassmorphism, no neon glow, no default rounded pills, no
  emoji, one deliberate style held consistently. The reasoning is in `v2/docs/UI_STYLE_GUIDE.md` §1.

**2.5D only.** There is no Classic 2D, top-down or ortho view, and you must not add one — no 2D mode,
no lobby toggle, no `?view=` override. The simulation stays in 2D world units; `v2/src/core/projection.ts`
is the only world↔screen mapping.

---

## 3. Parity exceptions

There are exactly **three**, all in `v2/tests/data/parity.test.ts`:

```text
balance.manaNodeCapacity        -> 25000
balance.sanctumTricklePerSecond -> 2
sanctum.hp                      -> 4000
```

Everything else in the content set must match v1 field-for-field. `PLAN_ADDITIONS` in the same file
lists the fields v2 adds on purpose (`units.factions`, `buildings.factions`, `spells.factions`,
`maps.visualHeights`) — additions, not changes.

### 3.1 The map — read this before touching `duel_glade.json`

`duel_glade` is **parity-locked except for its terrain symmetry**. This one needs the history,
because the obvious next step is wrong:

- v1's terrain is **not** mirror-symmetric: 68 of 11,264 tiles and 26 heights differ from their
  reflection about the vertical axis (and 40 tiles / 34 heights about the horizontal one). That
  asymmetry decided mirrors outright — with identical AIs, **corner 1 beat corner 0 in 12 of 12
  games** (`v2/audit/cornerhard.ts`), an effect far larger than any difficulty lever.
- **Symmetrising the terrain AND rebuilding the mana nodes was tried and reverted.** It fixed the
  mirror but **inverted the difficulty ladder**: Hard vs Normal went 12-0 → 0-12, because rebuilding
  the nodes moved 5 of the 13 and reshaped the economy every balance measurement was taken against.
- **The shipped configuration is terrain-only symmetrisation**: the right half of the terrain is the
  reflection of the left, and **every mana node keeps its exact v1 position and amount**. Measured:
  mirror corners 8-4 (was 0-12), Hard vs Normal 79%, 0 unfinished.

`v2/tests/data/parity.test.ts` asserts **both** halves of that: terrain symmetry about the vertical
axis **and** exact node equality with v1. Do not "improve" the map without re-measuring both the
mirror and the difficulty ladder.

---

## 4. Architecture map

The dependency direction is load-bearing and lint-enforced: **`src/sim/**` may not import render, ui,
audio, input or storage layers, and may not use `Math.random`, `Date.now`, `window`, `document` or
`performance`.** Breaking that fails `npm run lint`. Keep the simulation core pure and headless.

```text
v2/
  src/
    core/        constants.ts · coords.ts · math.ts · projection.ts · ramp-slope.ts · rng.ts
                 Pure helpers. `projection.ts` is the ONLY world<->screen mapping (2.5D dimetric).
                 `rng.ts` is the ONLY randomness: named, seeded streams (map, ai, spawn, cosmetic).
    sim/         The game. Pure, headless, deterministic, 20 Hz (TICK_HZ = 20).
                 step.ts            SYSTEM_ORDER — 16 systems, and the order is load-bearing:
                                    applyCommands, aiHook, production, morph, movement, visibility,
                                    combat, beamWeapon, garrison, projectile, superweapon, aura,
                                    harvest, channel, death, winCheck
                                    (v1 had a 17th, `sandboxCheats`, which v2 does not carry.)
                 types.ts           GameState, Command, GameEvent
                 context.ts         SimServices / StepContext (registry, nav, flow, spatial)
                 entity-store.ts    Structure-of-arrays; KIND_UNIT=0, KIND_BUILDING=1,
                                    KIND_PROJECTILE=2, KIND_RESOURCE_NODE=3. Slots are stable and
                                    monotonic; compaction is a stable filter at end of tick.
                 factory.ts         initMatch — map, nodes, starting base, and the sanctioned RNG
                 nav-grid.ts        passability, height rule, gates, canPlace
                 pathing.ts         flow-field stepping; flow-field.ts is a bounded LRU keyed by
                                    (owner-passability-class, goal tile)
                 spatial-grid.ts    uniform grid for radius queries (CSR layout)
                 fog.ts             isVisibleTo, isBuildingInLiveSight, radarActive
                 build-zone.ts      Chebyshev build zone (BUILD_ZONE_TILES = 7)
                 power.ts · modifiers.ts · capabilities.ts · combat-util.ts · queries.ts
                 garrison.ts · resource-nodes.ts · hash.ts (state hash for determinism) ·
                 headless.ts (run a match with no renderer)
                 systems/           one file per system above
    ai/          The AI. Reads ONLY `PerceivedWorld`.
                 perception.ts  THE FAÇADE. `PerceivedWorld.build(state, playerId)` returns a
                                `Perception` — the only thing AI code may read. Own units are
                                strictly `myUnits`/`myBuildings`; a teammate's are `alliedUnits`/
                                `alliedBuildings` (visible but not commandable). Enemy units leave
                                sight and are forgotten; enemy BUILDINGS persist as ghosts (`live:false`).
                 brain.ts       AiBrain: memory, tick/decide, scouting, wave lifecycle
                 economy.ts     planEconomy — harvesters, build order, production, defence, expansion
                 military.ts    planMilitary — defence, waves, micro, target choice
                 difficulty.ts  the three profiles (see below)
                 build-order.ts the standard opening (one order; see the note in the file)
                 driver.ts      AiDriver → the sim's AiHook; the only place that touches GameState
    render/      PixiJS. renderer.ts, terrain.ts, terrain2.ts, atlas.ts, camera.ts
    ui/          tokens.css · components.css · screens.css · styleguide.css · fonts.css · icons.ts · kit.ts
                 Obsidian & Brass tokens. Hue 250–330 is banned by test, not by convention.
    app/         The real game UI: app.ts, match.ts, networked-match.ts, hud.ts, state.ts, screens/
    net/         Multiplayer. protocol.ts (wire types) · protocol-constants.ts (typed copy of the shared
                 values, drift-tested) · lockstep.ts (input delay, tick confirmation, gap filling, ack
                 pacing, desync compare) · session.ts (one peer's match: sim + AI fill-in + desync
                 capture + snapshot adopt) · in-process-relay.ts (the relay's merge semantics, no
                 sockets) · harness.ts (N peers with injectable latency/jitter/drops) · lobby.ts
                 (create/join/ready/start validation/AI fill-in) · stall.ts (pure HUD policy) ·
                 ws-transport.ts (the browser pipe, with rejoin on reconnect) · bot-client.ts (a
                 headless player whose AI commands travel over the network)
    styles/      shared CSS
    data/        registry.ts · loader.ts · defs.ts · schemas.ts (zod) · validate-registry.ts
    art/         the offline 3D->2D sprite pipeline (see docs/ART_DIRECTION.md)
  art/           pipeline scripts and baked output
  data/          units/ buildings/ spells/ projectiles/ maps/ match/ balance.json
  audit/         140+ measurement harnesses. This is the evidence base — see §6.
  tests/         test files across tests/, tests/sim/, tests/core/, tests/data/, tests/net/
  docs/          REBUILD_PLAN.md · FEATURE_INVENTORY.md · PHASE_{1,2,3,4}_REPORT.md ·
                 ART_DIRECTION.md · UI_STYLE_GUIDE.md · proof/ (per-phase evidence)
```

**Vite entries** (`v2/vite.config.ts`): `index.html` (main), `gallery.html` (sprite gallery),
`styleguide.html` (UI style), `ui-proof.html` (one mockup at one density, for proof captures),
`app.html` (**the real game UI**, and the entry the multiplayer screen ships from). CI asserts all five
deployed entries plus the atlas manifest and fonts exist in `dist/`, because a missing entry succeeds in
dev and 404s only after a build.

### 4.1 Difficulty profiles

`v2/src/ai/difficulty.ts`. The distinction lives **entirely in the profile** — every difficulty uses
the same opening, because the aggressive opening was measured worse (see the note in
`build-order.ts`). Measured levers, for orientation: Easy thinks every 2 s (`decisionInterval: 40`,
`reactionDelay: 60`, `scoutCount: 0`, `minWaveSize: 7`, `targetBases: 1`); Normal every 1 s (20 / 24 /
1 / 7 / 2); Hard every 1 s (20 / **8** / 1 / **5** / 3). Hard's only measured-positive lever is the
smaller first wave (`minWaveSize: 5`) — a faster cadence measured *worse*, and Hard's "advanced"
extras (kiting, harass, counters, superweapon) measured neutral individually and **negative in
combination**, so they are off. Do not add an unmeasured lever to a difficulty; the ablation in
`v2/docs/proof/phase-5/ai/ablation.md` records what each candidate actually did.

### 4.2 Traps that have already cost this branch days

All are documented at length in the source; repeated here because a new agent will hit them.

1. **Shared mutable scratch arrays do not survive nesting.** `acquireTarget` iterates its candidate
   list while calling `swarmScore`, which runs its own `queryRadius`; `queryRadius` **clears** its
   `out` array. One shared buffer meant the inner call truncated the outer loop mid-iteration. Use a
   separate buffer per nesting level.
2. **A remembered building is not a target.** Ghosts (`live:false`) exist so the renderer can draw
   them. An army sent to one walks to a corpse. This was the 75-minute 2v2 with 39 units. Every
   "where do I attack" and "do I know where they live" decision must require `live === true` **and**
   a non-wall def — and `pickAttackTarget` and the sweep predicate must use the *same* rule, because
   they diverged once and it cost a phase.
3. **A tie-break is a fairness decision, and scan order is never neutral.** `bestNeighborSteer` kept the
   first neighbour that improved on the current cost, and `NEIGHBORS` is ordered `[1,0],[-1,0],…` — so
   every exact cost tie resolved toward +x. Measured: **595 of 1221 tiles steered differently from their
   own reflection**, and the mirror was 18.2% instead of a coin flip. The same defect existed in the
   harvest system's "nearest node" hash. Order ties by a **reflection-invariant** quantity
   (`mirrorRank` in `pathing.ts`), never by iteration order, and never by a hash of the coordinates — a
   hash is symmetric only in aggregate, which is not the property a mirrored match needs.
4. **`movementSystem` must not receive an order with no coordinates.** `harvest`, `attack` and `hold`
   orders carry no `x`/`y`; reading them produced `undefined + offset = NaN`, which every comparison
   lets through and which then poisons `velX`, `velY` **and `facing`** — and `facing` is in `hashState`
   and is read by turret arcs. 282,204 non-finite values in one match. If you add an order type, add it
   to the guard in `movement.ts`; there is a throwing finite check as a tripwire.
5. **The relay validates every frame and silently drops one it does not recognise.** It runs v1's zod
   schema, so a v2 command variant it does not enumerate makes the WHOLE `commands` frame vanish — every
   order that tick, not just the unknown one. `tests/net/wire-compat.test.ts` feeds one of each variant
   through the relay's actual validator for exactly this reason. Run it after touching
   `src/net/protocol.ts`.
6. **A fake network must not reorder messages.** A WebSocket is a TCP stream, so tick N always arrives
   before N+1. The first test harness allowed jitter to overtake, the lockstep client gap-filled the
   skipped tick with an empty list, and the real commands for it were then discarded — a desync that was
   a defect in the *harness*. Delivery is monotonic now, and the client also promotes a late non-empty
   list over an empty filler.
7. **`opacity: 0.55` does not block a tap.** `prod-tile[data-blocked='true']` looks disabled and is
   `cursor: not-allowed`, but it is still a live `<button>`: tapping it armed nothing and a proof spent
   minutes wondering why no structure appeared. If a control is unavailable, say so in its `data-blocked`
   state AND check that attribute before tapping it — the tech-blocked tile is the case that matters.
8. **A CSS rule written for the previous design silently wins.** `.menu-art { display: none }` lived in
   `app.css` from the old menu and `console.css` positioned the same element as a full-bleed layer. The
   `display: none` won, so the main menu rendered with an empty black half and the real renderer mounted
   into a zero-size box — and every phone screenshot showed it while all the geometry gates stayed green.
   Menu layout now has ONE owner. If two stylesheets can style the same screen, delete one of them.
9. **`nowrap` + `overflow: hidden` is not truncation, it is a layout bug the gate reports.** Tile labels
   needed 57px in a 30px box. The lesson is not "make the font smaller": it is that a two-word label and
   its price cannot share a row in a two-up tile, so they stack (picture, name, cost) and the name wraps.
10. **A container that scrolls can still let its content overhang.** `.hud-tiles` has `overflow-y: auto`
   and `overflow-x: hidden`, so a too-wide label overhung its own scroller by 85px while the panel looked
   fine. When a grid column is too narrow for its content, fix the column, not the overflow.
11. **A phone sidebar covers a third of the width, and it covers the thing you want to tap.** The
   placement ghost seeds near the game's idea of the pointer, which on a tile tap is over the console. On a
   667×375 phone the ghost's projected position can land UNDER the sidebar, so a tap there hits the console.
   Pan the camera to what you want to place and tap the middle of the battlefield — which is what a player
   does anyway, and what the two-browser proof now does.

---

## 5. Running things

All commands are relative to `v2/`.

```bash
cd v2
npm ci

npm run dev            # http://localhost:5173/  (add `-- --host` to reach it from another device)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint, includes the sim purity rules and the UI style rules
npm test               # vitest, everything (~few minutes; the slow AI suites dominate)
npm run build          # tsc --noEmit && vite build  — a type error fails the build
```

Focused runs, which you will use constantly:

```bash
npx vitest run tests/sim tests/core tests/data tests/map-lint.test.ts   # fast core, seconds
npx vitest run tests/touch tests/app                                 # touch model + UI rules, seconds
npx vitest run tests/ui-proof.test.ts                                # the committed evidence pack
npx vitest run tests/sim/perf.test.ts                                  # perf gate — run ALONE
npm run test:slow-ai                                                   # fairness + teams only
npm run test:unit                                                      # everything except perf + slow AI
npx vitest run --exclude tests/ui-phase4.test.ts                       # fast sweep during development
```

**The perf gate measures wall clock, so it must run alone.** Under CPU contention (six Playwright
sessions) it has measured 114.8× against a 90× ceiling while the same code measures 42–48× on a quiet
machine. CI runs it first, isolated, for exactly this reason. If it fails, check what else is running
before assuming a regression.

**The browser UI gates need the app served.** They read `PROOF_BASE`:

```bash
npx vite --host 127.0.0.1 --port 5343 --strictPort &
PROOF_BASE=http://127.0.0.1:5343 npm run test:unit
```

**Note on `vite-node` and CLI arguments.** `vite-node script.ts --seeds a,b` passes the flag through
to the runner, so `process.argv.indexOf('--seeds')` can resolve to the runner's own copy and yield
`NaN`. Prefer positional arguments in new harnesses, or read `process.argv.slice(2)` and filter out
`--` prefixed tokens.

---

## 6. The tournament and the proof captures

### 6.1 The AI tournament

```bash
npm run tournament:ai     # 12 seeds x 2 sides x 4 matchups = 96 matches, hours of CPU
npm run proof:ai          # regenerate docs/proof/phase-5/ai/report.md from tournament.json
```

`tournament:ai` writes `docs/proof/phase-5/ai/tournament.json`; `proof:ai` renders `report.md` from
it. **Do not hand-edit `report.md`** — it is generated, and `tests/phase5-tournament.test.ts` checks
the committed JSON against the contract.

Every matchup is **side-swapped**: each seed is played twice, once with difficulty A in corner 0 and
once in corner 1. That is what separates a slot bias from a corner bias. Keep it.

Faster harnesses for iteration (all in `v2/audit/`, all print their own numbers):

| Harness | What it measures |
|---|---|
| `ai-tournament-cli.ts` | the full bracket, `--seeds --minutes --jobs --json` |
| `ai-tournament-parallel.ts` | the worker pool (`runPool`, `summarise`); parallelism is proven not to change results by `tests/ai-parallel.test.ts` |
| `ai-smoke.ts` | **the CI gate**: 4 short matches asserting termination, no stalls, no idle army, same-seed determinism. Deliberately not a balance measurement. |
| `mirror-par.ts` | mirror with Wilson CI, both corner assignments per seed — **the fairness instrument** |
| `corner-pairs.ts` | every ordered corner pairing; reciprocal pairings are the signature of a symmetric game |
| `symmetry-break.ts` | reflects one player's entities through the axis and reports the first divergence of a mirrored match |
| `team-termination.ts` | 2v2 and 4-FFA termination with per-seed lengths |
| `ai-termination-scan.ts` | per-seed termination, no-spend and idle-army for one matchup |
| `capture-midgame.ts` / `capture-overview.ts` / `record-match.ts` | proof captures (see below) |

### 6.2 Proof captures

```bash
PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-overview.ts
CAPTURE_SEED=1000 CAPTURE_D0=hard CAPTURE_D1=normal OVERVIEW_MIN=9 OVERVIEW_SIDE=0 \
  PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-overview.ts
PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-midgame.ts
RECORD_SEED=1000 RECORD_D0=hard RECORD_D1=normal PROOF_BASE=http://127.0.0.1:5343 \
  npx vite-node audit/record-match.ts
```

Captures **wait on the simulation clock**, not on wall time, so a shot labelled "t=9.3 min" really
was taken at 9.3 minutes. `capture-overview.ts` also burns the live counts into the overlay, so the
caption's numbers are the numbers in the frame. If a match ends before the target minute, the file is
named with the actual time rather than mislabelled.

The in-page hook `window.__v2` exposes `{ state, renderer, registry }` for harnesses. The spectate
page accepts `?seed=&d0=&d1=&speed=`; player ids are `p1`/`p2` and must match the tournament's.

### 6.2.1 The Phase 7a evidence packs

```bash
# UI and touch proof: every screen, every in-match interaction state, five viewports.
# Writes docs/proof/phase-7/ui/ (75 PNGs + ui-proof.json) and is guarded by tests/ui-proof.test.ts.
PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-ui-proof.ts

# The two-browser active match: builds, trains, marches and fights through the real HUD.
# Needs the relay on 8787 and the app on 5343 (see §5.1). Writes docs/proof/phase-7/multiplayer/.
MP_PLAY_SECONDS=150 npx playwright test tests/net/browser-match.spec.ts
```

Both harnesses are SLOW by design — the UI pack is ~7 minutes across five viewports, the match proof is
~3.5 minutes of real match — so they are proof generators, not gates. The fast gates are
`tests/ui-proof.test.ts` (guards the committed pack in ~2 s) and the unit suites.

The proof pack is committed, so `tests/ui-proof.test.ts` fails if a capture is missing, blank, a duplicate
of another, or carries measurements that contradict the layout contract. **If you change the HUD, regenerate
the pack** or that suite will fail — which is the intent.

**Restart the dev server after editing `src/main.ts`** — it is not always picked up by HMR.

### 6.3 CI

`.github/workflows/ci.yml`, the `v2` job. In order, and the order matters:

1. `npm ci`, install Chromium
2. `npm run typecheck`
3. `npm run lint` (sim purity + UI style + no purple)
4. start Vite on 5343 in the background
5. **`tests/sim/perf.test.ts` alone** — wall clock, must not share a CPU
6. **`audit/ai-smoke.ts`** — termination, stalls, determinism
7. **`npm run test:slow-ai` alone** — fairness and teams, before any browser opens, because fourteen
   Playwright sessions starved them of CPU and produced `page.goto` timeouts that had nothing to do
   with the assertion
8. **`npm run test:slow-net` alone** — the Phase 6 lockstep suites (2–4 peers through the relay, desync,
   latency/jitter, rejoin). ~12 minutes of CPU, excluded from `test:unit` for the same reason as above.
9. `npm run test:unit` with `PROOF_BASE` — everything else, including the live UI gates
10. stop Vite
11. `npm run build`, then assert all five deployed entries, the atlas manifest and the fonts exist

### 6.4 Running a multiplayer match by hand

The relay needs `ws` and `zod`. Neither is installed under `v2/` (the relay is v1 code and v2 must not
depend on it), so link them into the repository root's `node_modules` — this is a dev-only step and
`node_modules` is gitignored:

```bash
cd /agent/repos/wizz
mkdir -p node_modules
ln -sfn "$(cd v2 && node -p 'require.resolve("zod") + "/.."')" node_modules/zod
npm install ws --no-save            # or link an existing ws
node --experimental-strip-types relay/server.mjs    # relay on :8787, health at /health

cd v2 && npx vite --host 127.0.0.1 --port 5343      # app on :5343
```

Then open `http://127.0.0.1:5343/app.html?screen=multiplayer&relay=ws://127.0.0.1:8787`, press
**Create a room**, and open the resulting `?room=CODE` URL in a second browser. The second player
presses **Ready**; the host presses **Start**. `window.__v2Net` exposes `{ state, session, playerId,
hash(), hashAt(t), hashTicks() }` for harnesses.

The Playwright proof drives that whole flow automatically:

```bash
cd v2 && MP_PLAY_SECONDS=60 npx playwright test tests/net/browser-match.spec.ts
```

**`v2/docs/proof/phase-6/` is the reference for what a real run looks like** — screenshots, video, and
the per-tick hash comparison in `browser-match.log`.

---

## 7. Known open issues and caveats

### 7.0 Phase 6 re-measurement — read this before quoting any Phase 5 number

Three sim defects were found in Phase 6 that suppressed the real Phase 5 numbers, and they are fixed. **Every
Phase 5 balance figure quoted anywhere in this document was measured on a build with the first of them in it.**

1. **NaN velocity from an order-type fall-through.** `movementSystem` read `order.x`/`order.y` unconditionally, but
   `harvest`, `attack` and `hold` orders carry no coordinates. Every harvesting worker computed
   `goalX = undefined + offset = NaN` and wrote NaN to `velX`, `velY` and `facing`. `audit/nan-guard.ts` measured
   **282,204 non-finite values in one match**, first at tick 19. `facing` is in `hashState` (so the lockstep hash
   was a function of NaN bits) and is read by turret arcs. It also changed outcomes: seed 1000's mirror ran 13.0 min
   before the fix and 18.2 min after. Fixed, and gated by `tests/sim/finite-state.test.ts`.
2. **Navigation ties preferred +x.** `bestNeighborSteer` kept the first neighbour that improved on the current
   cost, and `NEIGHBORS` is ordered `[1,0],[-1,0],...` — so every exact cost tie broke toward +x. **595 of 1221
   sampled tiles steered differently from their own reflection.** Fixed with a reflection-invariant `mirrorRank`;
   now **41,516/41,516 symmetric**.
3. **The map was symmetric on one axis only.** 40 tiles and 32 heights differed about the HORIZONTAL axis, 24 of
   them at the nav level. Corners 0/1 are the top edge and 2/3 the bottom, so the bottom half was a different game:
   `audit/corner-pairs.ts` measured corner 3 beating every other corner in both directions. Fixed by reflecting the
   top-left quadrant; `tests/data/parity.test.ts` now asserts both axes where it previously asserted only one.

**The full re-measurement is in `docs/proof/phase-5/ai/phase6-fairness.md`.** Numbers from it, which supersede
anything in §7.1:

| Target | Result | Met |
|---|---|---|
| Mirror, 44 games, 95% CI contains 50% | **61.4%, CI 46.6–74.3%**, 0 unfinished | **yes** |
| Median 1v1 length 15–25 min | **~12.7 min** (12.0 hard/normal, 12.7 mirror), 1 unfinished in one 20-game cell | **no** |
| Difficulty ladder ≥ 70% each | Hard>Normal **60.0%**, Normal>Easy **90.0%** | **half** |

### 7.1 Phase 5 targets that are NOT met (re-measured in Phase 6)

**Step 0's four gates, final status:**

| Gate | Result | Met |
|---|---|---|
| (a) Mirror ≥40 games, 95% Wilson CI contains 50% | **61.4%, CI 46.6–74.3%**, 0 unfinished, 44 games | **yes** |
| (b) Median 1v1 in 15–25 min, 0 unfinished | mirror **19.3 min**, 0 unfinished | **yes** |
| (c) Hard>Normal and Normal>Easy both ≥70% | **85.0%** and **85.0%**, 0 unfinished | **yes** |
| (d) Overview shot showing both bases WITH EXPANSIONS | **not obtainable — see item 3** | **no** |

Remaining issues, with numbers:

1. **Match length is in band for an even 1v1 but shorter for mismatched pairings**: hard/normal 12.6 min,
   normal/easy 9.0, hard/easy 12.8 — all 0 unfinished. HQ HP is confirmed dead as a lever (4000 → 12.7, 6000 →
   13.3, 8000 → 13.6) and so is production capacity (`targetProduction` 2/3/4 → 12.7 / 13.2 / 12.6). Lengthening
   the mismatched cells needs a comeback mechanic or a better defensive AI; both are written up as **Proposal 1**
   in `docs/proof/phase-6/BALANCE_PROPOSALS.md` and neither was implemented, because the first is a rule change and
   the second is a real AI project. Do not re-sweep HQ HP.
2. **The corner split is 50.0% / 72.7%.** The pooled slot figure the gate asks about is 61.4% with a CI containing
   50%, and the map is verified symmetric on both axes (0 mismatches at the tile, height and nav levels), so this is
   an ordering effect a 44-game sample cannot localise. Reported, not explained away.
3. **The AI does not expand, so the "both bases with expansions" shot is unobtainable.** Phase 5 said the AI "does
   not expand before winning"; Phase 6 measured it precisely and the answer is stronger — **the AI never expands at
   all**. Every refinery and construction-yard position over a whole match on seed 1000:

   ```
   t=6m  p1: sanctum@(464,464) attunement_spire@(544,544) attunement_spire@(480,544)
   t=18m p1: sanctum@(464,464) attunement_spire@(544,544) attunement_spire@(480,544)
   ```

   Nothing is placed outside the starting cluster at any point. (An intermediate harness counted "3 bases" and
   appeared to prove otherwise; it was grouping refineries within 12 tiles, and those three anchors are the sanctum
   plus two refineries 64 units apart inside the same base. The wrong reading is recorded in
   `audit/capture-expansion.ts` so it is not repeated.)

   Step 0(d) therefore **cannot be met as literally specified**. What is committed instead is
   `docs/proof/phase-5/ai/footprint-{phone,chromebook}-11min.png`: the widest footprint a side actually holds,
   framed so a reviewer sees everything it owns, with the true counts burned into the frame ("1 base, 10 buildings,
   6 workers, 6 army"). A shot implying a second base would be false.
4. **Phase 2's perf target was missed and reported.** See `docs/PHASE_2_REPORT.md`; the sim is within budget but
   the phase's stated goal was stricter. Do not silently reclassify it as met.
5. **4-player free-for-all termination is knife-edge.** The committed seed resolves (27.1 min) and `normal`-only
   FFA is fine, but 2 of 7 seeds tested ran to the cap, and the outcome is sensitive to ANY change in the AI
   decision cadence (measured: per-pass jitter, 1-in-16 jitter and a constant offset all broke it, which is why the
   jitter was reverted). Peers stay perfectly in sync on the stalled seeds, so this is a balance issue, not a
   networking one. **Proposal 3** in `docs/proof/phase-6/BALANCE_PROPOSALS.md` suggests making the existing
   `allIn` path fire sooner in 3+ team games.

### 7.2 Things that will bite you

- **The full tournament takes hours.** Use `ai-smoke.ts` for a fast signal and
  `ai-tournament-parallel.ts --jobs 4` for real numbers. On a 4-core box, four workers is the useful
  maximum.
- **`runPool` returns a same-length array**, so a failed worker leaves `undefined` at its index.
  Always guard before indexing.
- **Sweeps that edit `data/*.json` must restore from v1 (`../data/`) afterwards** and verify. Never
  leave dirty data files. Avoid globs like `rm -f audit/*.ts` — that has already deleted a harness
  set once.
- **A `profileFor` override object is shared unless copied.** Sweeps rely on per-brain overrides;
  `profileFor` returns `{...base}` so an override cannot leak between players.
- **Two players at the same start corner is not a legal configuration** — the second sanctum fails to
  spawn and the match is meaningless. Do not use it as a fairness test.
- **The sim allocates four RNG streams but almost nothing draws from them.** Seed variation currently
  comes from a symmetric decision-pass phase derived from the seed. If you add randomness, add it to a
  **named stream** and make it symmetric in expectation, or you will recreate the fairness bug.

### 7.2.1 Limitations of the playtest-response pass, stated plainly

1. **The two-browser match is funded via `devSetMana`.** Waiting out the real economy would make the proof a
   pacing test rather than a multiplayer one. The command is a real protocol message validated by the
   relay's own schema and applied identically on every peer, so the lockstep chain is fully exercised — but
   the MATCH IT PLAYS IS NOT A BALANCED 1v1. Do not read win/loss from it. What it proves is that two
   independent browsers can build, train, march and fight without desyncing.
2. **One side usually loses its army.** The guest won the committed run (7 units left against 0) because the
   host's units arrived piecemeal after repeated re-orders. That is the harness marching both armies at one
   point, not a balance signal.
3. **The guest is a phone at 667×375 with touch.** Its main thread services real touch events, so its
   sampling and its interactions are measurably slower than the host's. The tick-drift assertion is a
   SAMPLING bound (6 s), not a sync bound; the sync claim rests entirely on the common-tick hash comparison.
4. **The UI pack is five viewports, not every device.** 1024×600 and 844×390 portrait are not covered, and
   no real hardware was used — all captures are Chromium with SwiftShader. Frame pacing on real GPUs is
   still unmeasured (see §7.3 of the earlier caveats).
5. **The radar's map is drawn from tile data, not the renderer.** It shows passability, fog, entities and
   the camera footprint. It is not a downsampled render, so terrain decoration does not appear on it.
6. **Drag mode is a per-match setting.** Settings offers `Auto | Pan | Box` and it is persisted, but it is
   read when a match mounts, so a change takes effect on the NEXT match rather than immediately. `?drag=`
   overrides it for the proof harness.

### 7.3 Caveats about the evidence

- Frame-pacing numbers in the plan are **SwiftShader** (software rasteriser) figures. They are useful
  only as an internally-comparable baseline, never as a claim about Chromebook or phone GPUs.
- Several older proof images predate the current build. `docs/proof/phase-5/ai/report.md` is generated
  and its numbers reflect the build at generation time — regenerate it rather than quoting it.
- `v2/audit/` contains 126 harnesses, many from earlier phases. Not all still reflect current
  behaviour. Each one prints its own numbers; treat a harness as evidence only if you re-ran it on
  the current commit.

---

## 8. What comes next — Phases 6 to 8

From `v2/docs/REBUILD_PLAN.md` §8. Summary, with the done-criteria that gate each phase.

### 8.0 The playtest-response pass — what changed under §8, and why

Zachary opened the deployed preview and reported three things, in order of how much they matter:

> "the touch controls should be basically the same as the first one"
> "the menus should very much feel like mobile command and conquer"
> and multiplayer should be "wired to the live server" and proven with a real active two-browser match.

All three are addressed. What follows is what to know before touching any of it.

**Touch controls** (`src/app/input/`, zero imports from v1 — `tests/isolation.test.ts` still enforces
that). `gesture.ts` re-derives v1's recogniser as a pure, clock-driven state machine: tap, one-finger
pan, box select (by drag or by 400 ms long press), pinch with two-finger pan, double-tap select-type.
`picking.ts` picks in SCREEN space with the terrain lift applied. `board-input.ts` is v1's controller
model against v2's command vocabulary. `pointer-binder.ts` owns capture and contextmenu.

**Three real gesture defects were found by the browser proof, not by reading the code.** They are pinned
by name in `tests/touch/gesture.test.ts`:
- a held-but-still press was promoted to a zero-area box that CLEARED the selection (a slow tap looked
  like "my taps only work sometimes");
- `suppressTapUntilAllPointersUp` was not cleared on the pan and box end paths, so after any pan **every
  later tap was dropped** for the rest of the match;
- both of the above only showed up on touch, so a desktop-only proof would have shipped them.

**Camera** (`src/render/camera.ts`). Clamping moved to PROJECTED space; `frameOn()` derives zoom from the
viewport and centres the point in the HUD-free safe rect. The measured result is in
`docs/proof/phase-7/ui/README.md`. Two things worth knowing before changing it:
- **Whole-rect coverage is the wrong objective.** A diamond board cannot fill a rectangle from a corner.
  The first attempt at a fix maximised coverage and produced a camera zoomed out far enough to show the
  whole board surrounded by empty ground — a regression the pixel gate caught and that the coverage
  metric would have called an improvement.
- **The starting zoom must leave headroom.** On a 1366×768 screen centring the base needs zoom 2.0, which
  is `MAX_ZOOM`; a match that STARTS at the ceiling cannot zoom in at all, which the pinch proof caught.
  `frameOn` stops at `MAX_ZOOM - 0.15`.

**HUD** (`src/app/hud.ts`, `hud.css`). Docked sidebar in landscape, bottom console in portrait, one grid
with a `data-layout` attribute. Four labelled categories, real atlas thumbnails, mana cost, build/train
progress, queue badge, a power BAR, a toggleable radar, eight labelled command buttons. The old 18%-of-area
budget is REPLACED by what actually matters — battlefield share (measured 0.715–0.838), a 28px control floor
(measured 30–34), and the presence of the controls themselves. The reasoning is in the section comment at
the top of `hud.css`; do not reintroduce the area rule without reading it.

**Menus** (`screens/*.ts`, `console.css`). One primary copper action each, labelled steel plates,
thumb-sized rows, a footer that does not move. The menu keeps the live 3D scene in one of two shapes:
landscape splits console-left/scene-right, portrait spans the console over a dimmed scene.

**Multiplayer** (`screens/multiplayer.ts`). `resolveRelayUrl` now defaults to `wss://wizzrts.up.railway.app`,
honours `VITE_RELAY_URL` and `?relay=`, and normalises pasted URLs. The room screen has copy-code and
copy-invite buttons and a real connection state. **The VM can reach the live relay directly**, verified by
`audit/live-relay-check.ts` (output committed as
`docs/proof/phase-7/multiplayer/live-relay-check.log`): two independent clients are seated as different
players in one room on one seed, and the room is released when they leave. The two-browser match proof still
runs against the LOCAL relay so its timings stay deterministic.

One factual correction worth keeping: the brief stated `/health` sends `Access-Control-Allow-Origin: *`.
Measured, it does not. That is harmless — CORS does not apply to WebSocket upgrades — so the harness asserts
health and seating instead of a header the protocol does not need.

**The two-browser proof** (`tests/net/browser-match.spec.ts`) now plays a real match: both peers build the
tech chain in order, queue combat units, march to the map centre through the HUD, and engage. It measures
command counts, entity growth, damage events and deaths from the SIMULATION's event stream (`onEvents` on
`LockstepSession`, counters on `window.__v2Net`), and compares 132+ common ticks with zero mismatches.
Six defects were found getting it green and each is recorded where it lives; the most instructive is that
on a 667×375 phone the seeded placement ghost projects UNDER the sidebar, so the proof pans to the ghost
and taps the safe rect's centre — which is what a player does.

**What is NOT done here, deliberately.** The AI expansion regression and balance/fairness measurements
are untouched: no file under `src/ai/` changed, and the parity exceptions in §3 are unchanged. That work
is a separate pass.

### Phase 6 — Multiplayer (2–4 players) — **COMPLETE**

**Built:** `v2/src/net/` — protocol, lockstep client, session, in-process relay, harness, lobby, stall policy,
WebSocket transport, bot client — plus `v2/src/sim/snapshot.ts` for rejoin, a multiplayer screen, and
`NetworkedMatch` to give the existing HUD a lockstep-backed match. **The v1 relay is unmodified.**

**Done-criteria, measured:**

| Criterion | Result |
|---|---|
| 2, 3, 4 peers in sync | headless: 2, 3, 4-FFA and 2v2 all reach a decided match with identical hashes and 0 desyncs. Browsers: **38 common ticks compared, 0 mismatched** |
| Forced desync detected with a replay | detected at the forced tick; capture carries both hashes, seed, map, slots and a command log from tick 0. A clean-match **control** proves the detector is not always-on |
| Background/resume does not trip the banner; a real stall does | 10 pure cases: hidden tab forgiven, freeze jump forgiven, genuine stall shows the hint, catch-up says "syncing" |
| Rejoin restores a live match | drops of 3 s, 20 s and 15 s in a 4-player match all end in sync; snapshot restore continues identically for 200 ticks |
| The unchanged v1 relay serves v2 peers | 48 wire cases through the relay's own validator, including all 23 command variants, with a drift guard on the copied validator |

**Evidence:** `v2/docs/proof/phase-6/README.md` (screenshots, video, `browser-match.json`, run logs).

**How to run the browser proof:** see §5.1.

### Phase 7 — PWA, content completion, polish, performance

**Build:** manifest, service worker, cache headers, icons, install prompt, orientation lock, resume;
**5 maps** completed and map-linted; **3 factions** with real filtering; research-tree content wired
into both AI and UI; an audio pass; bundle splitting to hit the gzip budget.

**Done-criteria:** installable on Android Chrome and desktop Chromium (documented manual check); cold
TTI ≤ 6 s on throttled Fast 3G; **main chunk ≤ 150 kB gzip** (v1: 236.7 kB); all 5 maps pass map-lint;
all 3 factions buildable and playable with Arcane numbers still byte-identical to v1; 20-minute memory
soak ≤ 250 MB.

**Carry these into Phase 7 — they are measured, not guesses:**

1. **Multiplayer needs no relay change, but it does need a relay URL.** `src/app/screens/multiplayer.ts`
   resolves it from the page origin and accepts `?relay=ws://host:port`. The deployed Pages project will
   need the Railway relay reachable from it, and `public/_headers` already carries the `/v2/` cache rules.
2. **`tests/net/` has no unit-test budget yet.** The suites there total ~25 minutes of CPU
   (`lockstep-relay` alone is ~14). They must go in a slow job, not `test:unit`. Suggested split: everything
   except `lockstep-relay.test.ts`, `desync.test.ts`, `latency-jitter.test.ts` and `rejoin.test.ts` can run
   with the unit gate; those four belong beside `test:slow-ai`.
3. **The browser spec is not in CI.** It needs a relay on 8787 and the app on 5343. `playwright.config.ts`
   exists and `npm run test:browser` is wired; CI does not start the relay, so it is a documented manual
   proof for now. Adding it means installing `ws`+`zod` for the relay (see §5.1) in the workflow.
4. **`docs/proof/phase-6/video/*.webm` is 18 MB.** Consider whether the final evidence pack should carry it
   or a trimmed clip.
5. **The 4-player FFA can stall** (2 of 6 seeds hit the cap). Not a Phase 7 blocker, but if Phase 7 ships
   4-player maps this will be visible.

### Phase 7 — PWA, content completion, polish, performance

**Build:** manifest, service worker, cache headers, icons, install prompt, orientation lock, resume;
**5 maps** completed and map-linted; **3 factions** with real filtering; research-tree content wired
into both AI and UI; an audio pass; bundle splitting to hit the gzip budget.

**Done-criteria:** installable on Android Chrome and desktop Chromium (documented manual check); cold
TTI ≤ 6 s on throttled Fast 3G; **main chunk ≤ 150 kB gzip** (v1: 236.7 kB); all 5 maps pass map-lint;
all 3 factions buildable and playable with Arcane numbers still byte-identical to v1; 20-minute memory
soak ≤ 250 MB.

### Phase 8 — Balance, conformance re-run, deploy, final proof

**Build:** a full conformance re-run against v1 for every unchanged rule; a balance pass against the
20-minute target; deployment to a **separate** Cloudflare Pages project `wizz-aw8-v2`, leaving
`wizz-aw8` (which serves v1) untouched.

**Done-criteria:** every unchanged rule matches v1 and every changed rule is asserted as the new
behaviour with a link to its decision; balance harness shows median 1v1 14–24 min and no faction above
a 60% win rate over 20 matches; v2 is live on `wizz-aw8-v2` and `wizz-aw8` still serves v1 (verified);
the final evidence pack has before/after tables, the full video suite, and the inventory checklist
fully marked.

---

## 9. Where to look first

| I want to… | Go to |
|---|---|
| understand a rule decision | `v2/docs/REBUILD_PLAN.md` §3 |
| see what a phase actually proved | `v2/docs/PHASE_{1,2,3}_REPORT.md`, `v2/docs/proof/phase-4/README.md`, `v2/docs/proof/phase-5/ai/README.md` |
| understand the AI | `v2/src/ai/perception.ts` first (it defines what the AI may know), then `brain.ts`, `economy.ts`, `military.ts`, `difficulty.ts` |
| understand a tick | `v2/src/sim/step.ts` — the comment block on `SYSTEM_ORDER` |
| know what the AI may NOT do | `v2/tests/phase5-maphack.test.ts` |
| **understand multiplayer** | `v2/src/net/lockstep.ts` (the buffering rule), then `session.ts` (what one peer owns), then `README.md` in `docs/proof/phase-6/` for what was actually proven |
| **know why a desync is reported** | `LockstepSession.stepOne` — the comparison, the two-consecutive-reports rule, and `DesyncCapture` (the replay) |
| **add a network message** | `v2/src/net/protocol.ts`, then run `tests/net/wire-compat.test.ts`: the relay validates every frame and silently drops one it does not recognise |
| know what is allowed to differ from v1 | `v2/tests/data/parity.test.ts` (`APPROVED_VALUE_EXCEPTIONS`) |
| add a UI component | `v2/docs/UI_STYLE_GUIDE.md` then `v2/src/ui/tokens.css` |
| **change the HUD** | `v2/src/app/hud.ts` and `hud.css` (read the section comment at the top of each first), then REGENERATE `docs/proof/phase-7/ui/` or `tests/ui-proof.test.ts` fails |
| **change touch input** | `v2/src/app/input/`: `gesture.ts` (the state machine), `picking.ts` (screen-space hit tests), `board-input.ts` (commands), `pointer-binder.ts` (DOM). Pin any new behaviour in `tests/touch/` |
| **change the camera** | `v2/src/render/camera.ts`. `frameOn` is a viewport-derived zoom plus an inset-aware centring; the arithmetic is covered by `tests/touch/camera.test.ts` and the result by `tests/ui-camera.test.ts` |
| **point a build at a different relay** | `resolveRelayUrl` in `v2/src/app/screens/multiplayer.ts`; `?relay=` beats `VITE_RELAY_URL` beats the localhost default beats Railway |
| **see what a real multiplayer match looks like** | `v2/docs/proof/phase-7/multiplayer/browser-match.log` — the timeline of a 150 s match with damage and marches |
| **check the live relay** | `cd v2 && npx vite-node audit/live-relay-check.ts` — needs outbound network, so it is not in CI |
| add a sprite | `v2/docs/ART_DIRECTION.md` then `v2/art/` |
| measure something | `v2/audit/` — read a nearby harness and copy its shape; they all print their own numbers |
| **see the fairness and balance numbers** | `v2/docs/proof/phase-5/ai/phase6-fairness.md` — the authoritative mirror, length and ladder measurement, including the three sim defects that invalidated the Phase 5 figures |
