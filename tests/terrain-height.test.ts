import { describe, it, expect } from 'vitest';
import { TILE } from '../src/core/constants';
import { projectGround } from '../src/core/coords';
import { VISUAL_HEIGHT_STEP } from '../src/core/projection';
import { terrainTopFill, fogRunLift } from '../src/render/terrain-draw';
import { visualCornerHeights, visualHeightAt } from '../src/render/visual-height';
import type { MapData } from '../src/data/defs';
import {
  dropWallQuad,
  projectLiftedGround,
  projectedTileCorners,
  projectedTileCornersLifted,
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

describe('ramp slope', () => {
  it('lerps visual height along a ramp instead of stepping at the cliff', () => {
    const tiles = new Array(16 * 8).fill(0);
    const heights = new Array(16 * 8).fill(0);
    for (let ty = 1; ty < 7; ty++) {
      for (let tx = 8; tx < 15; tx++) heights[ty * 16 + tx] = 1;
    }
    tiles[4 * 16 + 6] = 2;
    tiles[4 * 16 + 7] = 2;
    tiles[4 * 16 + 8] = 2;
    tiles[4 * 16 + 9] = 2;
    heights[4 * 16 + 6] = 0;
    heights[4 * 16 + 7] = 0;
    heights[4 * 16 + 8] = 1;
    heights[4 * 16 + 9] = 1;
    const map = { tileW: 16, tileH: 8, tiles, heights } as MapData;
    const y = 4 * TILE + TILE / 2;
    const low = visualHeightAt(map, 6 * TILE, y);
    const mid = visualHeightAt(map, 8 * TILE, y);
    const high = visualHeightAt(map, 10 * TILE, y);
    expect(low).toBeCloseTo(0, 5);
    expect(high).toBeCloseTo(1, 5);
    expect(mid).toBeCloseTo(0.5, 5);
    expect(visualHeightAt(map, 7 * TILE, y)).toBeGreaterThan(low);
    expect(visualHeightAt(map, 7 * TILE, y)).toBeLessThan(mid);
    expect(visualHeightAt(map, 9 * TILE, y)).toBeGreaterThan(mid);
    expect(visualHeightAt(map, 9 * TILE, y)).toBeLessThan(high);
  });

  it('projects a ramp tile as a slope, not a flat step', () => {
    const tiles = new Array(16 * 8).fill(0);
    const heights = new Array(16 * 8).fill(0);
    for (let tx = 8; tx < 15; tx++) heights[4 * 16 + tx] = 1;
    tiles[4 * 16 + 6] = 2;
    tiles[4 * 16 + 7] = 2;
    tiles[4 * 16 + 8] = 2;
    tiles[4 * 16 + 9] = 2;
    heights[4 * 16 + 6] = 0;
    heights[4 * 16 + 7] = 0;
    heights[4 * 16 + 8] = 1;
    heights[4 * 16 + 9] = 1;
    const map = { tileW: 16, tileH: 8, tiles, heights } as MapData;
    const corners = visualCornerHeights(map, 7, 4);
    expect(corners.tr).toBeGreaterThan(corners.tl);
    expect(corners.br).toBeGreaterThan(corners.bl);
    expect(corners.tl).toBeCloseTo(corners.bl, 5);
    expect(corners.tr).toBeCloseTo(corners.br, 5);
    const flat = projectedTileCornersLifted(7, 4, 1, 0, { tl: 0, tr: 0, br: 0, bl: 0 });
    const sloped = projectedTileCornersLifted(7, 4, 1, 0, corners);
    expect(flat[1]! - sloped[1]!).toBeCloseTo(corners.tl * VISUAL_HEIGHT_STEP, 5);
    expect(flat[3]! - sloped[3]!).toBeCloseTo(corners.tr * VISUAL_HEIGHT_STEP, 5);
    expect(flat[3]! - sloped[3]!).toBeGreaterThan(flat[1]! - sloped[1]!);
  });
});
