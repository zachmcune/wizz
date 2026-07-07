import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { TILE } from '../src/core/constants';
import { sampleFlow, computeFlowField } from '../src/sim/flow-field';
import { steerToGoal } from '../src/sim/pathing';
import { dist } from '../src/sim/math';

const reg = getRegistry();

describe('pathing', () => {
  it('flow field routes around a placed building', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    spawnEntity(state, services, null, 'golem_forge', 'player0', 900, 800);
    const nav = services.nav;
    const goalTx = Math.floor(1400 / TILE);
    const goalTy = Math.floor(800 / TILE);
    const field = computeFlowField(nav, goalTx, goalTy);

    expect(nav.isBlocked(27, 25)).toBe(true);
    expect(nav.isBlocked(25, 25)).toBe(false);
    const westOfWall = sampleFlow(field, nav, 25 * TILE + 16, 25 * TILE + 16);
    expect(westOfWall.x === 0 && westOfWall.y === 0).toBe(false);
    expect(westOfWall.x).not.toBe(1);

    const steer = steerToGoal(nav, services.flow, { x: 400, y: 800 }, { x: 1400, y: 800 });
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
});
