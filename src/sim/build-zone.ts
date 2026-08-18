// RA2-style build restriction: structures must sit within a tile radius of your base.
import { TILE } from '../core/constants';
import type { SimServices } from './context';
import type { GameState, Entity, PlayerId } from './types';
import { buildingsOf } from './queries';

/** Max Chebyshev tile distance from any friendly structure tile to a new footprint tile. */
export const BUILD_ZONE_TILES = 7;

function footprintOrigin(pos: { x: number; y: number }, footprint: number): { tx: number; ty: number } {
  return {
    tx: Math.floor((pos.x - (footprint * TILE) / 2) / TILE),
    ty: Math.floor((pos.y - (footprint * TILE) / 2) / TILE),
  };
}

/** Chebyshev distance from (tx, ty) to the closest tile of a rectangular footprint. */
function chebyshevToFootprint(atx: number, aty: number, footprint: number, tx: number, ty: number): number {
  const dx = tx < atx ? atx - tx : tx >= atx + footprint ? tx - (atx + footprint - 1) : 0;
  const dy = ty < aty ? aty - ty : ty >= aty + footprint ? ty - (aty + footprint - 1) : 0;
  return Math.max(dx, dy);
}

function tileNearAnchor(anchor: Entity, anchorFootprint: number, tx: number, ty: number): boolean {
  const { tx: atx, ty: aty } = footprintOrigin(anchor.pos, anchorFootprint);
  return chebyshevToFootprint(atx, aty, anchorFootprint, tx, ty) <= BUILD_ZONE_TILES;
}

/** True when this tile is within build range of any living friendly structure. */
export function tileInBuildZone(
  state: GameState,
  services: SimServices,
  owner: PlayerId,
  tx: number,
  ty: number,
): boolean {
  const anchors = buildingsOf(state, owner);
  for (const anchor of anchors) {
    const adef = services.registry.buildings.get(anchor.defId);
    if (!adef) continue;
    if (tileNearAnchor(anchor, adef.footprint, tx, ty)) return true;
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
): boolean {
  const anchors = buildingsOf(state, owner);
  if (anchors.length === 0) return false;

  for (let dy = 0; dy < footprint; dy++) {
    for (let dx = 0; dx < footprint; dx++) {
      if (!tileInBuildZone(state, services, owner, tx + dx, ty + dy)) return false;
    }
  }
  return true;
}

/**
 * Union of tiles inside the Chebyshev build zone. The zone around a rectangular
 * footprint is itself a rectangle, so this is exact (not a circular approximation).
 */
export function collectBuildZoneTiles(
  state: GameState,
  services: SimServices,
  owner: PlayerId,
): { tx: number; ty: number }[] {
  const nav = services.nav;
  const seen = new Set<number>();
  const out: { tx: number; ty: number }[] = [];
  for (const anchor of buildingsOf(state, owner)) {
    const def = services.registry.buildings.get(anchor.defId);
    if (!def) continue;
    const { tx: atx, ty: aty } = footprintOrigin(anchor.pos, def.footprint);
    const minX = atx - BUILD_ZONE_TILES;
    const maxX = atx + def.footprint - 1 + BUILD_ZONE_TILES;
    const minY = aty - BUILD_ZONE_TILES;
    const maxY = aty + def.footprint - 1 + BUILD_ZONE_TILES;
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
