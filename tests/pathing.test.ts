import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { TILE } from '../src/core/constants';
import { sampleFlow, computeFlowField } from '../src/sim/flow-field';
import { steerToGoal, makePathContext } from '../src/sim/pathing';
import { dist } from '../src/sim/math';

const reg = getRegistry();

describe('pathing', () => {
  it('flow field routes around a placed building', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    spawnEntity(state, services, null, 'golem_forge', 'player0', 900, 800);
    const nav = services.nav;
    const goalTx = Math.floor(1400 / TILE);
    const goalTy = Math.floor(800 / TILE);
    const field = computeFlowField(nav, goalTx, goalTy, (tx, ty) => nav.isBlocked(tx, ty));

    expect(nav.isBlocked(27, 25)).toBe(true);
    expect(nav.isBlocked(25, 25)).toBe(false);
    const westOfWall = sampleFlow(field, nav, 25 * TILE + 16, 25 * TILE + 16);
    expect(westOfWall.x === 0 && westOfWall.y === 0).toBe(false);
    expect(westOfWall.x).not.toBe(1);

    const pathCtx = makePathContext(nav, services.flow, state.relations, 'player0');
    const steer = steerToGoal(pathCtx, { x: 400, y: 800 }, { x: 1400, y: 800 });
    expect(Math.abs(steer.y)).toBeGreaterThan(0.1);
  });

  it('unit reaches target by detouring around obstacle', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;

    const start = { x: 400, y: 800 };
    const target = { x: 1400, y: 800 };
    const unit = spawnEntity(state, services, null, 'imp_swarmling', 'player0', start.x, start.y);
    spawnEntity(state, services, null, 'golem_forge', 'player0', 900, 800);

    sim.enqueueNow([{ type: 'move', playerId: 'player0', entityIds: [unit.id], x: target.x, y: target.y }]);

    let maxYOffset = 0;
    for (let i = 0; i < 800; i++) {
      sim.step();
      maxYOffset = Math.max(maxYOffset, Math.abs(unit.pos.y - start.y));
    }

    expect(maxYOffset).toBeGreaterThan(TILE * 1.2);
    expect(dist(unit.pos, target)).toBeLessThan(TILE * 3);
  });

  it('group detours around a wall without getting stuck on corners', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;

    const start = { x: 400, y: 800 };
    const target = { x: 1400, y: 800 };
    spawnEntity(state, services, null, 'golem_forge', 'player0', 900, 800);
    spawnEntity(state, services, null, 'golem_forge', 'player0', 900, 900);

    const ids: number[] = [];
    for (let i = 0; i < 12; i++) {
      const u = spawnEntity(state, services, null, 'imp_swarmling', 'player0', start.x + i * 14, start.y);
      ids.push(u.id);
    }

    sim.enqueueNow([{ type: 'move', playerId: 'player0', entityIds: ids, x: target.x, y: target.y }]);
    for (let i = 0; i < 900; i++) sim.step();

    const units = ids.map((id) => state.entities.get(id)!).filter(Boolean);
    const arrived = units.filter((u) => dist(u.pos, target) < TILE * 4).length;
    expect(arrived).toBeGreaterThanOrEqual(units.length * 0.75);
  });

  it('friendly units path through own gates but enemies cannot', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const nav = services.nav;
    const gateX = 800;
    const gateY = 800;
    spawnEntity(state, services, null, 'arcane_gate', 'player0', gateX, gateY);
    const gateTx = Math.floor((gateX - TILE / 2) / TILE);
    const gateTy = Math.floor((gateY - TILE / 2) / TILE);

    expect(nav.isBlocked(gateTx, gateTy)).toBe(false);
    expect(nav.isBlockedFor('player0', gateTx, gateTy, state.relations)).toBe(false);
    expect(nav.isBlockedFor('player1', gateTx, gateTy, state.relations)).toBe(true);

    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const ally = spawnEntity(state, services, null, 'imp_swarmling', 'player0', gateX - TILE * 3, gateY);
    sim.enqueueNow([{ type: 'move', playerId: 'player0', entityIds: [ally.id], x: gateX + TILE * 3, y: gateY }]);
    for (let i = 0; i < 400; i++) sim.step();
    expect(dist(ally.pos, { x: gateX + TILE * 3, y: gateY })).toBeLessThan(TILE * 4);
  });
});
