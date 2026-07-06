import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { dist } from '../src/sim/math';

const reg = getRegistry();

describe('movement & pathfinding', () => {
  it('60+ units move to a point as a coherent group without overlapping', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;

    const ids: number[] = [];
    let x = 500;
    let y = 500;
    for (let i = 0; i < 64; i++) {
      const e = spawnEntity(state, services, null, 'imp_swarmling', 'player0', x, y);
      ids.push(e.id);
      x += 20;
      if ((i + 1) % 8 === 0) {
        x = 500;
        y += 20;
      }
    }
    const target = { x: 1100, y: 900 };
    sim.enqueueNow([{ type: 'move', playerId: 'player0', entityIds: ids, x: target.x, y: target.y }]);
    for (let i = 0; i < 400; i++) sim.step();

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
