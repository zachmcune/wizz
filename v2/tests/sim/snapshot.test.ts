// SNAPSHOT ROUND-TRIP — a restored state must hash identically to the state it came from.
//
// This is the correctness bar for two Phase 6 features at once:
//
//   • SNAPSHOT RESYNC — a peer that fell too far behind jumps forward instead of replaying the backlog.
//   • REJOIN — a player who disconnects and comes back gets the host's live state.
//
// Both are only safe if `hashState(restore(serialize(s))) === hashState(s)`. If it is not, the very act of
// helping a lagging peer introduces the desync that the checksum comparison then reports — the failure mode
// would be "rejoin always desyncs", which is worse than not rejoining at all.
//
// The test uses a REAL match state rather than a handcrafted one, because the interesting cases (projectiles
// in flight, units mid-harvest with carry in their capability payload, buildings under construction,
// superweapon beams, buffs with expiry ticks) only appear after a few minutes of play.
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/data/loader';
import { initMatch } from '../../src/sim/factory';
import { stepSimulation } from '../../src/sim/step';
import { hashState } from '../../src/sim/hash';
import { encodeSnapshot, decodeSnapshot, restoreState, SNAPSHOT_VERSION } from '../../src/sim/snapshot';
import { AiDriver } from '../../src/ai/driver';

const TICK_HZ = 20;

/** Play a real match for `minutes` and return its live state. */
function playedState(seed: number, minutes: number) {
  const registry = loadRegistry();
  const { state, services } = initMatch(registry, {
    mapId: 'duel_glade',
    seed,
    oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    ],
  } as never);
  const driver = new AiDriver(registry, services);
  const limit = minutes * 60 * TICK_HZ;
  while (!state.ended && state.tick < limit) stepSimulation(state, services, [], driver.hook);
  return { registry, state, services };
}

describe('state snapshot: restore reproduces the exact state', () => {
  it('hashes identically at tick 0', () => {
    const { registry, state } = playedState(1000, 0);
    const restored = restoreState(registry, encodeSnapshot(state));
    expect(hashState(restored.state)).toBe(hashState(state));
  }, 120_000);

  it('hashes identically mid-match, with units harvesting and building in progress', () => {
    // 4 minutes: refineries are up, workers are on nodes with partial carry, and the first army exists.
    const { registry, state } = playedState(1000, 4);
    const before = hashState(state);
    const restored = restoreState(registry, encodeSnapshot(state));
    expect(hashState(restored.state)).toBe(before);
    // Prove the state is actually non-trivial, or this test would pass on an empty board.
    expect(state.entities.liveCount()).toBeGreaterThan(10);
    expect(state.players.some((p) => p.mana > 0)).toBe(true);
  }, 300_000);

  it('hashes identically in a late-game state with combat damage, projectiles and lost buildings', () => {
    // 9 minutes: armies have fought, so HP, orders, cooldowns and death flags all differ from their defaults.
    const { registry, state } = playedState(1021, 9);
    const before = hashState(state);
    const restored = restoreState(registry, encodeSnapshot(state));
    expect(hashState(restored.state)).toBe(before);
  }, 600_000);

  it('a restored state CONTINUES identically — the next 200 ticks hash the same as the original', () => {
    /**
     * THE PART THAT ACTUALLY MATTERS.
     *
     * Matching hashes at the moment of restore is necessary but not sufficient: a snapshot could round-trip
     * every field the hash covers and still drop something the hash does not (a capability payload, an order
     * queue). Either would diverge one tick later. Continuing both worlds for 200 ticks and comparing a hash
     * at every 20th tick catches exactly that.
     */
    const { registry, state, services } = playedState(1035, 5);
    const snapshot = encodeSnapshot(state);
    const restored = restoreState(registry, snapshot);

    for (let i = 0; i < 200; i++) {
      // Both sides are driven by the same deterministic AI, so their command streams must match.
      const origDriver = new AiDriver(registry, services);
      const restDriver = new AiDriver(registry, restored.services);
      const a = stepSimulation(state, services, [], origDriver.hook);
      const b = stepSimulation(restored.state, restored.services, [], restDriver.hook);
      void a;
      void b;
      if (i % 20 === 0) {
        expect(hashState(restored.state), `diverged at step ${i} (tick ${restored.state.tick})`).toBe(hashState(state));
      }
    }
    expect(hashState(restored.state)).toBe(hashState(state));
  }, 600_000);

  it('rejects a snapshot from a different version instead of half-reading it', () => {
    const { state } = playedState(1000, 0);
    const raw = JSON.parse(encodeSnapshot(state)) as Record<string, unknown>;
    raw.v = SNAPSHOT_VERSION + 1;
    expect(() => decodeSnapshot(JSON.stringify(raw))).toThrow(/version/);
  }, 120_000);
});
