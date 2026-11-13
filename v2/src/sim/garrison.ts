// Garrison capacity and eligibility rules.
//
// The host keeps two lists: `garrisonedIds` (inside) and `garrisonReservedIds` (walking there). Both
// count against capacity, which stops a player from over-filling a bunker with a drag-select.

import type { Registry } from '../data/registry';
import type { GameState } from './types';
import { KIND_BUILDING, KIND_UNIT, STATE_GARRISONED } from './entity-store';
import { getGarrisonHost, garrisonedInId, hasMorph, isChanneling } from './capabilities';

export function garrisonOccupancy(state: GameState, buildingSlot: number): number {
  const host = getGarrisonHost(state.entities.extras[buildingSlot]!);
  if (!host) return 0;
  return host.garrisonedIds.length + host.garrisonReservedIds.length;
}

export function garrisonFreeCapacity(registry: Registry, state: GameState, buildingSlot: number): number {
  const store = state.entities;
  const def = registry.buildings.get(store.extras[buildingSlot]!.defId);
  if (!def?.garrison) return 0;
  return Math.max(0, def.garrison.capacity - garrisonOccupancy(state, buildingSlot));
}

/** Can this unit enter this building? Mirrors the v1 eligibility rules exactly. */
export function buildingCanGarrison(
  registry: Registry,
  state: GameState,
  unitSlot: number,
  buildingSlot: number,
): boolean {
  const store = state.entities;
  if (store.kind[buildingSlot] !== KIND_BUILDING || store.kind[unitSlot] !== KIND_UNIT) return false;
  const ex = store.extras[buildingSlot]!;
  const bdef = registry.buildings.get(ex.defId);
  const garrison = bdef?.garrison;
  if (!garrison) return false;
  // Under-construction or mid-morph hosts cannot accept anyone.
  const bcap = ex.caps.building as { buildProgress?: number } | undefined;
  if (bcap?.buildProgress !== undefined || hasMorph(ex)) return false;

  const uex = store.extras[unitSlot]!;
  const udef = registry.units.get(uex.defId);
  if (!udef?.canGarrison) return false;
  if (udef.mobility === 'air') return false;
  if (garrisonedInId(uex) !== undefined || hasMorph(uex) || isChanneling(uex)) return false;
  if (garrison.requireWeapon && !udef.weapon) return false;
  if (garrison.allowedUnitIds?.length && !garrison.allowedUnitIds.includes(udef.id)) return false;
  if (garrison.allowedRoles?.length && !garrison.allowedRoles.includes(udef.role)) return false;
  return true;
}

export { STATE_GARRISONED };
