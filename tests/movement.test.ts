import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { dist } from '../src/sim/math';
import { TILE } from '../src/core/constants';

const reg = getRegistry();

describe('movement & pathfinding', () => {
  it('unit paths around a building obstacle to reach its target', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);

    const start = { x: 900, y: 1200 };
    const target = { x: 2500, y: 1200 };
    const unit = spawnEntity(state, services, null, 'imp_swarmling', 'player0', start.x, start.y);
    // Block the direct horizontal path with a 3x3 structure.
    spawnEntity(state, services, null, 'golem_forge', 'player0', 1700, 1200);

    sim.enqueueNow([{ type: 'move', playerId: 'player0', entityIds: [unit.id], x: target.x, y: target.y }]);

    let detoured = false;
    for (let i = 0; i < 600; i++) {
      sim.step();
      if (Math.abs(unit.pos.y - start.y) > TILE * 1.2) detoured = true;
    }

    expect(detoured).toBe(true);
    expect(dist(unit.pos, target)).toBeLessThan(TILE * 3);
  });

  it('60+ units move to a point as a coherent group without overlapping', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);

    const ids: number[] = [];
    let x = 900;
    let y = 900;
    for (let i = 0; i < 64; i++) {
      const e = spawnEntity(state, services, null, 'imp_swarmling', 'player0', x, y);
      ids.push(e.id);
      x += 20;
      if ((i + 1) % 8 === 0) {
        x = 900;
        y += 20;
      }
    }
    const target = { x: 2400, y: 2100 };
    sim.enqueueNow([{ type: 'move', playerId: 'player0', entityIds: ids, x: target.x, y: target.y }]);
    for (let i = 0; i < 800; i++) sim.step();

    const units = ids.map((id) => state.entities.get(id)!).filter(Boolean);
    expect(units.length).toBe(64);

    // most units arrive near the target (group cluster)
    const arrived = units.filter((u) => dist(u.pos, target) < 160).length;
    expect(arrived).toBeGreaterThanOrEqual(units.length * 0.9);

    // no severe overlap: nearest-neighbor distance stays reasonable
    let minPair = Infinity;
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        minPair = Math.min(minPair, dist(units[i]!.pos, units[j]!.pos));
      }
    }
    const r = units[0]!.radius;
    expect(minPair).toBeGreaterThanOrEqual(0.6 * (2 * r));
  });
});
