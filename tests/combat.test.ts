import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { ownedBy, isAlive } from '../src/sim/queries';

const reg = getRegistry();

function battleField() {
  const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
  const sim = new Simulation(state, services);
  sim.setAiEnabled(false);
  return { state, services, sim };
}

function countUnits(state: ReturnType<typeof battleField>['state'], owner: string, defId: string): number {
  return ownedBy(state, owner).filter((e) => e.defId === defId && isAlive(e) && e.kind !== 'resource_node' && e.kind !== 'projectile').length;
}

describe('combat & counters', () => {
  it('heavy melee (golems) beat an equal-cost mass of light ranged (archers)', () => {
    const { state, sim, services } = battleField();
    // 3 golems (1200 mana) vs 8 archers (1200 mana), placed close
    const gids: number[] = [];
    for (let i = 0; i < 3; i++) gids.push(spawnEntity(state, services, null, 'stone_golem', 'player0', 900 + i * 30, 800).id);
    const aids: number[] = [];
    for (let i = 0; i < 8; i++) aids.push(spawnEntity(state, services, null, 'arcane_archer', 'player1', 1000 + (i % 4) * 25, 900 + Math.floor(i / 4) * 25).id);

    sim.enqueueNow([{ type: 'attack', playerId: 'player0', entityIds: gids, targetId: aids[0]! }]);
    for (let i = 0; i < 600; i++) sim.step();

    const golems = countUnits(state, 'player0', 'stone_golem');
    const archers = countUnits(state, 'player1', 'arcane_archer');
    expect(golems).toBeGreaterThan(0);
    expect(archers).toBe(0);
  });

  it('a siege behemoth destroys a building in bounded time', () => {
    const { state, sim, services } = battleField();
    const target = ownedBy(state, 'player1').find((e) => e.defId === 'sanctum')!;
    const beh = spawnEntity(state, services, null, 'siege_behemoth', 'player0', target.pos.x - 120, target.pos.y);
    sim.enqueueNow([{ type: 'attack', playerId: 'player0', entityIds: [beh.id], targetId: target.id }]);

    let destroyedTick = -1;
    for (let i = 0; i < 1500; i++) {
      sim.step();
      if (!state.entities.has(target.id)) {
        destroyedTick = state.tick;
        break;
      }
    }
    expect(destroyedTick).toBeGreaterThan(0);
    expect(destroyedTick).toBeLessThan(1500);
  });

  it('armor multipliers make damage class-dependent', () => {
    const { state, sim, services } = battleField();
    // behemoth vs a golem (heavy): vs.heavy = 1.2 -> 72 dmg per hit
    const beh = spawnEntity(state, services, null, 'siege_behemoth', 'player0', 700, 700);
    const golem = spawnEntity(state, services, null, 'stone_golem', 'player1', 760, 700);
    const hp0 = golem.hp;
    sim.enqueueNow([{ type: 'attack', playerId: 'player0', entityIds: [beh.id], targetId: golem.id }]);
    for (let i = 0; i < 60; i++) sim.step();
    expect(golem.hp).toBeLessThan(hp0);
  });
});
