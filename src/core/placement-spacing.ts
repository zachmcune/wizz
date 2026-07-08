import { BUILD_SPACING_TILES } from './constants';
import type { BuildingDef } from '../data/defs';

/** Tile padding around a new footprint when checking nav occupancy. */
export function buildingPlacementSpacing(def: Pick<BuildingDef, 'isWall' | 'menuCategory'>): number {
  // RA2-style: structures share edges. Defenses (walls, gates, turrets) always touch.
  if (def.isWall || def.menuCategory === 'defenses') return 0;
  return BUILD_SPACING_TILES;
}
