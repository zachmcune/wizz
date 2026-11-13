// RA2-style build restriction: new structures must sit within a tile radius of your base.
//
// The zone is a Chebyshev (square) radius around each finished or in-progress friendly building, so
// a base grows outward organically. Measuring to the *footprint rectangle* rather than to its centre
// is what makes 3x3 buildings feel fair: you can tuck a wall right against a big building's edge.

import { TILE } from '../core/constants';
import type { SimServices } from './context';
import type { GameState, PlayerId } from './types';
import { KIND_BUILDING } from './entity-store';

export const BUILD_ZONE_TILES = 7;

function footprintOrigin(x: number, y: number, footprint: number): { tx: number; ty: number } {
  return {
    tx: Math.floor((x - (footprint * TILE) / 2) / TILE),
    ty: Math.floor((y - (footprint * TILE) / 2) / TILE),
  };
}

/** Chebyshev distance from a tile to the nearest tile of a rectangular footprint (0 if inside). */
export function chebyshevToFootprint(
  atx: number,
  aty: number,
  footprint: number,
  tx: number,
  ty: number,
): number {
  const dx = tx < atx ? atx - tx : tx >= atx + footprint ? tx - (atx + footprint - 1) : 0;
  const dy = ty < aty ? aty - ty : ty >= aty + footprint ? ty - (aty + footprint - 1) : 0;
  return Math.max(dx, dy);
}

/** True when the tile is within build range of any friendly structure. */
export function tileInBuildZone(
  state: GameState,
  services: SimServices,
  owner: PlayerId,
  tx: number,
  ty: number,
  radius = BUILD_ZONE_TILES,
): boolean {
  const store = state.entities;
  const ownerIdx = store.ownerIndexFor(owner);
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.ownerIndex[slot] !== ownerIdx) continue;
    const bdef = services.registry.buildings.get(store.extras[slot]!.defId);
    if (!bdef) continue;
    const { tx: atx, ty: aty } = footprintOrigin(store.posX[slot]!, store.posY[slot]!, bdef.footprint);
    if (chebyshevToFootprint(atx, aty, bdef.footprint, tx, ty) <= radius) return true;
  }
  return false;
}

/** True when every tile of the footprint is within build range of a friendly structure. */
export function canBuildNearBase(
  state: GameState,
  services: SimServices,
  owner: PlayerId,
  tx: number,
  ty: number,
  footprint: number,
  radius = BUILD_ZONE_TILES,
): boolean {
  for (let dy = 0; dy < footprint; dy++) {
    for (let dx = 0; dx < footprint; dx++) {
      if (!tileInBuildZone(state, services, owner, tx + dx, ty + dy, radius)) return false;
    }
  }
  return true;
}

/** Union of tiles inside the build zone, for the placement overlay. */
export function collectBuildZoneTiles(
  state: GameState,
  services: SimServices,
  owner: PlayerId,
  radius = BUILD_ZONE_TILES,
): { tx: number; ty: number }[] {
  const nav = services.nav;
  const store = state.entities;
  const ownerIdx = store.ownerIndexFor(owner);
  const seen = new Set<number>();
  const out: { tx: number; ty: number }[] = [];
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.ownerIndex[slot] !== ownerIdx) continue;
    const bdef = services.registry.buildings.get(store.extras[slot]!.defId);
    if (!bdef) continue;
    const { tx: atx, ty: aty } = footprintOrigin(store.posX[slot]!, store.posY[slot]!, bdef.footprint);
    const minX = atx - radius;
    const maxX = atx + bdef.footprint - 1 + radius;
    const minY = aty - radius;
    const maxY = aty + bdef.footprint - 1 + radius;
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!nav.inBounds(tx, ty)) continue;
        const key = nav.idx(tx, ty);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ tx, ty });
      }
    }
  }
  return out;
}
