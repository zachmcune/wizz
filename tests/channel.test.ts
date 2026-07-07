import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { secondsToTicks } from '../src/core/constants';

const reg = getRegistry();

describe('mana weaver channeling', () => {
  it('conjures mana while sitting', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const human = state.players.find((p) => p.controller === 'human')!;
    const weaver = spawnEntity(state, services, null, 'mana_weaver', human.id, 600, 600);
    human.mana = 0;

    sim.enqueueNow([{ type: 'channel', playerId: human.id, entityIds: [weaver.id], enabled: true }]);
    const ticks = secondsToTicks(reg.balance.conjureManaIntervalSeconds);
    for (let i = 0; i < ticks; i++) sim.step();

    expect(weaver.channeling).toBe(true);
    expect(weaver.state).toBe('channeling');
    expect(human.mana).toBeGreaterThanOrEqual(reg.balance.conjureManaAmount - 0.5);
  });

  it('stop command ends channeling', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const human = state.players.find((p) => p.controller === 'human')!;
    const weaver = spawnEntity(state, services, null, 'mana_weaver', human.id, 600, 600);

    sim.enqueueNow([{ type: 'channel', playerId: human.id, entityIds: [weaver.id], enabled: true }]);
    sim.step();
    sim.enqueueNow([{ type: 'stop', playerId: human.id, entityIds: [weaver.id] }]);
    sim.step();

    expect(weaver.channeling).toBe(false);
    expect(weaver.state).toBe('idle');
  });
});
