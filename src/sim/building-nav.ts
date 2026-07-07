// Centralizes nav-grid footprint changes for buildings (walls vs gates).
import { TILE } from '../core/constants';
import type { BuildingDef } from '../data/defs';
import type { Registry } from '../data/registry';
import type { SimServices } from './context';
import type { NavGrid } from './nav-grid';
import type { GameState, PlayerId } from './types';
import { entitiesSorted } from './queries';

export function buildingTileOrigin(x: number, y: number, footprint: number): { tx: number; ty: number } {
  return {
    tx: Math.floor((x - (footprint * TILE) / 2) / TILE),
    ty: Math.floor((y - (footprint * TILE) / 2) / TILE),
  };
}

/** Mark or clear a building's tiles on the nav grid. Gates allow ally passage; walls block everyone. */
export function setBuildingNav(nav: NavGrid, bdef: BuildingDef, tx: number, ty: number, owner: PlayerId | null, occupied: boolean): void {
  if (bdef.isGate) {
    nav.setGate(tx, ty, bdef.footprint, occupied ? owner : null);
  } else {
    nav.setBuildingBlock(tx, ty, bdef.footprint, occupied);
  }
}

export function clearBuildingNav(nav: NavGrid, bdef: BuildingDef, x: number, y: number): void {
  const { tx, ty } = buildingTileOrigin(x, y, bdef.footprint);
  setBuildingNav(nav, bdef, tx, ty, null, false);
}

export function placeBuildingNav(nav: NavGrid, bdef: BuildingDef, x: number, y: number, owner: PlayerId): void {
  const { tx, ty } = buildingTileOrigin(x, y, bdef.footprint);
  setBuildingNav(nav, bdef, tx, ty, owner, true);
}

/** Re-sync main-thread nav grid from authoritative sim state (worker mirror). */
export function rebuildBuildingNav(state: GameState, services: SimServices, registry: Registry): void {
  services.nav.resetBuildings();
  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'building' || e.state === 'dead') continue;
    const bdef = registry.buildings.get(e.defId);
    if (!bdef) continue;
    placeBuildingNav(services.nav, bdef, e.pos.x, e.pos.y, e.owner);
  }
  services.flow.invalidate();
}
