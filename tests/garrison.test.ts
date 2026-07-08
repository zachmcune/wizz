import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { expectBuilding, expectUnit } from './entity-helpers';

const reg = getRegistry();

function setup() {
  const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
  const sim = new Simulation(state, services);
  sim.setAiEnabled(false);
  const bunker = expectBuilding(spawnEntity(state, services, null, 'arcane_bunker', 'player0', 640, 640));
  return { state, services, sim, bunker };
}

describe('Arcane Bunker garrison system', () => {
  it('loads eligible ranged units, enforces capacity, and unloads them', () => {
    const { state, services, sim, bunker } = setup();
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(spawnEntity(state, services, null, 'arcane_archer', 'player0', 640 + i * 8, 684).id);
    }

    sim.enqueueNow([{ type: 'garrison', playerId: 'player0', unitIds: ids, buildingId: bunker.id }]);
    for (let i = 0; i < 20; i++) sim.step();

    expect(bunker.garrisonedIds?.length).toBe(4);
    expect(bunker.garrisonReservedIds?.length ?? 0).toBe(0);
    const inside = bunker.garrisonedIds![0]!;
    expect(expectUnit(state.entities.get(inside)!).garrisonedIn).toBe(bunker.id);

    sim.enqueueNow([{ type: 'unloadGarrison', playerId: 'player0', buildingId: bunker.id }]);
    sim.step();

    expect(bunker.garrisonedIds?.length ?? 0).toBe(0);
    for (const id of ids.slice(0, 4)) {
      const unit = expectUnit(state.entities.get(id)!);
      expect(unit.garrisonedIn).toBeUndefined();
      expect(unit.state).toBe('idle');
    }
  });

  it('rejects selling an occupied bunker', () => {
    const { state, services, sim, bunker } = setup();
    const archer = spawnEntity(state, services, null, 'arcane_archer', 'player0', 640, 684);
    sim.enqueueNow([{ type: 'garrison', playerId: 'player0', unitIds: [archer.id], buildingId: bunker.id }]);
    for (let i = 0; i < 20; i++) sim.step();

    sim.enqueueNow([{ type: 'sellBuilding', playerId: 'player0', buildingId: bunker.id }]);
    sim.step();

    expect(state.entities.has(bunker.id)).toBe(true);
  });

  it('garrisoned units fire from the bunker and cannot be directly targeted', () => {
    const { state, services, sim, bunker } = setup();
    const archer = spawnEntity(state, services, null, 'arcane_archer', 'player0', 640, 684);
    const enemy = spawnEntity(state, services, null, 'stone_golem', 'player1', 760, 640);
    sim.enqueueNow([{ type: 'garrison', playerId: 'player0', unitIds: [archer.id], buildingId: bunker.id }]);
    for (let i = 0; i < 20; i++) sim.step();

    const enemyHp = enemy.hp;
    for (let i = 0; i < 40; i++) sim.step();
    expect(enemy.hp).toBeLessThan(enemyHp);

    const archerHp = archer.hp;
    sim.enqueueNow([{ type: 'attack', playerId: 'player1', entityIds: [enemy.id], targetId: archer.id }]);
    for (let i = 0; i < 80; i++) sim.step();
    expect(archer.hp).toBe(archerHp);
  });

  it('ejects and damages occupants when the host bunker dies', () => {
    const { state, services, sim, bunker } = setup();
    const archer = spawnEntity(state, services, null, 'arcane_archer', 'player0', 640, 684);
    sim.enqueueNow([{ type: 'garrison', playerId: 'player0', unitIds: [archer.id], buildingId: bunker.id }]);
    for (let i = 0; i < 20; i++) sim.step();

    bunker.hp = 0;
    sim.step();

    expect(state.entities.has(bunker.id)).toBe(false);
    const unit = expectUnit(state.entities.get(archer.id)!);
    expect(unit.garrisonedIn).toBeUndefined();
    expect(unit.hp).toBeLessThan(unit.maxHp);
  });
});
