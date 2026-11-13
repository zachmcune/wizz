// Entity store: id ordering, removal, compaction, growth, and lookup.
//
// The ordering guarantee is load-bearing for determinism (systems iterate forward and that IS
// id order), so it gets tested explicitly rather than assumed.

import { describe, expect, it } from 'vitest';
import {
  EntityStore,
  KIND_BUILDING,
  KIND_RESOURCE_NODE,
  KIND_UNIT,
  STANCE_AGGRESSIVE,
  STATE_DEAD,
  STATE_IDLE,
} from '../../src/sim/entity-store';

function store(): EntityStore {
  const s = new EntityStore(8);
  s.setOwners(['player0', 'player1']);
  return s;
}

describe('EntityStore: spawn and ordering', () => {
  it('appends entities in id order', () => {
    const s = store();
    s.spawnUnit(1, 0, 'wisp', 0, 10, 10, 100, 8);
    s.spawnUnit(2, 1, 'imp_swarmling', 1, 20, 20, 90, 8);
    s.spawnUnit(3, 0, 'arcane_archer', 2, 30, 30, 70, 8);
    expect(s.count).toBe(3);
    expect(Array.from(s.id.slice(0, s.count))).toEqual([1, 2, 3]);
    expect(s.ownerId(s.ownerIndex[0]!)).toBe('player0');
    expect(s.ownerId(s.ownerIndex[1]!)).toBe('player1');
  });

  it('rejects non-increasing ids instead of silently corrupting slot order', () => {
    const s = store();
    s.spawnUnit(5, 0, 'wisp', 0, 0, 0, 1, 1);
    expect(() => s.spawnUnit(5, 0, 'wisp', 0, 0, 0, 1, 1)).toThrow(/strictly increasing/);
    expect(() => s.spawnUnit(4, 0, 'wisp', 0, 0, 0, 1, 1)).toThrow(/strictly increasing/);
  });

  it('slotOf finds entities by id and returns -1 when absent', () => {
    const s = store();
    for (let i = 1; i <= 6; i++) s.spawnUnit(i * 3, 0, 'wisp', 0, i, i, 10, 4);
    expect(s.slotOf(9)).toBe(2);
    expect(s.slotOf(1)).toBe(-1);
    expect(s.slotOf(999)).toBe(-1);
  });

  it('stores the fields the sim needs', () => {
    const s = store();
    const i = s.spawnUnit(1, 0, 'wisp', 7, 12.5, 34.25, 120, 9);
    expect(s.posX[i]).toBe(12.5);
    expect(s.posY[i]).toBe(34.25);
    expect(s.hp[i]).toBe(120);
    expect(s.maxHp[i]).toBe(120);
    expect(s.radius[i]).toBe(9);
    expect(s.kind[i]).toBe(KIND_UNIT);
    expect(s.state[i]).toBe(STATE_IDLE);
    expect(s.stance[i]).toBe(STANCE_AGGRESSIVE);
    expect(s.extras[i]!.defId).toBe('wisp');
  });

  it('buildings and nodes carry their kind and amount', () => {
    const s = store();
    const b = s.spawnBuilding(1, 1, 'sanctum', 0, 100, 100, 2000, 48);
    const n = s.spawnResourceNode(2, 200, 200, 28.8, 5000);
    expect(s.kind[b]).toBe(KIND_BUILDING);
    expect(s.kind[n]).toBe(KIND_RESOURCE_NODE);
    expect(s.amount[n]).toBe(5000);
    expect(s.amountMax[n]).toBe(5000);
  });
});

describe('EntityStore: death and compaction', () => {
  it('kill marks dead without changing count until compaction', () => {
    const s = store();
    for (let i = 1; i <= 4; i++) s.spawnUnit(i, 0, 'wisp', 0, i, i, 10, 4);
    s.kill(1);
    expect(s.count).toBe(4);
    expect(s.dead[1]).toBe(1);
    expect(s.state[1]).toBe(STATE_DEAD);
    expect(s.liveCount()).toBe(3);
  });

  it('compaction is STABLE: surviving entities keep their id order', () => {
    const s = store();
    for (let i = 1; i <= 8; i++) s.spawnUnit(i, 0, 'wisp', 0, i, i, 10, 4);
    // Kill slots 1, 3, 6 (ids 2, 4, 7).
    s.kill(1);
    s.kill(3);
    s.kill(6);
    s.compact();
    expect(s.count).toBe(5);
    expect(Array.from(s.id.slice(0, s.count))).toEqual([1, 3, 5, 6, 8]);
    expect(s.deadCount()).toBe(0);
  });

  it('compaction moves extras with their entity', () => {
    const s = store();
    s.spawnUnit(1, 0, 'wisp', 0, 1, 1, 10, 4);
    s.spawnUnit(2, 0, 'imp_swarmling', 1, 2, 2, 10, 4);
    s.spawnUnit(3, 0, 'stone_golem', 2, 3, 3, 10, 4);
    s.extras[2]!.orders.push({ type: 'move' });
    s.kill(1);
    s.compact();
    expect(s.extras[1]!.defId).toBe('stone_golem');
    expect(s.extras[1]!.orders).toEqual([{ type: 'move' }]);
  });

  it('keeps slot order == id order after interleaved kills and spawns', () => {
    const s = store();
    for (let i = 1; i <= 5; i++) s.spawnUnit(i, 0, 'wisp', 0, i, i, 10, 4);
    s.kill(2);
    s.compact();
    s.spawnUnit(6, 0, 'wisp', 0, 6, 6, 10, 4);
    s.kill(0);
    s.compact();
    const ids = Array.from(s.id.slice(0, s.count));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('liveCount ignores dead slots and depleted nodes', () => {
    const s = store();
    s.spawnUnit(1, 0, 'wisp', 0, 0, 0, 10, 4);
    s.spawnUnit(2, 0, 'wisp', 0, 0, 0, 10, 4);
    const n = s.spawnResourceNode(3, 0, 0, 10, 100);
    s.amount[n] = 0;
    expect(s.liveCount()).toBe(2);
    expect(s.isAliveSlot(n)).toBe(false);
  });
});

describe('EntityStore: growth', () => {
  it('grows past its initial capacity without losing data', () => {
    const s = new EntityStore(4);
    s.setOwners(['p0']);
    for (let i = 1; i <= 100; i++) s.spawnUnit(i, 0, 'wisp', 0, i, i * 2, 10, 4);
    expect(s.count).toBe(100);
    expect(s.capacity).toBeGreaterThanOrEqual(100);
    expect(s.id[99]).toBe(100);
    expect(s.posX[99]).toBe(100);
    expect(s.extras[99]!.defId).toBe('wisp');
  });

  it('throws rather than silently dropping entities beyond the hard cap', () => {
    const s = new EntityStore(4);
    s.setOwners(['p0']);
    let thrown = false;
    try {
      // The cap is 4096; spawning past it must fail loudly.
      for (let i = 1; i <= 5000; i++) s.spawnUnit(i, 0, 'wisp', 0, 0, 0, 10, 4);
    } catch (e) {
      thrown = true;
      expect(String(e)).toMatch(/capacity/);
    }
    expect(thrown).toBe(true);
  });
});

describe('EntityStore: owner mapping', () => {
  it('maps owner ids to stable indices', () => {
    const s = store();
    expect(s.ownerIndexFor('player0')).toBe(0);
    expect(s.ownerIndexFor('player1')).toBe(1);
    expect(s.ownerIndexFor('nobody')).toBe(-1);
    expect(s.ownerId(0)).toBe('player0');
    expect(s.ownerId(1)).toBe('player1');
  });
});
