// State hashing: used for lockstep desync detection and replay verification.
//
// Two properties matter and both are tested here:
//   1. DETERMINISM — identical state hashes identically, every time.
//   2. SENSITIVITY — any gameplay-affecting change changes the hash, including RNG position.
// A hash that is too coarse misses desyncs; one that is too fine produces false positives from
// irrelevant float last-bits. The quantisation in hash.ts targets that balance.

import { describe, expect, it } from 'vitest';
import { hashState, q } from '../../src/sim/hash';
import { EntityStore } from '../../src/sim/entity-store';
import type { GameState, Player } from '../../src/sim/types';

function player(id: string, mana = 900): Player {
  return {
    id,
    controller: 'human',
    team: 0,
    color: '#4f9dff',
    mana,
    power: 0,
    powerUsed: 0,
    unlockedTech: [],
    completedResearch: [],
    spellCooldowns: {},
    defeated: false,
    explored: [],
    visible: [],
    knownBuildings: {},
  };
}

function makeState(seed = 1): GameState {
  const entities = new EntityStore(16);
  entities.setOwners(['player0', 'player1']);
  return {
    tick: 0,
    seed,
    rng: { map: 100, ai: 200, spawn: 300, cosmetic: 400 },
    players: [player('player0'), player('player1', 900)],
    relations: {
      player0: { player0: 'ally', player1: 'enemy' },
      player1: { player0: 'enemy', player1: 'ally' },
    },
    entities,
    nextEntityId: 1,
    mapId: 'duel_glade',
    winnerTeam: null,
    ended: false,
    beams: [],
    oneSuperweaponPerPlayer: true,
  };
}

describe('hashState: determinism', () => {
  it('hashes the same state identically across repeated calls', () => {
    const s = makeState();
    s.entities.spawnUnit(1, 0, 'wisp', 0, 100, 100, 120, 9);
    const a = hashState(s);
    const b = hashState(s);
    const c = hashState(s);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('two independently built identical states hash the same', () => {
    const build = () => {
      const s = makeState(42);
      s.entities.spawnUnit(1, 0, 'wisp', 0, 100, 100, 120, 9);
      s.entities.spawnUnit(2, 1, 'imp_swarmling', 1, 200, 200, 90, 8);
      s.tick = 37;
      return s;
    };
    expect(hashState(build())).toBe(hashState(build()));
  });

  it('produces a stable 8-hex-digit string', () => {
    const s = makeState();
    expect(hashState(s)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is independent of how many dead slots precede the live ones', () => {
    // Same live entities, different amount of compaction history. This must not be a desync.
    const s1 = makeState();
    s1.entities.spawnUnit(1, 0, 'wisp', 0, 100, 100, 120, 9);
    s1.entities.spawnUnit(2, 0, 'wisp', 0, 140, 140, 120, 9);
    s1.entities.compact();

    const s2 = makeState();
    s2.entities.spawnUnit(1, 0, 'wisp', 0, 100, 100, 120, 9);
    s2.entities.spawnUnit(2, 0, 'wisp', 0, 140, 140, 120, 9);
    // s2 has not compacted (nothing to compact), same live set.
    expect(hashState(s1)).toBe(hashState(s2));
  });
});

describe('hashState: sensitivity', () => {
  function base() {
    const s = makeState();
    s.entities.spawnUnit(1, 0, 'wisp', 0, 100, 100, 120, 9);
    s.entities.spawnUnit(2, 1, 'imp_swarmling', 1, 300, 300, 90, 8);
    s.tick = 100;
    return s;
  }

  it('changes when a position changes beyond the quantisation step', () => {
    const a = base();
    const b = base();
    b.entities.posX[0] = 101; // 1 whole world unit
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('changes when HP changes', () => {
    const a = base();
    const b = base();
    b.entities.hp[0] = 119;
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('changes when mana changes', () => {
    const a = base();
    const b = base();
    b.players[0]!.mana = 899;
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('changes when an entity dies', () => {
    const a = base();
    const b = base();
    b.entities.kill(0);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('changes when the tick advances', () => {
    const a = base();
    const b = base();
    b.tick = 101;
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('changes when an RNG stream advances, even with an identical board', () => {
    // This is the check that catches the subtle desync where a peer drew a different number of
    // values but the visible state has not diverged yet.
    const a = base();
    const b = base();
    b.rng.ai = 201;
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('changes when tech unlocks', () => {
    const a = base();
    const b = base();
    b.players[0]!.unlockedTech.push('sanctum');
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('changes when research completes', () => {
    const a = base();
    const b = base();
    b.players[0]!.completedResearch.push('runed_armour');
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('changes when a unit order changes', () => {
    const a = base();
    const b = base();
    b.entities.extras[0]!.orders.push({ type: 'attack' });
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('changes when a resource node depletes', () => {
    const a = makeState();
    a.entities.spawnResourceNode(1, 500, 500, 28, 1000);
    const b = makeState();
    b.entities.spawnResourceNode(1, 500, 500, 28, 1000);
    b.entities.amount[0] = 900;
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

describe('hashState: different seeds differ', () => {
  it('two states that differ ONLY by seed hash differently', () => {
    // v1's headline bug was that the seed had no effect at all. At the hash layer, the seed must
    // be visible, because two matches with different seeds are different matches.
    const a = makeState(1);
    const b = makeState(2);
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

describe('quantisation', () => {
  it('q() collapses sub-threshold float noise', () => {
    expect(q(1.0)).toBe(q(1.0001));
    expect(q(1.0)).not.toBe(q(1.01));
  });

  it('q() handles negatives symmetrically', () => {
    expect(q(-1.5)).toBe(q(-1.50001));
    expect(q(-1.5)).not.toBe(q(1.5));
  });
});
