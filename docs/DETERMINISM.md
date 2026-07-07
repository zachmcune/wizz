# Determinism rules (HARD)

The simulation must be perfectly deterministic so that saves, replays, and (V2) lockstep
multiplayer reproduce identically. A change is not done if any rule is violated.

1. Use only the seeded PRNG (`src/sim/rng.ts`). Never `Math.random()`. (ESLint-enforced in `src/sim`.)
2. Never read wall-clock (`Date.now()`, `performance.now()`) in the sim. Time = `state.tick`.
   (`performance` is banned in `src/sim` by ESLint; the game loop uses it OUTSIDE the sim.)
3. Iterate entities in ascending `EntityId` order whenever the loop mutates state
   (`entitiesSorted()`), never rely on `Map`/`Set` insertion order for state-affecting logic.
4. No floats derived from rendering/camera/zoom may enter the sim.
5. The rng state lives in `GameState.rngState` and is threaded through, never global.
6. Sim code must run headless in Node (verified by `tests/`).

## Verification

- `tests/determinism.test.ts`: two runs of the same config+commands produce an identical
  `hashState`, including a 1200-tick AI-vs-AI match and a scripted-command replay.
- `hashState()` (`src/sim/hash.ts`) digests tick, RNG, players, and all entities (sorted).
  Includes channel/repair flags for desync detection.
