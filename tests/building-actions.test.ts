import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { ownedBy } from '../src/sim/queries';
import { expectBuilding } from './entity-helpers';

const reg = getRegistry();

describe('building actions', () => {
  it('sells a structure for half its cost', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.controller === 'human')!;
    const circle = expectBuilding(spawnEntity(state, services, null, 'summoning_circle', human.id, sanctumX(state, human.id) + 96, sanctumY(state, human.id)));
    circle.buildProgress = undefined;
    human.mana = 0;

    const manaBefore = human.mana;
    sim.enqueueNow([{ type: 'sellBuilding', playerId: human.id, buildingId: circle.id }]);
    sim.step();
    expect(state.entities.has(circle.id)).toBe(false);
    expect(human.mana).toBe(manaBefore + Math.floor(reg.building('summoning_circle').cost * reg.balance.sellRefundRatio));
  });

  it('repairs a damaged building while spending mana', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.controller === 'human')!;
    const circle = expectBuilding(spawnEntity(state, services, null, 'summoning_circle', human.id, sanctumX(state, human.id) + 96, sanctumY(state, human.id)));
    circle.buildProgress = undefined;
    circle.hp = 200;
    human.mana = 500;

    sim.enqueueNow([{ type: 'setRepair', playerId: human.id, buildingId: circle.id, enabled: true }]);
    const hpBefore = circle.hp;
    const manaBefore = human.mana;
    for (let i = 0; i < 5; i++) sim.step();
    expect(circle.hp).toBeGreaterThan(hpBefore);
    expect(human.mana).toBeLessThan(manaBefore);
  });

  it('sets a rally point for producer buildings', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.controller === 'human')!;
    const circle = expectBuilding(spawnEntity(state, services, null, 'summoning_circle', human.id, sanctumX(state, human.id) + 96, sanctumY(state, human.id)));
    circle.buildProgress = undefined;

    sim.enqueueNow([{ type: 'setRally', playerId: human.id, buildingId: circle.id, x: 900, y: 700 }]);
    sim.step();
    expect(circle.rally).toEqual({ x: 900, y: 700 });

    sim.enqueueNow([{ type: 'setRally', playerId: human.id, buildingId: circle.id, x: 500, y: 400 }]);
    sim.step();
    expect(circle.rally).toEqual({ x: 500, y: 400 });
  });
});

function sanctumX(state: ReturnType<typeof initMatch>['state'], playerId: string): number {
  return ownedBy(state, playerId).find((e) => e.defId === 'sanctum')!.pos.x;
}

function sanctumY(state: ReturnType<typeof initMatch>['state'], playerId: string): number {
  return ownedBy(state, playerId).find((e) => e.defId === 'sanctum')!.pos.y;
}
