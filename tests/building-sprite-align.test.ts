import { describe, it, expect } from 'vitest';
import { TILE } from '../src/core/constants';
import { projectGround } from '../src/core/coords';
import { ghostWorldPos } from '../src/sim/placement-preview';
import {
  buildingGroundShiftY,
  buildingGroundYMul,
  buildingObliqueSpriteIds,
  isBuildingWorldArt,
  textureAnchorFromLocalBounds,
} from '../src/render/shape-sprite';
import { getRegistry } from './helpers';

const reg = getRegistry();

describe('building sprite alignment', () => {
  it('pins the texture pivot to the graphics origin so the ground diamond sits on the tile', () => {
    const bounds = { x: -40, y: -120, width: 80, height: 160 };
    expect(textureAnchorFromLocalBounds(bounds)).toEqual({ x: 0.5, y: 0.75 });
  });

  it('falls back to center when bounds are empty', () => {
    expect(textureAnchorFromLocalBounds({ x: 0, y: 0, width: 0, height: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('shifts every custom building design so its foundation lands on the origin', () => {
    const missing = buildingObliqueSpriteIds().filter((id) => buildingGroundYMul(id) === undefined);
    expect(missing).toEqual([]);
    expect(buildingGroundShiftY('sanctum', 90)).toBeCloseTo(-45 * 0.56, 6);
    expect(buildingGroundShiftY('golem_forge', 88) + 44 * 0.42).toBeCloseTo(0, 6);
    expect(buildingGroundShiftY('wisp', 32)).toBe(0);
  });

  it('treats every authored building as world building art', () => {
    for (const def of reg.buildings.values()) {
      expect(isBuildingWorldArt(def.art), def.id).toBe(true);
    }
  });

  it('places a building at the same projected point as its footprint tiles', () => {
    const cases = [
      { tx: 10, ty: 12, footprint: 1 },
      { tx: 8, ty: 8, footprint: 2 },
      { tx: 4, ty: 6, footprint: 3 },
    ];
    for (const { tx, ty, footprint } of cases) {
      const world = ghostWorldPos(tx, ty, footprint);
      expect(world.x).toBe((tx + footprint / 2) * TILE);
      expect(world.y).toBe((ty + footprint / 2) * TILE);
      const screen = projectGround(world);
      const cellCenter = projectGround({
        x: tx * TILE + (footprint * TILE) / 2,
        y: ty * TILE + (footprint * TILE) / 2,
      });
      expect(screen.x).toBeCloseTo(cellCenter.x, 6);
      expect(screen.y).toBeCloseTo(cellCenter.y, 6);
    }
  });
});
