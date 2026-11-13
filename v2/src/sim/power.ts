// Power grid (RA2 rules).
//
//   • Hard consumers (weapons, radar, auras) shut off completely at low power.
//   • Soft consumers (production, construction, refineries) keep working but slow down, with a
//     floor so they never stop entirely.
//
// The floor matters: without it, a player at 0 power would be permanently unable to build a power
// plant to recover, which is a soft-lock. v1 uses MIN_PRODUCTION_RATE = 0.1 and the rebuild keeps it
// exactly.

import type { Registry } from '../data/registry';
import type { GameState, EntityId, PlayerId } from './types';
import { getPlayer } from './queries';
import { buildProgressOf } from './capabilities';

export const MIN_PRODUCTION_RATE = 0.1;

export function isPowerShort(state: GameState, playerId: PlayerId): boolean {
  const p = getPlayer(state, playerId);
  return p ? p.powerUsed > p.power : false;
}

export function powerDeficit(state: GameState, playerId: PlayerId): number {
  const p = getPlayer(state, playerId);
  if (!p) return 0;
  return Math.max(0, p.powerUsed - p.power);
}

/** Buildings that hard-stop when the grid is short (defenses, radar, support auras). */
export function isHardPowerConsumer(registry: Registry, defId: string): boolean {
  const b = registry.buildings.get(defId);
  return !!(b?.weapon || b?.isRadar || b?.aura);
}

/**
 * Whether a building is operating. Under-construction buildings report true (they are not
 * consumers yet), and hard consumers go offline at low power while soft ones keep running.
 */
export function buildingHasPower(state: GameState, registry: Registry, slot: number): boolean {
  const store = state.entities;
  if (store.dead[slot]) return true;
  if (buildProgressOf(store.extras[slot]!) !== undefined) return true;
  const owner = store.ownerId(store.ownerIndex[slot]!);
  if (!isPowerShort(state, owner)) return true;
  return !isHardPowerConsumer(registry, store.extras[slot]!.defId);
}

/**
 * Production / construction speed multiplier. 1.0 when the grid is balanced; proportional to supply
 * otherwise, floored at MIN_PRODUCTION_RATE.
 */
export function productionRate(state: GameState, registry: Registry, slot: number): number {
  const store = state.entities;
  if (store.dead[slot]) return 0;
  const owner = store.ownerId(store.ownerIndex[slot]!);
  if (!isPowerShort(state, owner)) return 1;
  const defId = store.extras[slot]!.defId;
  const bdef = registry.buildings.get(defId);
  if (bdef?.weapon || bdef?.isRadar || bdef?.aura) return 0;
  const p = getPlayer(state, owner);
  if (!p || p.powerUsed <= 0) return 1;
  return Math.max(MIN_PRODUCTION_RATE, p.power / p.powerUsed);
}

/** Recompute every player's power supply and draw from the live building set. */
export function recomputePower(state: GameState, registry: Registry): void {
  for (const p of state.players) {
    p.power = 0;
    p.powerUsed = 0;
  }
  const store = state.entities;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== 1) continue;
    if (buildProgressOf(store.extras[slot]!) !== undefined) continue;
    const bdef = registry.buildings.get(store.extras[slot]!.defId);
    if (!bdef) continue;
    const p = getPlayer(state, store.ownerId(store.ownerIndex[slot]!));
    if (!p) continue;
    p.power += bdef.powerProduced ?? 0;
    p.powerUsed += bdef.powerUsed ?? 0;
  }
}

export type { EntityId };
