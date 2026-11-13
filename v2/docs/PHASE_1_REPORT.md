# Phase 1 — Foundation: completion report

**Status: complete.** All eight done-criteria from `REBUILD_PLAN.md` §8 verified in this run.
**Scope:** `v2/` only. No v1 file was modified; nothing was merged.

---

## What was built

### Project scaffold (`v2/`)

An independent, self-contained project. It has its own `package.json`, `tsconfig.json`,
`vite.config.ts`, `vitest.config.ts` and `eslint.config.js`; it never imports from v1 and v1 never
imports from it (enforced by `tests/isolation.test.ts`).

| File | Purpose |
|---|---|
| `v2/package.json` | Own dependency set — only `zod` at runtime, so the bundle stays tiny |
| `v2/tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax` |
| `v2/eslint.config.js` | Ported determinism guard + Node-script scope |
| `v2/vite.config.ts` | Static build to `v2/dist` |
| `v2/vitest.config.ts` | Isolated test glob (`tests/**`) |
| `v2/index.html` + `v2/src/main.ts` | Boot screen that renders real registry data (Phase-1 evidence surface) |

### Core (`v2/src/core/`)

| Module | Contents | Notes for v2 |
|---|---|---|
| `constants.ts` | `TILE`, tile codes, `TICK_HZ = 20`, `MAX_UNITS_PER_PLAYER = 90`, zoom clamps | 20 Hz kept from v1 (content timings are authored against it) |
| `math.ts` | `Vec2`, `clamp`, `len`, `distSq`, `normalize`, `lerp`, `angleDelta`, `rotateToward` | `rotateToward` is new; v1 had it in `beam-util` |
| `rng.ts` | `Rng` (mulberry32) + **named streams** | The headline fix — see below |
| `projection.ts` | Dimetric 2.5D projection, `facingToDirection`, `visibleWorldAabb` | **Only** projection; no 2D path exists |
| `coords.ts` | `worldToTile`, `tileToWorld`, `footprintCenter`, `tileIndex` | World↔tile only; rendering goes through `projection.ts` |

### The RNG fix (v1 bug 23.1)

v1 seeded `GameState.rngState` and then **never drew from it** (evidence E12/E13 in the plan), so
the lobby seed had no effect on any match. v2 replaces it with a design that makes the failure mode
impossible:

```12:30:v2/src/core/rng.ts
export class Rng {
  private s: number;
  /** Number of values drawn. Tests use this to prove a stream is actually consumed. */
  draws = 0;

  constructor(seed: number, readonly stream = 'default') {
    // A zero state is a fixed point for some generators; nudge it off the origin.
    const base = (seed >>> 0) ^ 0x9e3779b9;
    this.s = mix32(base, hashString(stream));
  }
```

Three properties, each tested:

1. **Reproducible** — same seed + stream + draw order ⇒ identical sequence.
2. **Stream-isolated** — `map`, `ai`, `spawn`, `cosmetic` are independent, so tuning one subsystem
   cannot silently shift another's draws. The stream name is mixed into the seed, so a typo like
   `'aI'` produces a different stream rather than silently reusing `'ai'`.
3. **Observable** — `Rng.draws` lets a test assert a stream was *consumed*. That is precisely the
   check v1 lacked.

### Data pipeline (`v2/src/data/`)

| Module | Purpose |
|---|---|
| `defs.ts` | v2 type contracts, including new `factions` tags and map `description` |
| `schemas.ts` | Zod schemas with v2 strictness (map `heights` **required**, `art.sprite` required, hex-colour validation) |
| `registry.ts` | Typed maps + faction-filtered rosters + `hasExclusiveContent` |
| `registry-builder.ts` | **Pure** `path → JSON ⇒ Registry`, no bundler dependency |
| `loader.ts` | Thin app wrapper providing the Vite glob |
| `validate-registry.ts` | Cross-file reference checks + faction/identity rules |
| `mod-loader.ts` | Explicit-manifest overlays (no module-level mutable state) |

Splitting `registry-builder.ts` from `loader.ts` was forced by a real problem: the original single
file called `import.meta.glob` at module scope, which made it un-importable from plain Node
tooling. The corruption demo below is only possible because of that split.

### Content (`v2/data/`)

| Type | v1 | v2 | Delta |
|---|---|---|---|
| Units | 10 | **14** | +2 Verdant, +2 Obsidian |
| Buildings | 19 | **21** | +`thorn_grove`, +`obsidian_bastion` |
| Spells | 4 | 4 | unchanged |
| Projectiles | 6 | 6 | unchanged |
| Factions | 1 | **3** | +Verdant Concord, +Obsidian Pact |
| Maps | 1 | **5** | +Ashen Steps, +Tideglass, +Sunken Vault, +Ember Reach |
| Research | 0 | **8** | the tree v1 shipped without content for |
| Match presets | 4 | 4 | unchanged |

