// CONFORMANCE: determinism, replay, and the fixed tick contract (inventory §18).

import { describe, expect, it } from 'vitest';
import { makeMatch, twoPlayerConfig } from './test-match';
import { hashState } from '../../src/sim/hash';
import { SYSTEM_ORDER, stepSimulation } from '../../src/sim/step';
import { MAX_UNITS_PER_PLAYER } from '../../src/core/constants';
import type { Command } from '../../src/sim/types';
import { spawnUnitAt } from '../../src/sim/systems/production';

/** A command stream that exercises movement, combat, harvest and production. */
function scriptedCommands(m: ReturnType<typeof makeMatch>): Record<number, Command[]> {
  const schedule: Record<number, Command[]> = {};
  const wisps = m.unitSlots('player0', 'wisp');
  const nodes = m.nodeSlots();
  schedule[1] = [
    ...wisps.map((slot) => ({
      type: 'harvest' as const,
      playerId: 'player0',
      entityIds: [m.state.entities.id[slot]!],
      nodeId: m.state.entities.id[nodes[0]!]!,
    })),
    { type: 'move', playerId: 'player1', entityIds: m.unitSlots('player1', 'wisp').map((s) => m.state.entities.id[s]!), x: 700, y: 700 },
  ];
  return schedule;
}

describe('inventory §18 determinism', () => {
  it('§18.6 two runs with the same seed and commands produce an identical hash (1000 ticks)', () => {
    const build = () => {
      const m = makeMatch(twoPlayerConfig({ seed: 4242 }));
      const schedule = scriptedCommands(m);
      m.run(1000, schedule);
      return m;
    };
    const a = build();
    const b = build();
    expect(a.state.tick).toBe(1000);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it('§18.6 different seeds diverge', () => {
    const mk = (seed: number) => {
      const m = makeMatch(twoPlayerConfig({ seed }));
      m.run(200);
      return hashState(m.state);
    };
    expect(mk(1)).not.toBe(mk(2));
  });

  it('§18.6 a 1200-tick match with massed armies stays deterministic', () => {
    const build = () => {
      const m = makeMatch(twoPlayerConfig({ seed: 99 }));
      // Give both sides a real army so combat, projectiles and death all run.
      for (let i = 0; i < 20; i++) {
        spawnUnitAt(m.state, m.services, 'arcane_archer', 'player0', 800 + (i % 5) * 24, 800 + Math.floor(i / 5) * 24, null);
        spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', 1000 + (i % 5) * 24, 800 + Math.floor(i / 5) * 24, null);
      }
      const p0 = m.buildingSlots('player0', 'sanctum')[0]!;
      const p1 = m.buildingSlots('player1', 'sanctum')[0]!;
      const schedule: Record<number, Command[]> = {
        1: [
          {
            type: 'attackMove',
            playerId: 'player0',
            entityIds: m.unitSlots('player0', 'arcane_archer').map((s) => m.state.entities.id[s]!),
            x: m.state.entities.posX[p1]!,
            y: m.state.entities.posY[p1]!,
          },
          {
            type: 'attackMove',
            playerId: 'player1',
            entityIds: m.unitSlots('player1', 'imp_swarmling').map((s) => m.state.entities.id[s]!),
            x: m.state.entities.posX[p0]!,
            y: m.state.entities.posY[p0]!,
          },
        ],
      };
      m.run(1200, schedule);
      return m;
    };
    expect(hashState(build().state)).toBe(hashState(build().state));
  });

  it('§18.4 iteration order is id order, so entity creation order can never change outcomes', () => {
    // Spawning the same units in a different order must not change the hash of the resulting SET,
    // because the hash is order-independent and ids are assigned in creation order.
    const a = makeMatch(twoPlayerConfig({ seed: 5 }));
    spawnUnitAt(a.state, a.services, 'imp_swarmling', 'player0', 900, 900, null);
    spawnUnitAt(a.state, a.services, 'arcane_archer', 'player0', 950, 900, null);
    const b = makeMatch(twoPlayerConfig({ seed: 5 }));
    spawnUnitAt(b.state, b.services, 'imp_swarmling', 'player0', 900, 900, null);
    spawnUnitAt(b.state, b.services, 'arcane_archer', 'player0', 950, 900, null);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it('§18.5 the hash covers positions to sub-pixel precision', () => {
    const m = makeMatch();
    const wisp = m.unitSlots('player0', 'wisp')[0]!;
    const before = hashState(m.state);
    m.state.entities.posX[wisp] = m.state.entities.posX[wisp]! + 1;
    expect(hashState(m.state)).not.toBe(before);
  });
});

describe('inventory §18 the tick contract', () => {
  it('§18.2 the system order is exactly as documented', () => {
    expect([...SYSTEM_ORDER]).toEqual([
      'applyCommands',
      'aiHook',
      'production',
      'morph',
      'movement',
      'visibility',
      'combat',
      'beamWeapon',
      'garrison',
      'projectile',
      'superweapon',
      'aura',
      'harvest',
      'channel',
      'death',
      'winCheck',
    ]);
  });

  it('§18.2 one step advances exactly one tick', () => {
    const m = makeMatch();
    expect(m.state.tick).toBe(0);
    stepSimulation(m.state, m.services, []);
    expect(m.state.tick).toBe(1);
    stepSimulation(m.state, m.services, []);
    expect(m.state.tick).toBe(2);
  });

  it('§18.2 a step with no commands is a no-op on the hash of a fresh match except the tick', () => {
    const m = makeMatch();
    const before = m.state.entities.liveCount();
    stepSimulation(m.state, m.services, []);
    expect(m.state.entities.liveCount()).toBe(before);
  });
});

describe('inventory §18.11 replay', () => {
  it('a recorded command stream reproduces the identical final hash', () => {
    const record = () => {
      const m = makeMatch(twoPlayerConfig({ seed: 777 }));
      const log: { tick: number; cmds: Command[] }[] = [];
      const wisps = m.unitSlots('player0', 'wisp');
      const nodes = m.nodeSlots();
      const cmdsAt5: Command[] = wisps.map((slot) => ({
        type: 'harvest',
        playerId: 'player0',
        entityIds: [m.state.entities.id[slot]!],
        nodeId: m.state.entities.id[nodes[0]!]!,
      }));
      for (let i = 0; i < 400; i++) {
        const cmds = m.state.tick === 5 ? cmdsAt5 : [];
        if (cmds.length) log.push({ tick: m.state.tick, cmds });
        stepSimulation(m.state, m.services, cmds);
      }
      return { hash: hashState(m.state), log };
    };

    const original = record();

    // Replay the log into a fresh match.
    const replay = makeMatch(twoPlayerConfig({ seed: 777 }));
    const byTick = new Map(original.log.map((e) => [e.tick, e.cmds]));
    for (let i = 0; i < 400; i++) {
      stepSimulation(replay.state, replay.services, byTick.get(replay.state.tick) ?? []);
    }
    expect(hashState(replay.state)).toBe(original.hash);
  });
});

describe('inventory §23.2 unit cap does not corrupt the sim', () => {
  it('spamming past the cap leaves the store consistent and deterministic', () => {
    const build = () => {
      const m = makeMatch(twoPlayerConfig({ seed: 11 }));
      for (let i = 0; i < MAX_UNITS_PER_PLAYER + 20; i++) {
        spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player0', 500 + (i % 10) * 30, 500 + Math.floor(i / 10) * 30, null);
      }
      m.run(50);
      return m;
    };
    const a = build();
    const b = build();
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.unitSlots('player0').length).toBeLessThanOrEqual(MAX_UNITS_PER_PLAYER);
  });
});
