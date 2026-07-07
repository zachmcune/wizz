import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { hasHQ } from '../src/sim/queries';
import { TILE } from '../src/core/constants';

const reg = getRegistry();

describe('mobile HQ (Waystone Wagon)', () => {
  it('deploys into a Waystone Camp that counts as HQ', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);

    const sanctum = [...state.entities.values()].find((e) => e.owner === 'player0' && e.defId === 'sanctum')!;
    const wagon = spawnEntity(state, services, null, 'waystone_wagon', 'player0', sanctum.pos.x + TILE * 6, sanctum.pos.y);
    const deployX = sanctum.pos.x + TILE * 8;
    const deployY = sanctum.pos.y;

    sim.enqueueNow([{ type: 'deploy', playerId: 'player0', entityId: wagon.id, x: deployX, y: deployY }]);
    for (let i = 0; i < reg.unit('waystone_wagon').deployTime! * 20 + 5; i++) sim.step();

    expect(state.entities.has(wagon.id)).toBe(false);
    const camp = [...state.entities.values()].find((e) => e.owner === 'player0' && e.defId === 'waystone_camp');
    expect(camp).toBeDefined();
    expect(hasHQ(state, 'player0')).toBe(true);
  });

  it('deploys far from build zone without range restriction', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);

    const sanctum = [...state.entities.values()].find((e) => e.owner === 'player0' && e.defId === 'sanctum')!;
    const wagon = spawnEntity(state, services, null, 'waystone_wagon', 'player0', sanctum.pos.x + TILE * 20, sanctum.pos.y + TILE * 20);
    const deployX = wagon.pos.x;
    const deployY = wagon.pos.y;

    sim.enqueueNow([{ type: 'deploy', playerId: 'player0', entityId: wagon.id, x: deployX, y: deployY }]);
    for (let i = 0; i < reg.unit('waystone_wagon').deployTime! * 20 + 5; i++) sim.step();

    expect(state.entities.has(wagon.id)).toBe(false);
    expect([...state.entities.values()].some((e) => e.owner === 'player0' && e.defId === 'waystone_camp')).toBe(true);
  });

  it('packs back into a Waystone Wagon', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);

    const sanctum = [...state.entities.values()].find((e) => e.owner === 'player0' && e.defId === 'sanctum')!;
    const wagon = spawnEntity(state, services, null, 'waystone_wagon', 'player0', sanctum.pos.x + TILE * 6, sanctum.pos.y);
    sim.enqueueNow([{ type: 'deploy', playerId: 'player0', entityId: wagon.id, x: sanctum.pos.x + TILE * 8, y: sanctum.pos.y }]);
    for (let i = 0; i < reg.unit('waystone_wagon').deployTime! * 20 + 5; i++) sim.step();

    const camp = [...state.entities.values()].find((e) => e.owner === 'player0' && e.defId === 'waystone_camp')!;
    sim.enqueueNow([{ type: 'pack', playerId: 'player0', buildingId: camp.id }]);
    for (let i = 0; i < reg.building('waystone_camp').packTime! * 20 + 5; i++) sim.step();

    expect([...state.entities.values()].some((e) => e.defId === 'waystone_camp')).toBe(false);
    expect([...state.entities.values()].some((e) => e.defId === 'waystone_wagon' && e.owner === 'player0')).toBe(true);
  });
});
