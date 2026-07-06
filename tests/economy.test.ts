import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { ownedBy } from '../src/sim/queries';

const reg = getRegistry();

describe('economy & production (data-driven)', () => {
  it('build -> complete -> free wisp; costs come from data', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;

    const p = state.players.find((pl) => pl.id === 'player0')!;
    const startMana = p.mana;
    const spireDef = reg.building('attunement_spire');
    const wispsBefore = ownedBy(state, 'player0').filter((e) => e.defId === 'wisp').length;

    // place the spire on a known-free tile near the top-left start
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 400, y: 240 }]);
    sim.step();
    expect(p.mana).toBe(startMana - spireDef.cost); // charged upfront, from data

    // run past its build time (+ buffer)
    for (let i = 0; i < spireDef.buildTime * 20 + 40; i++) sim.step();

    const spires = ownedBy(state, 'player0').filter((e) => e.defId === 'attunement_spire');
    expect(spires.length).toBe(1);
    expect(spires[0]!.buildProgress).toBeUndefined(); // completed
    expect(p.unlockedTech).toContain('attunement_spire');

    const wispsAfter = ownedBy(state, 'player0').filter((e) => e.defId === 'wisp').length;
    expect(wispsAfter).toBe(wispsBefore + 1); // free wisp on completion
  });

  it('wisps harvest mana and deposit it back, raising the balance', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const p = state.players.find((pl) => pl.id === 'player0')!;

    // build + finish a spire so wisps have a dropoff
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 400, y: 240 }]);
    sim.step();
    for (let i = 0; i < reg.building('attunement_spire').buildTime * 20 + 5; i++) sim.step();

    const nodes = [...state.entities.values()].filter((e) => e.kind === 'resource_node');
    const nearest = nodes.sort((a, b) => a.pos.x - b.pos.x)[0]!;
    const wisps = ownedBy(state, 'player0').filter((e) => e.defId === 'wisp').map((e) => e.id);
    sim.enqueueNow([{ type: 'harvest', playerId: 'player0', entityIds: wisps, nodeId: nearest.id }]);

    const manaBefore = p.mana;
    for (let i = 0; i < 1200; i++) sim.step();
    expect(p.mana).toBeGreaterThan(manaBefore); // deposits happened
  });

  it('mana nodes deplete as wisps harvest', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const nodes = [...state.entities.values()].filter((e) => e.kind === 'resource_node');
    const node = nodes[0]!;
    const start = node.amount ?? 0;
    expect(start).toBe(reg.balance.manaNodeCapacity);
    const wisps = ownedBy(state, 'player0').filter((e) => e.defId === 'wisp').map((e) => e.id);
    sim.enqueueNow([{ type: 'harvest', playerId: 'player0', entityIds: wisps, nodeId: node.id }]);
    for (let i = 0; i < 800; i++) sim.step();
    expect(node.amount ?? 0).toBeLessThan(start);
  });

  it('low power disables training in power-consuming buildings', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const p = state.players.find((pl) => pl.id === 'player0')!;

    // HQ (20 pwr) + spire (10 use) = balanced
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 400, y: 240 }]);
    sim.step();
    for (let i = 0; i < reg.building('attunement_spire').buildTime * 20 + 5; i++) sim.step();

    // Summoning circle (+20 use) -> 30 used / 20 produced = low power
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'summoning_circle', x: 520, y: 240 }]);
    sim.step();
    for (let i = 0; i < reg.building('summoning_circle').buildTime * 20 + 5; i++) sim.step();

    expect(p.powerUsed).toBeGreaterThan(p.power);

    const circle = ownedBy(state, 'player0').find((e) => e.defId === 'summoning_circle')!;
    const queueBefore = circle.productionQueue?.length ?? 0;
    p.mana = 9999;
    sim.enqueueNow([{ type: 'produce', playerId: 'player0', buildingId: circle.id, defId: 'imp_swarmling' }]);
    sim.step();
    expect(circle.productionQueue?.length ?? 0).toBe(queueBefore);

    p.mana = 9999;
    sim.enqueueNow([{ type: 'produce', playerId: 'player0', buildingId: circle.id, defId: 'imp_swarmling' }]);
    for (let i = 0; i < 40; i++) sim.step();
    expect(circle.productionQueue?.[0]?.progress ?? 0).toBe(0);
  });
});
