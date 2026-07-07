// Mana pool entities — overlap helpers for building placement.
import { TILE } from '../core/constants';
import type { GameState, Entity } from './types';

/** True when any mana node tile lies inside the building footprint. */
export function footprintOverlapsNode(state: GameState, tx: number, ty: number, footprint: number): boolean {
  for (const e of state.entities.values()) {
    if (e.kind !== 'resource_node') continue;
    if (nodeUnderFootprint(tx, ty, footprint, e)) return true;
  }
  return false;
}

function nodeUnderFootprint(tx: number, ty: number, footprint: number, node: Entity): boolean {
  const ntx = Math.floor(node.pos.x / TILE);
  const nty = Math.floor(node.pos.y / TILE);
  return ntx >= tx && ntx < tx + footprint && nty >= ty && nty < ty + footprint;
}
