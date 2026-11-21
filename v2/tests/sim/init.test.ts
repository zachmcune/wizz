// The simulation boots: a match initialises with the right entities, and ticks advance.

import { describe, expect, it } from 'vitest';
import { makeMatch, twoPlayerConfig } from './test-match';
import { hashState } from '../../src/sim/hash';

describe('match initialisation (inventory §1.1, §4.1, §6.1, §7.1)', () => {
  it('creates a Sanctum and two Wisps per player', () => {
    const m = makeMatch();
    for (const owner of ['player0', 'player1']) {
      expect(m.buildingSlots(owner, 'sanctum')).toHaveLength(1);
      expect(m.unitSlots(owner, 'wisp')).toHaveLength(2);
    }
  });

  it('spawns every mana node from the map, capped by balance.manaNodeCapacity', () => {
    const m = makeMatch();
    const map = m.reg.map('duel_glade');
    const nodes = m.nodeSlots();
    expect(nodes).toHaveLength(map.manaNodes.length);
    const cap = m.reg.balance.manaNodeCapacity;
    for (const slot of nodes) {
      expect(m.state.entities.amount[slot]!).toBeGreaterThan(0);
      expect(m.state.entities.amount[slot]!).toBeLessThanOrEqual(cap);
    }
  });

  it('gives each player the configured starting mana', () => {
    const m = makeMatch();
    expect(m.state.players[0]!.mana).toBe(900);
    expect(m.state.players[1]!.mana).toBe(900);
  });

  it('unlocks the Sanctum for each player so building can start', () => {
    const m = makeMatch();
    expect(m.state.players[0]!.unlockedTech).toContain('sanctum');
    expect(m.state.players[1]!.unlockedTech).toContain('sanctum');
  });

  it('computes power from completed buildings only', () => {
    const m = makeMatch();
    // Sanctum produces 20 power and uses none.
    expect(m.state.players[0]!.power).toBe(20);
    expect(m.state.players[0]!.powerUsed).toBe(0);
  });

  it('starts both players with vision around their own base only', () => {
    const m = makeMatch();
    const p0 = m.state.players[0]!;
    const visibleCount = p0.visible.reduce((a, b) => a + b, 0);
    expect(visibleCount).toBeGreaterThan(0);
    const map = m.reg.map('duel_glade');
    expect(visibleCount).toBeLessThan(map.tileW * map.tileH * 0.5);
  });

  it('tick advances and the state stays hashable', () => {
    const m = makeMatch();
    m.run(20);
    expect(m.state.tick).toBe(20);
    expect(hashState(m.state)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic across two independent inits with the same config', () => {
    const a = makeMatch(twoPlayerConfig({ seed: 7 }));
    const b = makeMatch(twoPlayerConfig({ seed: 7 }));
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it('different seeds give different RNG stream states', () => {
    const a = makeMatch(twoPlayerConfig({ seed: 1 }));
    const b = makeMatch(twoPlayerConfig({ seed: 2 }));
    expect(a.state.rng.map).not.toBe(b.state.rng.map);
  });
});
