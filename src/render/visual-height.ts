// Render-only visual height lookup from map data. Never imported by src/sim/**.
import type { MapData } from '../data/defs';
import { worldToTileX, worldToTileY } from '../core/coords';
import { FLYER_HOVER_LEVELS } from '../core/projection';

function heightTable(map: MapData): number[] | undefined {
  return map.heights ?? map.visualHeights;
}

export function visualHeightAt(map: MapData, worldX: number, worldY: number): number {
  const heights = heightTable(map);
  if (!heights) return 0;
  const tx = worldToTileX(worldX);
  const ty = worldToTileY(worldY);
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return 0;
  return heights[ty * map.tileW + tx] ?? 0;
}

export function visualHeightAtTile(map: MapData, tx: number, ty: number): number {
  const heights = heightTable(map);
  if (!heights) return 0;
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return 0;
  return heights[ty * map.tileW + tx] ?? 0;
}

export function flyerHoverLevels(): number {
  return FLYER_HOVER_LEVELS;
}

export function entityVisualHeight(map: MapData, worldX: number, worldY: number, flying: boolean): number {
  return visualHeightAt(map, worldX, worldY) + (flying ? FLYER_HOVER_LEVELS : 0);
}
