import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { BUILD_ZONE_TILES, canBuildNearBase } from '../src/sim/build-zone';
import { TILE } from '../src/core/constants';

const reg = getRegistry();

describe('build zone (RA2-style)', () => {
  it('allows placement near the Sanctum and rejects far-away tiles', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const nearTx = Math.floor((400 - TILE) / TILE);
    const nearTy = Math.floor((240 - TILE) / TILE);
    expect(canBuildNearBase(state, services, 'player0', nearTx, nearTy, 2)).toBe(true);

    const farTx = Math.floor((1200 - TILE) / TILE);
    const farTy = Math.floor((900 - TILE) / TILE);
    expect(canBuildNearBase(state, services, 'player0', farTx, farTy, 2)).toBe(false);
  });

  it('completed structures extend the build zone outward', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 400, y: 240 }]);
    for (let i = 0; i < reg.building('attunement_spire').buildTime * 20 + 5; i++) sim.step();

    const edgeTx = Math.floor((400 + BUILD_ZONE_TILES * TILE - TILE) / TILE);
    const edgeTy = Math.floor((240 - TILE) / TILE);
    expect(canBuildNearBase(state, services, 'player0', edgeTx, edgeTy, 2)).toBe(true);
  });

  it('sim rejects build commands outside the base build zone', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const before = state.entities.size;
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 1200, y: 900 }]);
    sim.step();
    expect(state.entities.size).toBe(before);
  });
});
