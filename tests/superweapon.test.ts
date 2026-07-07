import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity, unlockTech } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { ownedBy } from '../src/sim/queries';
import { hashState } from '../src/sim/hash';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

function battleField() {
  const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
  const sim = new Simulation(state, services);
  sim.setAiEnabled(false);
  return { state, services, sim };
}

function player0(state: ReturnType<typeof battleField>['state']) {
  return state.players.find((p) => p.id === 'player0')!;
}

function cfg(): MatchConfig {
  return reg.match('skirmish_1v1');
}

describe('superweapon (Astral Lance)', () => {
  it('launches, charges, fires, steers, damages, and expires', () => {
    const { state, sim, services } = battleField();
    const p0 = player0(state);
    unlockTech(state, 'player0', 'astral_spire');
    p0.spellCooldowns['astral_lance'] = 0;

    const victim = spawnEntity(state, services, null, 'imp_swarmling', 'player1', 500, 500);
    const hp0 = victim.hp;

    sim.enqueueNow([
      { type: 'castSpell', playerId: 'player0', spellId: 'astral_lance', x: 500, y: 500 },
    ]);
    sim.step();

    expect(state.beams.length).toBe(1);
    expect(state.beams[0]!.state).toBe('charging');

    for (let i = 0; i < 100; i++) sim.step();
    expect(state.beams[0]!.state).toBe('firing');

    sim.enqueueNow([{ type: 'steerSuperweapon', playerId: 'player0', x: 500, y: 500 }]);
    for (let i = 0; i < 20; i++) sim.step();

    expect(victim.hp).toBeLessThan(hp0);

    for (let i = 0; i < 400; i++) sim.step();
    expect(state.beams.length).toBe(0);
    expect(p0.spellCooldowns['astral_lance']).toBeGreaterThan(0);
  });

  it('blocks cast while cooldown is active', () => {
    const { state, sim } = battleField();
    const p0 = player0(state);
    unlockTech(state, 'player0', 'astral_spire');
    p0.spellCooldowns['astral_lance'] = 500;

    sim.enqueueNow([
      { type: 'castSpell', playerId: 'player0', spellId: 'astral_lance', x: 400, y: 400 },
    ]);
    sim.step();

    expect(state.beams.length).toBe(0);
  });

  it('seeds full cooldown when astral_spire finishes construction', () => {
    const { state, sim, services } = battleField();
    const p0 = player0(state);
    const b = spawnEntity(state, services, null, 'astral_spire', 'player0', 600, 600);
    if (b.kind !== 'building') throw new Error('expected building');
    b.buildProgress = 0.99;
    for (let i = 0; i < 200 && b.buildProgress !== undefined; i++) sim.step();

    expect(b.buildProgress).toBeUndefined();
    expect(p0.unlockedTech).toContain('astral_spire');
    expect(p0.spellCooldowns['astral_lance']).toBe(2400);
  });

  it('enforces one superweapon per player when toggle is on', () => {
    const { state, sim, services } = battleField();
    const p0 = player0(state);
    state.oneSuperweaponPerPlayer = true;
    unlockTech(state, 'player0', 'arcane_nexus');
    p0.mana = 10000;
    spawnEntity(state, services, null, 'astral_spire', 'player0', 400, 400);

    const before = ownedBy(state, 'player0').filter((e) => e.defId === 'astral_spire').length;
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'astral_spire', x: 800, y: 800 }]);
    sim.step();
    const after = ownedBy(state, 'player0').filter((e) => e.defId === 'astral_spire').length;

    expect(before).toBe(1);
    expect(after).toBe(1);
  });

  it('allows multiple superweapons when toggle is off', () => {
    const { state, sim, services } = battleField();
    const p0 = player0(state);
    state.oneSuperweaponPerPlayer = false;
    unlockTech(state, 'player0', 'arcane_nexus');
    p0.mana = 10000;
    const sanctum = ownedBy(state, 'player0').find((e) => e.defId === 'sanctum')!;
    spawnEntity(state, services, null, 'astral_spire', 'player0', sanctum.pos.x + 160, sanctum.pos.y);

    sim.enqueueNow([
      { type: 'build', playerId: 'player0', defId: 'astral_spire', x: sanctum.pos.x + 320, y: sanctum.pos.y },
    ]);
    sim.step();

    const count = ownedBy(state, 'player0').filter((e) => e.defId === 'astral_spire').length;
    expect(count).toBe(2);
  });

  it('replaying identical superweapon commands is deterministic', () => {
    function runScripted() {
      const { state, services } = initMatch(reg, cfg());
      const sim = new Simulation(state, services);
      sim.setAiEnabled(false);
      unlockTech(state, 'player0', 'astral_spire');
      player0(state).spellCooldowns['astral_lance'] = 0;
      sim.enqueue(10, [
        { type: 'castSpell', playerId: 'player0', spellId: 'astral_lance', x: 600, y: 600 },
      ]);
      sim.enqueue(120, [{ type: 'steerSuperweapon', playerId: 'player0', x: 700, y: 700 }]);
      for (let i = 0; i < 500; i++) sim.step();
      return state;
    }
    expect(hashState(runScripted())).toBe(hashState(runScripted()));
  });
});
