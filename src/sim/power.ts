// Power grid helpers (Red Alert 2 low-power rules).
// Defenses and radar shut off completely; production and construction slow down.
import type { Registry } from '../data/registry';
import type { GameState, Entity, PlayerId } from './types';
import { getPlayer } from './queries';

const MIN_PRODUCTION_RATE = 0.1;

export function isPowerShort(state: GameState, playerId: PlayerId): boolean {
  const p = getPlayer(state, playerId);
  return p ? p.powerUsed > p.power : false;
}

export function powerDeficit(state: GameState, playerId: PlayerId): number {
  const p = getPlayer(state, playerId);
  if (!p) return 0;
  return Math.max(0, p.powerUsed - p.power);
}

export function buildingPowerUse(registry: Registry, defId: string): number {
  return registry.buildings.get(defId)?.powerUsed ?? 0;
}

function buildingDef(registry: Registry, building: Entity) {
  return registry.buildings.get(building.defId);
}

/** True for buildings that hard-stop when the grid is short (turrets, radar). */
export function isHardPowerConsumer(registry: Registry, defId: string): boolean {
  const b = registry.buildings.get(defId);
  return !!(b?.weapon || b?.isRadar || b?.aura);
}

/**
 * RA2 low power: defenses and radar are offline; refineries and factories keep working.
 * Used for combat, radar, and HUD offline state.
 */
export function buildingHasPower(state: GameState, registry: Registry, building: Entity): boolean {
  if (building.kind !== 'building' || building.state === 'dead' || building.buildProgress !== undefined) return true;
  if (!isPowerShort(state, building.owner)) return true;
  return !isHardPowerConsumer(registry, building.defId);
}

/**
 * Production / construction speed multiplier while low on power.
 * 1.0 when balanced; proportional to power supply otherwise (RA2-style slowdown).
 */
export function productionRate(state: GameState, registry: Registry, building: Entity): number {
  if (building.kind !== 'building' || building.state === 'dead') return 0;
  if (!isPowerShort(state, building.owner)) return 1;
  const bdef = buildingDef(registry, building);
  if (bdef?.weapon || bdef?.isRadar || bdef?.aura) return 0;
  const p = getPlayer(state, building.owner)!;
  if (p.powerUsed <= 0) return 1;
  return Math.max(MIN_PRODUCTION_RATE, p.power / p.powerUsed);
}
