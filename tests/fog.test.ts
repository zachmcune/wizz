import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { isVisibleTo } from '../src/sim/fog';

const reg = getRegistry();

describe('fog of war', () => {
  it('starts with unexplored tiles outside starting vision', () => {
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.controller === 'human')!;
    const explored = human.explored.filter((v) => v === 1).length;
    const total = human.explored.length;
    expect(explored).toBeGreaterThan(0);
    expect(explored).toBeLessThan(total);
  });

  it('radar permanently reveals the entire map', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const human = state.players.find((p) => p.controller === 'human')!;
    human.unlockedTech.push('attunement_spire', 'ley_conduit');
    human.mana = 5000;

    const sanctum = [...state.entities.values()].find((e) => e.owner === human.id && e.defId === 'sanctum')!;
    sim.enqueueNow([{ type: 'build', playerId: human.id, defId: 'scrying_obelisk', x: sanctum.pos.x + 96, y: sanctum.pos.y }]);

    for (let i = 0; i < 200; i++) sim.step();

    expect(human.hasRadar).toBe(true);
    expect(human.explored.every((v) => v === 1)).toBe(true);
  });

  it('hides enemy units outside vision', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.controller === 'human')!;
    const enemy = state.players.find((p) => p.id !== human.id)!;
    const farEnemy = [...state.entities.values()].find((e) => e.owner === enemy.id && e.kind === 'unit');
    expect(farEnemy).toBeTruthy();
    expect(isVisibleTo(state, human.id, farEnemy!, services.nav)).toBe(false);
  });
});
