import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { BUILD_SPACING_TILES } from '../src/core/constants';
import { buildingTileOrigin } from '../src/sim/building-nav';

const reg = getRegistry();

describe('building placement spacing', () => {
  it('requires a one-tile gap between non-wall structures', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const nav = services.nav;
    const sanctum = [...state.entities.values()].find((e) => e.defId === 'sanctum' && e.owner === 'player0')!;
    const { tx, ty } = buildingTileOrigin(sanctum.pos.x, sanctum.pos.y, 3);

    expect(nav.canPlace(tx + 3, ty, 2, BUILD_SPACING_TILES)).toBe(false);
    expect(nav.canPlace(tx + 4, ty, 2, BUILD_SPACING_TILES)).toBe(true);
  });

  it('allows wall segments to touch each other', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const nav = services.nav;
    const sanctum = [...state.entities.values()].find((e) => e.defId === 'sanctum' && e.owner === 'player0')!;
    const spotTx = Math.floor(sanctum.pos.x / 32) + 5;
    const spotTy = Math.floor(sanctum.pos.y / 32);

    expect(nav.canPlace(spotTx, spotTy, 1, 0)).toBe(true);
    nav.setBuildingBlock(spotTx, spotTy, 1, true);
    expect(nav.canPlace(spotTx + 1, spotTy, 1, 0)).toBe(true);
  });
});