All v1 content was migrated by `v2/scripts/migrate-v1-content.mjs` and is **byte-identical** except
for the two deliberate additions documented in the parity test (`art.sprite` where v1 omitted it,
and `factions` tags).

### Map linting (`v2/src/map-lint.ts`)

A linter that proves a map is *playable*, not merely well-formed: mutual reachability of starts
(honouring the sim's ramp rule), node proximity, 3×3 build space, and node access. **It immediately
caught two real bugs in my own generated maps** — two `ember_reach` nodes sealed behind a caldera
arc — which I then fixed in `scripts/gen-maps.mjs`.

### Entity storage (`v2/src/sim/entity-store.ts`)

Structure-of-arrays with typed columns, a dead mask, and **stable** compaction. Replaces v1's
`Map<EntityId, Entity>` + `entitiesSorted()` (33 call sites, 21 in per-tick systems, allocating and
sorting each call — the measured cause of v1's 6.995 ms/tick at 187 entities).

### State hashing (`v2/src/sim/hash.ts`)

Order-independent fold of per-slot hashes (no sorting needed), quantised so float last-bit noise
cannot cause false desyncs, and **sensitive to RNG stream positions** — a peer that drew a
different number of values is already diverged even before the board shows it.

---

## Done-criteria: evidence

Every criterion below was executed in this run. Commands are relative to `v2/`.

### 1. `typecheck`, `lint` and `test` all green

```
$ npx tsc --noEmit
(no output)

$ npx eslint .
(no output)

$ npx vitest run
 ✓ tests/core/projection.test.ts (18 tests)
 ✓ tests/data/parity.test.ts (9 tests)
 ✓ tests/map-lint.test.ts (11 tests)
 ✓ tests/sim/hash.test.ts (17 tests)
 ✓ tests/data/validation.test.ts (17 tests)
 ✓ tests/sim/entity-store.test.ts (13 tests)
 ✓ tests/core/rng.test.ts (17 tests)
 ✓ tests/isolation.test.ts (5 tests)
 ✓ tests/sim/determinism-guard.test.ts (8 tests)
 ✓ tests/data/research.test.ts (8 tests)

 Test Files  10 passed (10)
      Tests  123 passed (123)
```

### 2. Every v1 definition loads and equals v1 field-for-field

`tests/data/parity.test.ts` reads v1's JSON **directly from the repository root** (never importing
v1 code) and deep-compares. All 9 assertions pass:

```
 ✓ has the same number of definitions as v1 for every content type
 ✓ every v1 unit matches field-for-field
 ✓ every v1 building matches field-for-field
 ✓ every v1 spell matches field-for-field
 ✓ every v1 projectile matches field-for-field except its added sprite key
 ✓ balance.json is identical to v1 (the rejected rule changes are really rejected)
 ✓ the parity map (duel_glade) is identical to v1
 ✓ every v1 match preset exists with the same map, seed and players
 ✓ the eight key numbers that define the game are exactly v1
```

The last one spells out the specific numbers so a regression is unambiguous: `startingMana 900`,
`siphonPerSecond 16`, `manaNodeCapacity 12000`, `vaultSiphonMultiplier 1.3`, `wisp.carry 75`,
`wisp.speed 72`, `arcane_bolt.speed 1200`, `stone_golem.hp 600` — all exactly v1, proving the
rejected rule changes are genuinely rejected.

The definitions check is backed by a schema-level guarantee: units, buildings, projectiles,
research and maps all validate at load, and the parity test compares every field present in v1.

### 3. A corrupted data file fails with file + field path

```
$ node scripts/demo-corruption.mjs
Clean load OK: 14 units, 21 buildings.

--- Case A: a schema violation (hp = -5) ---
Content validation failed:
  Invalid data file /data/units/wisp.json -> hp: Number must be greater than 0

--- Case B: a dangling reference (producedBy = summoning_serkyl) ---
Content validation failed:
  units/arcane_archer.json: producedBy "summoning_serkyl" is not a known building

--- Case C: two schema violations in one load ---
Content validation failed:
  Invalid data file /data/units/imp_swarmling.json -> speed: Number must be greater than or equal to 0
  Invalid data file /data/units/wisp.json -> hp: Number must be greater than 0

--- Checks ---
  PASS  A names the wisp file
  PASS  A names the hp field
  PASS  A says why (must be > 0)
  PASS  B names the archer file
  PASS  B names the dangling id
  PASS  B explains it is not a known building
  PASS  C reports the wisp file
  PASS  C reports the imp file
```

Three distinct failure modes are covered: bad field value, valid file pointing at a missing id, and
multiple broken files reported in **one** run rather than stopping at the first.

### 4. Same seed ⇒ same hash; different seeds ⇒ different hashes

```
$ node scripts/demo-determinism.mjs
seed 1     → eea33c04 entities=255 draws={"map":572,"ai":546,"spawn":99}
seed 1     → eea33c04 entities=255 (second identical run)
seed 99999 → 2f914cf7 entities=254 draws={"map":572,"ai":546,"spawn":100}

  PASS  same seed reproduces the identical hash (2000 ticks)
  PASS  a different seed produces a different hash
  PASS  the map stream was actually consumed
  PASS  the ai stream was actually consumed
  PASS  the spawn stream was actually consumed
  PASS  entities were created and compacted
```

2000 ticks of seeded draws (572 map draws, 546 AI draws, 99–100 spawn draws) with periodic
compaction. This is the direct refutation of v1's bug 23.1.

### 5. The determinism guard actually fires

`tests/sim/determinism-guard.test.ts` writes known-bad files into `src/sim/__lint_fixture__/`, runs
**real ESLint** on them, asserts the specific rule and message, then deletes them. All 8 pass:

```
 ✓ rejects Math.random() inside src/sim
 ✓ rejects Date.now() inside src/sim
 ✓ rejects a rendering import inside src/sim
 ✓ rejects a UI-layer import inside src/sim
 ✓ rejects window inside src/sim
 ✓ rejects performance.now() inside src/sim
 ✓ does NOT reject clean, pure sim code
 ✓ DOES allow Math.random outside src/sim (the guard is scoped, not global)
```

The last one matters as much as the others: the guard is scoped to `src/sim`, so the renderer can
still use `Math.random` for cosmetic jitter.

### 6. Zero imports from v1

```
$ npx vitest run tests/isolation.test.ts
 ✓ no v2 source file escapes the v2 directory
 ✓ no v2 source file references v1 paths by name
 ✓ v2 has its own package.json, tsconfig and vite config
 ✓ v2 reads its own data directory, not the v1 one
```

This works by parsing every import specifier in `v2/src/**` and resolving it; anything climbing
above `v2/` fails.

### 7. v2 builds to a static `dist/`, bundle size recorded

```
$ npx vite build
dist/index.html                   0.70 kB │ gzip:  0.42 kB
dist/assets/index-CMRq4Aqv.css    1.52 kB │ gzip:  0.72 kB
dist/assets/index-wMFDNkvx.js   361.97 kB │ gzip: 38.10 kB │ map: 345.02 kB
✓ built in 490ms
```

**38.10 kB gzip** for the JS bundle, against v1's 236.70 kB main chunk — an **84 % reduction**, and
well inside the ≤ 150 kB target. Most of the win comes from not shipping PixiJS in the foundation
layer; Pixi returns in Phase 3 and the budget will be re-measured then.

### 8. Browser proof at all four viewports + a recording

```
$ node v2/audit/phase1-proof.mjs
...
All viewports: boot OK, no page errors, no horizontal overflow.
```

Per-viewport results (from `v2/docs/proof/phase-1/proof.json`):

| Viewport | Boot | Page errors | Horizontal overflow | Overflowing elements |
|---|---|---|---|---|
| 667×375 @2× | OK | 0 | no | 0 |
| 844×390 @3× | OK | 0 | no | 0 |
| 1366×768 @1× | OK | 0 | no | 0 |
| 1920×1080 @1× | OK | 0 | no | 0 |

Live values read from the running page (`window.__v2Boot`), identical at every viewport:

```
units 14 · buildings 21 · spells 4 · projectiles 6 · factions 3 · maps 5
matches 4 · research 8 · map lint issues 0 · seeds differ yes
hash(seed 1) dea65126 · hash(seed 99999) 091fed9e
RNG draws/stream 2/2/2/2 · unit cap 90 · load 20.2 ms
```

Artifacts:

| File | What it shows |
|---|---|
| `docs/proof/phase-1/phone-667x375--boot.png` | Boot screen at the smallest target |
| `docs/proof/phase-1/phone-844x390--boot.png` | Boot screen, taller phone |
| `docs/proof/phase-1/chromebook-1366x768--boot.png` | Boot screen, Chromebook |
| `docs/proof/phase-1/desktop-1920x1080--boot.png` | Boot screen, desktop |
| `docs/proof/phase-1/phase-1-boot.mp4` | 8.8 s recording: load → scroll all sections → resize to 667×375 and back |
| `docs/proof/phase-1/proof.json` | Raw per-viewport data behind the table above |

The full-page captures were byte-identical to the viewport captures at every size (the boot screen
fits without scrolling except on the smallest phone), so the duplicates were dropped rather than
committed twice.

Video verified with `ffprobe`: `vp8`, `1366x768`, `duration=8.800000`.

The same harness was additionally run against the **production build** served by `vite preview`
(`V2_BASE=http://127.0.0.1:5274`), not just the dev server:

```
All viewports: boot OK, no page errors, no horizontal overflow.
```

so the evidence covers the artifact that would actually be deployed, not only the dev bundle.

---

## Problems found and fixed during Phase 1

Recorded because they are the kind of thing a "done" claim should be honest about.

1. **Only 14 units loaded — my test expected 16.** The test was wrong, not the code: v1 ships 10
   units and I added 4. Fixed the assertion.
2. **`setDataManifest` was module-level mutable state.** It leaked between tests and made the
   overlay path untestable. Replaced with an explicit `manifest` parameter threaded through
   `applyDataOverlays`.
3. **Two nodes in `ember_reach` were sealed inside a caldera arc.** Found by the map linter on its
   first real run. Fixed by relocating them and by having the generator carve the intended walkable
   areas after painting the arcs.
4. **The map generator wrote to `v2/v2/data/maps`.** It resolved its output against `process.cwd()`,
   which is wrong when run from inside `v2/`. Now resolved relative to the script file.
5. **`import.meta.glob` at module scope made the loader un-importable from Node.** Split into
   `registry-builder.ts` (pure) + `loader.ts` (bundler glue).
6. **`liveCount()` disagreed with `isAliveSlot()` about depleted nodes.** Caught by a test; fixed so
   both use the same definition.
7. **Registry validation errors used relative paths while schema errors used absolute ones.**
   Unified on `/data/...` so every message looks the same.
8. **I wrote TypeScript syntax into a `.mjs` generator** and **asserted cloning produces different
   values** when it correctly produces the same ones. Both were my errors; both fixed.

---

## Not verified in this run

Stated plainly.

1. **Real-GPU frame rate.** This VM still has no GPU (SwiftShader). Phase 1 has no renderer, so
   nothing was lost, but the Phase-3 perf budget remains unverified.
2. **`wizz-aw8-v2` Cloudflare Pages project.** Not created — it needs Zachary's account. The build
   output and deploy steps are ready; provisioning is a Phase 7/8 action.
3. **Research effects in gameplay.** The research *content* is valid, referenced correctly, and
   acyclic; the stat pipeline that applies it lives in Phase 2's `modifiers` system, so no behaviour
   is claimed yet beyond "loads and targets real content".
4. **The new faction units in battle.** Their numbers are authored and validated, but no combat has
   run. Balance is a Phase 8 concern.

---

## What Phase 2 will cover

**Simulation core** — the deterministic game itself, still headless with no renderer:

- Entity spawning/factory: maps → players → starting Sanctum + Wisps + resource nodes.
- Nav grid and height rules: ramp-only ±1 steps, blocked tiles, footprints, gate ownership.
- Flow-field pathing plus local separation (v2 keeps flow fields; they suit group movement and
  large maps better than per-unit A*).
- Owned spatial grid for radius queries (replacing v1's per-tick full rebuild).
- All **23 player commands + 12 dev commands** with exhaustive switches.
- All 17 systems in the v1 order, with that order asserted by a test.
- Fog of war: `explored`/`visible`/`knownBuildings` ghosts, radar gating, cliff sight blocking.
- Combat: armour `vs` table, splash, chain, beams, turret arcs, charge-up, min-range, air layers,
  garrison fire, stances.
- Economy: harvest cycle, refinery deposit, Vault multiplier, repair, sell, conjure.
- Power: hard vs soft consumers, production slowdown floor.
- **`MAX_UNITS_PER_PLAYER` enforced** at produce + spawn (v1 bug 23.2).
- Determinism: 2000+ tick runs, replay reproduction, and a conformance suite that covers every rule
  in `FEATURE_INVENTORY.md` §4–§15 and names the inventory row it proves.

Phase 2's hard gate is the conformance suite: every unchanged rule must match v1 numerically, and
the two accepted changes (§3.3, §3.6) must be asserted as new behaviour with a link to their
decision.
