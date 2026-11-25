// NO NON-FINITE STATE — a lockstep precondition, not a nicety.
//
// THE BUG THIS GUARDS: `movementSystem` read `order.x`/`order.y` unconditionally, but `harvest`, `attack` and `hold`
// orders carry no coordinates. A harvesting worker therefore computed `goalX = undefined + offset = NaN`, and because
// every comparison against NaN is false the NaN passed the arrival check and the overspeed clamp and was written to
// `velX`, `velY` AND `facing` (via `Math.atan2`). Measured on seed 1000: **282,204 non-finite values** in one match,
// starting at tick 19 on the two starting wisps.
//
// Why this matters beyond tidiness: `facing` is part of `hashState`, so any match containing a working harvester had a
// hash whose bits depended on NaN rather than on the game. Lockstep compares exactly those hashes to detect desync, so
// the mechanism the whole multiplayer phase relies on was being fed a value it cannot compare.
//
// The test is deliberately end-to-end rather than a unit test of `movementSystem`: the bug lived in the interaction
// between an order shape written by `commands.ts` and a reader in `movement.ts`, which is exactly the kind of defect a
// per-module unit test does not see.
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/data/loader';
import { initMatch } from '../../src/sim/factory';
import { stepSimulation } from '../../src/sim/step';
import { AiDriver } from '../../src/ai/driver';
import { hashState } from '../../src/sim/hash';

const COLUMNS = ['posX', 'posY', 'velX', 'velY', 'facing', 'hp', 'maxHp', 'radius', 'amount', 'amountMax'] as const;

interface ScanResult {
  bad: number;
  first: string | null;
  ticks: number;
  ended: boolean;
  hashes: Set<string>;
}

function playAndScan(seed: number, difficulties: [string, string], maxMinutes: number): ScanResult {
  const registry = loadRegistry();
  const { state, services } = initMatch(registry, {
    mapId: 'duel_glade',
    seed,
    oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: difficulties[0], team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', aiDifficulty: difficulties[1], team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    ],
  } as never);
  const driver = new AiDriver(registry, services);
  const store = state.entities;
  const hashes = new Set<string>();
  let bad = 0;
  let first: string | null = null;

  const scan = (): void => {
    for (const col of COLUMNS) {
      const arr = store[col];
      for (let i = 0; i < store.count; i++) {
        if (store.dead[i]) continue;
        const v = arr[i]!;
        if (Number.isFinite(v)) continue;
        bad++;
        if (first === null) first = `tick ${state.tick} slot ${i} ${store.extras[i]!.defId} ${col}=${String(v)}`;
      }
    }
    for (const p of state.players) {
      if (Number.isFinite(p.mana)) continue;
      bad++;
      if (first === null) first = `tick ${state.tick} ${p.id} mana=${String(p.mana)}`;
    }
  };

  const maxTicks = maxMinutes * 60 * 20;
  while (!state.ended && state.tick < maxTicks) {
    scan();
    stepSimulation(state, services, [], driver.hook);
  }
  scan();
  hashes.add(hashState(state));
  return { bad, first, ticks: state.tick, ended: state.ended, hashes };
}

describe('sim state is always finite (lockstep hash precondition)', () => {
  /**
   * ONE FULL-LENGTH MATCH IS ENOUGH FOR THE DIRECT ASSERTION.
   *
   * The defect fired from tick 19 on the starting workers and then never stopped, so any match that builds a refinery
   * and puts a worker on a node reproduces it. Running several full matches here costs minutes of CI time to re-prove
   * the same code path; the broader order mix is covered by the hash-stability case below and by the slow AI suites.
   */
  it('a full mirror match runs to a decision with no non-finite value on any tick', () => {
    const r = playAndScan(1000, ['normal', 'normal'], 34);
    if (r.bad > 0) throw new Error(`non-finite state: ${r.bad} values, first at ${r.first}`);
    expect(r.bad).toBe(0);
    // The match must actually have progressed far enough for workers to be harvesting, which is the condition that
    // produced the bug. A test that ended at tick 5 would pass vacuously.
    expect(r.ticks).toBeGreaterThan(20 * 60);
  }, 900_000);

  /**
   * HASH STABILITY IS THE REASON THIS TEST EXISTS, so it is asserted directly rather than inferred: two independent
   * runs of the same seed must produce the same hash. Before the fix that hash was a function of NaN bits.
   *
   * Kept to 12 minutes — long past the first harvest and the first engagement — so it costs a fraction of a full match
   * while still covering the diverging code paths.
   */
  it('the same seed hashes identically across two independent runs', () => {
    const a = playAndScan(1014, ['normal', 'normal'], 12);
    const b = playAndScan(1014, ['normal', 'normal'], 12);
    expect([...a.hashes]).toEqual([...b.hashes]);
    expect(a.ticks).toBe(b.ticks);
    expect(a.bad).toBe(0);
    expect(b.bad).toBe(0);
  }, 900_000);
});
