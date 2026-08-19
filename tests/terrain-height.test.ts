import { describe, it, expect } from 'vitest';
import { projectGround } from '../src/core/coords';
import { VISUAL_HEIGHT_STEP } from '../src/core/projection';
import { terrainTopFill, fogRunLift } from '../src/render/terrain-draw';
import type { MapData } from '../src/data/defs';
import {
  dropWallQuad,
  projectLiftedGround,
  projectedTileCorners,
  tileHeightLift,
} from '../src/render/tile-project';

describe('raised ground projection', () => {
  it('lifts tiles with the same visual-height mapping as units', () => {
    const world = { x: 640, y: 480 };
    const tile = projectLiftedGround(world.x, world.y, tileHeightLift(1));
    const unit = projectGround(world, 1);
    expect(tile.x).toBeCloseTo(unit.x, 6);
    expect(tile.y).toBeCloseTo(unit.y, 6);
    // Regression: the old world-Y offset slid tiles diagonally instead of raising them.
    const diagonalHack = projectGround({ x: world.x, y: world.y - 6 });
    expect(tile.x).not.toBeCloseTo(diagonalHack.x, 1);
  });

  it('raises a height-1 tile straight up without sliding it in X', () => {
    const ground = projectedTileCorners(10, 12, 1, 0, 0);
    const raised = projectedTileCorners(10, 12, 1, 0, tileHeightLift(1));
    for (let i = 0; i < 8; i += 2) {
      expect(raised[i]).toBeCloseTo(ground[i]!, 6);
      expect(raised[i + 1]!).toBeLessThan(ground[i + 1]!);
      expect(ground[i + 1]! - raised[i + 1]!).toBeCloseTo(VISUAL_HEIGHT_STEP, 6);
    }
  });

  it('builds a camera-facing wall whose screen height matches the height drop', () => {
    const sw = dropWallQuad(8, 9, 1, 0, 'sw');
    const se = dropWallQuad(8, 9, 1, 0, 'se');
    const swSpan = Math.max(sw[1]!, sw[3]!, sw[5]!, sw[7]!) - Math.min(sw[1]!, sw[3]!, sw[5]!, sw[7]!);
    const seSpan = Math.max(se[1]!, se[3]!, se[5]!, se[7]!) - Math.min(se[1]!, se[3]!, se[5]!, se[7]!);
    expect(swSpan).toBeGreaterThan(VISUAL_HEIGHT_STEP * 0.95);
    expect(seSpan).toBeGreaterThan(VISUAL_HEIGHT_STEP * 0.95);
  });
});

describe('raised ground fill', () => {
  it('uses a lighter top than flat ground so plateaus read from color alone', () => {
    const low = terrainTopFill(4, 5, 0, false);
    const high = terrainTopFill(4, 5, 1, false);
    expect(high).toBeGreaterThan(low);
    expect(terrainTopFill(4, 5, 1, true)).toBe(terrainTopFill(3, 8, 0, true));
  });

  it('keeps fog lifted with terrain even on the cheap graphics path', () => {
    const heights = new Array(16).fill(0);
    heights[5] = 1;
    const map = { tileW: 4, tileH: 4, tiles: new Array(16).fill(0), heights } as MapData;
    expect(fogRunLift(map, { tx: 1, ty: 1, tw: 1 }, true)).toBe(1);
    expect(fogRunLift(map, { tx: 1, ty: 1, tw: 1 }, false)).toBe(1);
  });
});
