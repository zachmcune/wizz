// Player-facing copy for the minimap panel when radar is not online.
import type { Registry } from '../data/registry';
import type { GameState, PlayerId } from '../sim/types';
import { isAlive, isPowerShort, radarActive } from '../sim/views';

function radarDef(registry: Registry) {
  for (const def of registry.buildings.values()) {
    if (def.isRadar) return def;
  }
  return undefined;
}

function powerPlantName(registry: Registry): string {
  for (const def of registry.buildings.values()) {
    if ((def.powerProduced ?? 0) > 0 && !def.isConstructionYard) return def.name;
  }
  return 'power plant';
}

/** Null when radar is online; otherwise what the player should build or restore. */
export function radarOfflineHint(state: GameState, registry: Registry, playerId: PlayerId): string | null {
  if (radarActive(state, registry, playerId)) return null;

  const def = radarDef(registry);
  const radarName = def?.name ?? 'radar building';
  const advanced = def?.menuCategory === 'advanced';
  let complete = false;
  let constructing = false;
  for (const e of state.entities.values()) {
    if (e.owner !== playerId || e.kind !== 'building' || !isAlive(e)) continue;
    if (!registry.buildings.get(e.defId)?.isRadar) continue;
    if (e.buildProgress !== undefined) constructing = true;
    else complete = true;
  }

  if (complete && isPowerShort(state, playerId)) {
    return `Low power — ${radarName} offline. Build a ${powerPlantName(registry)}.`;
  }
  if (constructing) return `${radarName} still constructing…`;
  return advanced
    ? `Build a ${radarName} (Advanced) to enable the minimap.`
    : `Build a ${radarName} to enable the minimap.`;
}
