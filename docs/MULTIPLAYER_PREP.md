# Multiplayer prep roadmap

Lockstep multiplayer is planned for V2. The sim already emits `Command[]` per tick and
`hashState()` for desync detection (`src/net/lockstep.ts`). This doc tracks what must be
solid **before** wiring transport.

## Phase 1 — Sim correctness (do now)

| Item | Status | Notes |
|------|--------|-------|
| Deterministic entity iteration | Done | `entitiesSorted()` in all mutating loops |
| Spell AoE sorted iteration | Done | `handleSpell` damage loop |
| Stronger `hashState` | Done | Includes RNG, channel/repair flags, build/morph progress |
| Discrete channel pulses | Done | 10 mana / 2s lump sum, one event per pulse |
| Injectable AI hook | Done | `Simulation` accepts `AiHook` (defaults to `aiStep`) |
| Centralized visibility | Done | `isWorldPointVisible()` in `fog.ts` |
| Architecture doc accuracy | Done | Tick order matches `step.ts` |

## Phase 2 — Performance (before public MP)

| Item | Priority | Notes |
|------|----------|-------|
| Sim Web Worker | High | `WorkerSimClient` exists but main thread runs sim today |
| Event throttling | Medium | Avoid per-tick `manaChanged` from repair; batch where possible |
| Flow-field cache bounds | Medium | Per-owner cache keys grow with player count — monitor |
| Spatial hash tuning | Low | Already used for combat queries |

## Phase 3 — Code structure (parallel with Phase 2)

| Item | Priority | Notes |
|------|----------|-------|
| Split `apply-commands.ts` | Medium | One handler file per command group |
| Split `hud.ts` | Medium | Panel components (build, train, selection) |
| Remove or wire `EventBus` | Low | Use for presentation-only event fan-out |
| `sim/views.ts` query facade | Low | Single import surface for render/UI |

## Phase 4 — Multiplayer integration

1. **Transport** — WebSocket or WebRTC data channel; implement `Transport` from `lockstep.ts`
2. **Input delay** — `INPUT_DELAY_TICKS = 3` already defined in `protocol.ts`
3. **Command merge** — All players' commands for tick N merged before `Simulation.enqueue(N, …)`
4. **Checksum cadence** — `hashState(state)` every N ticks via `LockstepClient.detectDesync`
5. **Save/replay** — Record `(seed, matchConfig, commandsByTick[])` for replays and debugging desyncs
6. **Fog per client** — Each peer runs full sim; only **presentation** is local (already true)

## What we are NOT doing (yet)

- Server-authoritative model (lockstep only — all peers simulate)
- Rollback / input prediction (add only if input delay feels bad on mobile)
- ECS rewrite (fat `Entity` is fine at current scale)

## Verification checklist before MP branch

```bash
npm run typecheck
npm test                    # determinism + balance harness must pass
```

- [ ] Two clients, same seed + commands → identical `hashState` at tick 1200
- [ ] Sim runs in Worker without hash drift (`tests/worker.test.ts`)
- [ ] No `Math.random` / wall-clock in `src/sim/**` (ESLint enforced)
