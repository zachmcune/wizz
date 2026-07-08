import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { BUILD_ZONE_TILES, canBuildNearBase } from '../src/sim/build-zone';
import { TILE } from '../src/core/constants';

const reg = getRegistry();

function sanctumFor(state: ReturnType<typeof initMatch>['state']) {
  return [...state.entities.values()].find((e) => e.defId === 'sanctum' && e.owner === 'player0')!;
}

describe('build zone (RA2-style)', () => {
  it('allows placement near the Sanctum and rejects far-away tiles', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sanctum = sanctumFor(state);
    const nearX = sanctum.pos.x + 4 * TILE;
    const nearY = sanctum.pos.y;
    const nearTx = Math.floor((nearX - TILE) / TILE);
    const nearTy = Math.floor((nearY - TILE) / TILE);
    expect(canBuildNearBase(state, services, 'player0', nearTx, nearTy, 2)).toBe(true);

    const farTx = Math.floor((2400 - TILE) / TILE);
    const farTy = Math.floor((1800 - TILE) / TILE);
    expect(canBuildNearBase(state, services, 'player0', farTx, farTy, 2)).toBe(false);
  });

  it('completed structures extend the build zone outward', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const sanctum = sanctumFor(state);
    const spireX = sanctum.pos.x + 4 * TILE;
    const spireY = sanctum.pos.y;
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: spireX, y: spireY }]);
    for (let i = 0; i < reg.building('attunement_spire').buildTime * 20 + 5; i++) sim.step();

    const edgeX = spireX + BUILD_ZONE_TILES * TILE;
    const edgeY = spireY;
    const edgeTx = Math.floor((edgeX - TILE) / TILE);
    const edgeTy = Math.floor((edgeY - TILE) / TILE);
    expect(canBuildNearBase(state, services, 'player0', edgeTx, edgeTy, 2)).toBe(true);
  });

  it('sim rejects build commands outside the base build zone', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const before = state.entities.size;
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 2400, y: 1800 }]);
    sim.step();
    expect(state.entities.size).toBe(before);
  });
});
