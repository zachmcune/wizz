import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { buildingPlacementSpacing } from '../src/core/placement-spacing';
import { buildingTileOrigin } from '../src/sim/building-nav';

const reg = getRegistry();

describe('building placement spacing', () => {
  it('allows non-wall structures to sit flush against each other', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const nav = services.nav;
    const sanctum = [...state.entities.values()].find((e) => e.defId === 'sanctum' && e.owner === 'player0')!;
    const { tx, ty } = buildingTileOrigin(sanctum.pos.x, sanctum.pos.y, 3);
    const spacing = buildingPlacementSpacing(reg.building('attunement_spire'));

    expect(nav.canPlace(tx + 3, ty, 2, spacing)).toBe(true);
  });

  it('allows wall segments to touch each other', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const nav = services.nav;
    const sanctum = [...state.entities.values()].find((e) => e.defId === 'sanctum' && e.owner === 'player0')!;
    const spotTx = Math.floor(sanctum.pos.x / 32) + 5;
    const spotTy = Math.floor(sanctum.pos.y / 32);
    const spacing = buildingPlacementSpacing(reg.building('stone_wall'));

    expect(nav.canPlace(spotTx, spotTy, 1, spacing)).toBe(true);
    nav.setBuildingBlock(spotTx, spotTy, 1, true);
    expect(nav.canPlace(spotTx + 1, spotTy, 1, spacing)).toBe(true);
  });

  it('allows defense structures to touch each other', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const nav = services.nav;
    const sanctum = [...state.entities.values()].find((e) => e.defId === 'sanctum' && e.owner === 'player0')!;
    const spotTx = Math.floor(sanctum.pos.x / 32) + 6;
    const spotTy = Math.floor(sanctum.pos.y / 32);
    const wallSpacing = buildingPlacementSpacing(reg.building('stone_wall'));
    const gateSpacing = buildingPlacementSpacing(reg.building('arcane_gate'));
    const turretSpacing = buildingPlacementSpacing(reg.building('ward_turret'));

    nav.setBuildingBlock(spotTx, spotTy, 1, true);
    expect(nav.canPlace(spotTx + 1, spotTy, 1, gateSpacing)).toBe(true);
    nav.setBuildingBlock(spotTx + 1, spotTy, 1, true);
    expect(nav.canPlace(spotTx + 2, spotTy, 1, turretSpacing)).toBe(true);
    expect(wallSpacing).toBe(0);
    expect(gateSpacing).toBe(0);
    expect(turretSpacing).toBe(0);
  });
});
