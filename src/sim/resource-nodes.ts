// Mana pool entities — overlap helpers for building placement.
import { TILE } from '../core/constants';
import type { GameState, Entity } from './types';

/** Remove neutral mana nodes whose tile lies under a building footprint. */
export function removeNodesUnderFootprint(state: GameState, tx: number, ty: number, footprint: number): void {
  for (const [id, e] of state.entities) {
    if (e.kind !== 'resource_node') continue;
    if (nodeUnderFootprint(tx, ty, footprint, e)) state.entities.delete(id);
  }
}

function nodeUnderFootprint(tx: number, ty: number, footprint: number, node: Entity): boolean {
  const ntx = Math.floor(node.pos.x / TILE);
  const nty = Math.floor(node.pos.y / TILE);
  return ntx >= tx && ntx < tx + footprint && nty >= ty && nty < ty + footprint;
}
