// Render-only visual height lookup from map data. Never imported by src/sim/**.
import type { MapData } from '../data/defs';
import { FLYER_HOVER_LEVELS } from '../core/projection';
import { mapTileQuery, surfaceHeightAt, tileCornerHeights, type CornerHeights } from '../core/ramp-slope';

function heightTable(map: MapData): number[] | undefined {
  return map.heights ?? map.visualHeights;
}

/** Continuous surface height (ramps lerp from low to high instead of stepping). */
export function visualHeightAt(map: MapData, worldX: number, worldY: number): number {
  return surfaceHeightAt(mapTileQuery(map), worldX, worldY);
}

export function visualHeightAtTile(map: MapData, tx: number, ty: number): number {
  const heights = heightTable(map);
  if (!heights) return 0;
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return 0;
  return heights[ty * map.tileW + tx] ?? 0;
}

export function visualCornerHeights(map: MapData, tx: number, ty: number): CornerHeights {
  return tileCornerHeights(mapTileQuery(map), tx, ty);
}

export function flyerHoverLevels(): number {
  return FLYER_HOVER_LEVELS;
}

export function entityVisualHeight(map: MapData, worldX: number, worldY: number, flying: boolean): number {
  return visualHeightAt(map, worldX, worldY) + (flying ? FLYER_HOVER_LEVELS : 0);
}
