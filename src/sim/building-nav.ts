// Centralizes nav-grid footprint changes for buildings (walls vs gates).
import { TILE } from '../core/constants';
import type { BuildingDef } from '../data/defs';
import type { NavGrid } from './nav-grid';
import type { PlayerId } from './types';

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
