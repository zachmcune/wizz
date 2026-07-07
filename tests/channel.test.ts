import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { secondsToTicks } from '../src/core/constants';
import { expectUnit } from './entity-helpers';

const reg = getRegistry();

describe('mana weaver channeling', () => {
  it('conjures mana while sitting', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.controller === 'human')!;
    const weaver = expectUnit(spawnEntity(state, services, null, 'mana_weaver', human.id, 600, 600));
    human.mana = 0;

    sim.enqueueNow([{ type: 'channel', playerId: human.id, entityIds: [weaver.id], enabled: true }]);
    const ticks = secondsToTicks(reg.balance.conjureManaIntervalSeconds);
    let pulse = sim.step();
    for (let i = 1; i < ticks; i++) pulse = sim.step();

    expect(weaver.channeling).toBe(true);
    expect(weaver.state).toBe('channeling');
    expect(human.mana).toBe(reg.balance.conjureManaAmount);
    expect(pulse.events).toContainEqual({
      type: 'manaConjured',
      playerId: human.id,
      amount: reg.balance.conjureManaAmount,
      x: weaver.pos.x,
      y: weaver.pos.y,
    });
  });

  it('stop command ends channeling', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.controller === 'human')!;
    const weaver = expectUnit(spawnEntity(state, services, null, 'mana_weaver', human.id, 600, 600));

    sim.enqueueNow([{ type: 'channel', playerId: human.id, entityIds: [weaver.id], enabled: true }]);
    sim.step();
    sim.enqueueNow([{ type: 'stop', playerId: human.id, entityIds: [weaver.id] }]);
    sim.step();

    expect(weaver.channeling).toBe(false);
    expect(weaver.state).toBe('idle');
  });
});
