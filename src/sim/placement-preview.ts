// Shared placement classification for the sim, input preview, and overlay.
// Keep this aligned with handleBuild / handleDeploy spatial checks.
import { TILE } from '../core/constants';
import type { NavGrid } from './nav-grid';

export type PlacementIssue = 'blocked' | 'range' | 'node' | 'cliff';
export type PlacementCellKind = 'ok' | 'blocked' | 'range' | 'node' | 'cliff';
export type BuildZoneTileKind = 'open' | 'blocked' | 'node';

export interface PlacementCell {
  tx: number;
  ty: number;
  kind: PlacementCellKind;
}

export interface PlacementGhost {
  x: number;
  y: number;
  valid: boolean;
  issue?: PlacementIssue;
  cells: PlacementCell[];
}

export interface BuildZoneTile {
  tx: number;
  ty: number;
  kind: BuildZoneTileKind;
}

export function ghostWorldPos(tx: number, ty: number, footprint: number): { x: number; y: number } {
  return { x: (tx + footprint / 2) * TILE, y: (ty + footprint / 2) * TILE };
}

/** Per-tile reason a footprint cell can or cannot be occupied. */
export function classifyPlacementCells(opts: {
  tx: number;
  ty: number;
  footprint: number;
  requireZone: boolean;
  tileInZone: (tx: number, ty: number) => boolean;
  tileOnNode: (tx: number, ty: number) => boolean;
  tileOccupied: (tx: number, ty: number) => boolean;
  heightOk: boolean;
}): PlacementCell[] {
  const cells: PlacementCell[] = [];
  for (let dy = 0; dy < opts.footprint; dy++) {
    for (let dx = 0; dx < opts.footprint; dx++) {
      const x = opts.tx + dx;
      const y = opts.ty + dy;
      let kind: PlacementCellKind = 'ok';
      if (opts.requireZone && !opts.tileInZone(x, y)) kind = 'range';
      else if (opts.tileOnNode(x, y)) kind = 'node';
      else if (opts.tileOccupied(x, y)) kind = 'blocked';
      cells.push({ tx: x, ty: y, kind });
    }
  }
  if (!opts.heightOk) {
    for (const cell of cells) {
      if (cell.kind === 'ok') cell.kind = 'cliff';
    }
  }
  return cells;
}

/** Overall issue for HUD / ghost tint. Occupancy beats height, then node, then range. */
export function placementIssueFromChecks(opts: {
  occupied: boolean;
  heightOk: boolean;
  nodeBlocked: boolean;
  zoneOk: boolean;
  navOk: boolean;
}): PlacementIssue | undefined {
  if (opts.occupied) return 'blocked';
  if (!opts.heightOk) return 'cliff';
  if (opts.nodeBlocked) return 'node';
  if (!opts.zoneOk) return 'range';
  if (!opts.navOk) return 'blocked';
  return undefined;
}

export function classifyBuildZoneTiles(
  tiles: readonly { tx: number; ty: number }[],
  nav: NavGrid,
  nodeAt: (tx: number, ty: number) => boolean,
): BuildZoneTile[] {
  const out: BuildZoneTile[] = [];
  for (const { tx, ty } of tiles) {
    if (nodeAt(tx, ty)) out.push({ tx, ty, kind: 'node' });
    else if (nav.isOccupied(tx, ty) || !nav.footprintHeightOk(tx, ty, 1)) out.push({ tx, ty, kind: 'blocked' });
    else out.push({ tx, ty, kind: 'open' });
  }
  return out;
}
