# Architecture

Layered, with a pure deterministic simulation at the center.

```
Input (touch -> intents) ─┐
UI (HUD, menus) ──────────┤
AI (controllers) ─────────┼──> Command Queue ──> Simulation Core (deterministic) ──> GameState
Net (later: lockstep) ────┘                                                  │
                                                                             ├──> Renderer (PixiJS reads state)
                                                                             └──> UI / Audio (via events)
```

## Golden rule

`src/sim/**` never imports rendering, DOM, audio, input, or storage. It takes `Command[]` in,
advances state on a fixed tick, and emits `GameEvent[]` out. Enforced by ESLint
(`no-restricted-imports` / `no-restricted-globals` / `no-restricted-properties`).

## The tick contract (`src/sim/step.ts`)

- Fixed rate: `TICK_HZ = 20` (`TICK_MS = 50`). Rendering interpolates between ticks.
- Systems run in a FIXED order every tick (changing it changes results):
  1. `applyCommands` 2. AI hook (emits commands for next tick) 3. `productionSystem`
  4. `morphSystem` 5. `movementSystem` 6. `visibilitySystem` 7. `combatSystem`
  8. `projectileSystem` 9. `harvestSystem` 10. `channelSystem` 11. `deathSystem`
  12. `winCheckSystem`

See `docs/MULTIPLAYER_PREP.md` for the lockstep roadmap.

## Key modules

- `src/sim/` deterministic core: `types.ts` (contracts), `step.ts`, `simulation.ts`
  (orchestrator + command queue), systems in `systems/`, pathfinding (`flow-field.ts`),
  `nav-grid.ts`, `spatial-hash.ts`, `factory.ts` (spawning + match init), `hash.ts`, `headless.ts`.
- `src/data/` loaders + Zod schemas + registries. All content is data-driven JSON in `/data`.
- `src/render/` PixiJS renderer + camera + shape sprites (placeholder art in code).
- `src/input/` gesture recognizer (FSM) + input controller (gestures -> commands).
- `src/ui/` DOM HUD overlay, menus, minimap.
- `src/ai/` layered AI controller (emits standard commands).
- `src/audio/` procedural Web Audio (no binary assets).
- `src/storage/` IndexedDB save/load + settings.
- `src/net/` lockstep transport skeleton (V2).
- `src/core/` game loop, event bus, coords, constants.

## State ownership

- Authoritative `GameState` owned by the sim (players, relations, entities, tick, rng).
- View state (selection, camera, build placement) lives in the input controller (`SessionState`), never in the sim.
- Persistent state (settings, saves) in IndexedDB.
