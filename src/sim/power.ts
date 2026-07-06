// Power grid helpers (Red Alert 2 style: deficit disables power consumers until balanced).
import type { Registry } from '../data/registry';
import type { GameState, Entity, EntityId, PlayerId } from './types';
import { getPlayer, entitiesSorted } from './queries';

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

let offlineCacheTick = -1;
let offlineCache = new Set<EntityId>();

/** Buildings forced offline this tick to cover a power deficit (newest consumers first). */
export function offlineBuildings(state: GameState, registry: Registry): Set<EntityId> {
  if (state.tick === offlineCacheTick) return offlineCache;
  const offline = new Set<EntityId>();
  for (const p of state.players) {
    if (!isPowerShort(state, p.id)) continue;
    const consumers = entitiesSorted(state).filter(
      (e) =>
        e.owner === p.id &&
        e.kind === 'building' &&
        e.state !== 'dead' &&
        e.buildProgress === undefined &&
        buildingPowerUse(registry, e.defId) > 0,
    );
    let cut = powerDeficit(state, p.id);
    for (let i = consumers.length - 1; i >= 0 && cut > 0; i--) {
      const b = consumers[i]!;
      offline.add(b.id);
      cut -= buildingPowerUse(registry, b.defId);
    }
  }
  offlineCacheTick = state.tick;
  offlineCache = offline;
  return offline;
}

/** True when a completed building is receiving power. */
export function buildingHasPower(state: GameState, registry: Registry, building: Entity): boolean {
  if (building.kind !== 'building' || building.state === 'dead' || building.buildProgress !== undefined) return true;
  if (buildingPowerUse(registry, building.defId) <= 0) return true;
  if (!isPowerShort(state, building.owner)) return true;
  return !offlineBuildings(state, registry).has(building.id);
}
