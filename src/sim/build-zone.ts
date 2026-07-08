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

function tileNearAnchor(anchor: Entity, anchorFootprint: number, tx: number, ty: number): boolean {
  const { tx: atx, ty: aty } = footprintOrigin(anchor.pos, anchorFootprint);
  for (let ady = 0; ady < anchorFootprint; ady++) {
    for (let adx = 0; adx < anchorFootprint; adx++) {
      const dist = Math.max(Math.abs(tx - (atx + adx)), Math.abs(ty - (aty + ady)));
      if (dist <= BUILD_ZONE_TILES) return true;
    }
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
      const tileX = tx + dx;
      const tileY = ty + dy;
      let covered = false;
      for (const anchor of anchors) {
        const adef = services.registry.buildings.get(anchor.defId);
        if (!adef) continue;
        if (tileNearAnchor(anchor, adef.footprint, tileX, tileY)) {
          covered = true;
          break;
        }
      }
      if (!covered) return false;
    }
  }
  return true;
}

export function buildZoneCircles(state: GameState, services: SimServices, owner: PlayerId): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  for (const b of buildingsOf(state, owner)) {
    const def = services.registry.buildings.get(b.defId);
    if (!def) continue;
    out.push({
      x: b.pos.x,
      y: b.pos.y,
      r: (def.footprint / 2 + BUILD_ZONE_TILES) * TILE,
    });
  }
  return out;
}
