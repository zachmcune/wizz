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

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| Sim Web Worker | High | Done | Main-thread `Game` drives worker via `requestStep()` |
| Replay harness | High | Done | `src/sim/replay.ts` + `ReplayRecorder` in Game |
| Event throttling | Medium | Done | Repair no longer emits per-tick `manaChanged` |
| Flow-field cache bounds | Medium | — | Per-owner cache keys grow with player count — monitor |
| Spatial hash tuning | Low | — | Already used for combat queries |

## Phase 3 — Code structure (parallel with Phase 2)

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| Split `apply-commands.ts` | Medium | Done | Per-command handler modules under `systems/commands/` |
| Split `hud.ts` | Medium | Done | Panel components under `ui/hud/` |
| Remove or wire `EventBus` | Low | Done | Removed unused `event-bus.ts` |
| `sim/views.ts` query facade | Low | Done | Single import surface for render/UI |

## Phase 4 — Multiplayer integration

| Item | Status | Notes |
|------|--------|-------|
| Transport interface | Done | `Transport` in `lockstep.ts` |
| In-memory relay | Done | `in-memory-relay.ts` for tests/local dev |
| WebSocket transport | Done | `ws-transport.ts` (client; relay server TBD) |
| Input delay | Done | `INPUT_DELAY_TICKS = 3` |
| Command merge | Done | Relay merges per-tick cmds; `Game` uses `Simulation.enqueue` |
| Checksum cadence | Done | Every 60 ticks via `LockstepClient.detectDesync` |
| Replay export | Done | `serializeReplay()` + desync logging in `Game` |
| Game wiring | Done | Optional `lockstep` in `Game` opts (disables worker) |
| Two-client hash test | Done | `tests/lockstep-integration.test.ts` at tick 1200 |
| Fog per client | Done | Presentation-only (already true) |
| Playable online UI | Done | Create/Join room menu + `npm run relay` |
| PvP match config | Done | `data/match/skirmish_1v1_online.json` |
| Custom match lobby | Done | 4-slot setup UI, teams A–D, colors, corners, AI difficulty, map/faction selectors |
| Lobby relay sync | Done | `lobbyUpdate`, `claimSlot`, `slotReady`, `startMatch` over WebSocket relay |

**Note:** `Game` with `lockstep` waits for the transport to deliver confirmed per-tick commands
(`{ t: 'tick', tick, cmds }` from the relay). Use `InMemoryRelay.advanceTick()` in tests or a
WebSocket relay in production.

## What we are NOT doing (yet)

- Server-authoritative model (lockstep only — all peers simulate)
- Rollback / input prediction (add only if input delay feels bad on mobile)
- ECS rewrite (fat `Entity` is fine at current scale)

## Verification checklist before MP branch

```bash
npm run typecheck
npm test                    # determinism + balance harness must pass
```

- [x] Two clients, same seed + commands → identical `hashState` at tick 1200
- [x] Sim runs in Worker without hash drift (`tests/worker.test.ts`)
- [x] No `Math.random` / wall-clock in `src/sim/**` (ESLint enforced)
