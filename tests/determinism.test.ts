import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { runHeadless } from '../src/testing/headless';
import { hashState } from '../src/sim/hash';
import { initMatch, recomputePower, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import type { MatchConfig, Command } from '../src/sim/types';

const reg = getRegistry();

function cfg(): MatchConfig {
  return reg.match('skirmish_1v1');
}

describe('determinism', () => {
  it('data loads and validates', () => {
    expect(reg.units.size).toBeGreaterThanOrEqual(7);
    expect(reg.buildings.size).toBeGreaterThanOrEqual(7);
    expect(reg.spells.size).toBeGreaterThanOrEqual(3);
    expect(reg.maps.has('duel_glade')).toBe(true);
  });

  it('runs 100 ticks and hash is stable across two runs', () => {
    const a = runHeadless(reg, cfg(), 100);
    const b = runHeadless(reg, cfg(), 100);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('AI-driven long match is deterministic', () => {
    const a = runHeadless(reg, cfg(), 1200);
    const b = runHeadless(reg, cfg(), 1200);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('replaying identical scripted commands reproduces identical state', () => {
    const scripted: Record<number, Command[]> = {
      5: [{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 300, y: 300 }],
      40: [{ type: 'move', playerId: 'player0', entityIds: [2, 3], x: 500, y: 500 }],
    };
    const a = runHeadless(reg, cfg(), 300, { scriptedCommands: scripted });
    const b = runHeadless(reg, cfg(), 300, { scriptedCommands: scripted });
    expect(hashState(a)).toBe(hashState(b));
  });

  it('hashes garrison, slow status, and charged attacks deterministically', () => {
    function runScenario() {
      const { state, services } = initMatch(reg, cfg());
      const sim = new Simulation(state, services);
      sim.setAiEnabled(false);
      spawnEntity(state, services, null, 'ley_conduit', 'player0', 580, 560);
      spawnEntity(state, services, null, 'ley_conduit', 'player0', 700, 560);
      const bunker = spawnEntity(state, services, null, 'arcane_bunker', 'player0', 640, 640);
      const archer = spawnEntity(state, services, null, 'arcane_archer', 'player0', 640, 684);
      spawnEntity(state, services, null, 'frost_spire', 'player0', 760, 640);
      spawnEntity(state, services, null, 'celestial_cannon', 'player0', 900, 640);
      spawnEntity(state, services, null, 'stone_golem', 'player1', 980, 640);
      recomputePower(state, services);
      sim.enqueueNow([{ type: 'garrison', playerId: 'player0', unitIds: [archer.id], buildingId: bunker.id }]);
      for (let i = 0; i < 120; i++) sim.step();
      return state;
    }
    expect(hashState(runScenario())).toBe(hashState(runScenario()));
  });
});
