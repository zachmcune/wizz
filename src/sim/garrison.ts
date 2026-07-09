import type { Registry } from '../data/registry';
import { garrisonedIds, garrisonReservedIds, garrisonedInId, isChanneling } from './capabilities';
import type { BuildingEntity, UnitEntity } from './entity-types';

export function garrisonOccupancy(building: BuildingEntity): number {
  return garrisonedIds(building).length + garrisonReservedIds(building).length;
}

export function garrisonFreeCapacity(registry: Registry, building: BuildingEntity): number {
  const def = registry.buildings.get(building.defId);
  if (!def?.garrison) return 0;
  return Math.max(0, def.garrison.capacity - garrisonOccupancy(building));
}

export function canUnitGarrison(registry: Registry, unit: UnitEntity, building: BuildingEntity): boolean {
  const bdef = registry.buildings.get(building.defId);
  const garrison = bdef?.garrison;
  if (!garrison || building.buildProgress !== undefined || building.morphProgress !== undefined) return false;
  const udef = registry.units.get(unit.defId);
  if (!udef?.canGarrison) return false;
  if (garrisonedInId(unit) !== undefined || unit.morphProgress !== undefined || isChanneling(unit)) return false;
  if (garrison.requireWeapon && !udef.weapon) return false;
  if (garrison.allowedUnitIds?.length && !garrison.allowedUnitIds.includes(unit.defId)) return false;
  if (garrison.allowedRoles?.length && !garrison.allowedRoles.includes(udef.role)) return false;
  return true;
}
