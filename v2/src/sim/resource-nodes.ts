// Mana node helpers: placement overlap checks and node lookups.

import { TILE } from '../core/constants';
import type { GameState } from './types';
import { KIND_RESOURCE_NODE } from './entity-store';

/** True when any mana node tile lies inside the proposed building footprint. */
export function footprintOverlapsNode(state: GameState, tx: number, ty: number, footprint: number): boolean {
  const store = state.entities;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_RESOURCE_NODE) continue;
    const ntx = Math.floor(store.posX[slot]! / TILE);
    const nty = Math.floor(store.posY[slot]! / TILE);
    if (ntx >= tx && ntx < tx + footprint && nty >= ty && nty < ty + footprint) return true;
  }
  return false;
}

/** Slots of all resource nodes with mana remaining. */
export function liveNodeSlots(state: GameState, out: number[] = []): number[] {
  out.length = 0;
  const store = state.entities;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_RESOURCE_NODE) continue;
    if (store.amount[slot]! <= 0) continue;
    out.push(slot);
  }
  return out;
}
