// Render-only visual height lookup from map data. Never imported by src/sim/**.
import type { MapData } from '../data/defs';
import { worldToTileX, worldToTileY } from '../core/coords';

export function visualHeightAt(map: MapData, worldX: number, worldY: number): number {
  if (!map.visualHeights) return 0;
  const tx = worldToTileX(worldX);
  const ty = worldToTileY(worldY);
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return 0;
  return map.visualHeights[ty * map.tileW + tx] ?? 0;
}

export function visualHeightAtTile(map: MapData, tx: number, ty: number): number {
  if (!map.visualHeights) return 0;
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return 0;
  return map.visualHeights[ty * map.tileW + tx] ?? 0;
}
