import { TILE } from '../core/constants';
import { buildingPlacementSpacing } from '../core/placement-spacing';
import type { BuildingDef } from '../data/defs';
import type { Vec2 } from '../core/coords';
import type { PlacementGhost, PlacementIssue } from '../sim/placement-preview';
import { classifyPlacementCells, ghostWorldPos, placementIssueFromChecks } from '../sim/placement-preview';
import type { InputContext } from './input-context';

export function placementSpacing(def: Pick<BuildingDef, 'isWall' | 'menuCategory'> | undefined): number {
  return def ? buildingPlacementSpacing(def) : 0;
}

export function tileAt(world: Vec2, footprint: number): { tx: number; ty: number; cx: number; cy: number } {
  const tx = Math.floor((world.x - (footprint * TILE) / 2) / TILE);
  const ty = Math.floor((world.y - (footprint * TILE) / 2) / TILE);
  const { x: cx, y: cy } = ghostWorldPos(tx, ty, footprint);
  return { tx, ty, cx, cy };
}

export function wallLineTiles(tx0: number, ty0: number, tx1: number, ty1: number): { tx: number; ty: number }[] {
  const dx = tx1 - tx0;
  const dy = ty1 - ty0;
  const tiles: { tx: number; ty: number }[] = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const step = dx >= 0 ? 1 : -1;
    for (let tx = tx0; step > 0 ? tx <= tx1 : tx >= tx1; tx += step) tiles.push({ tx, ty: ty0 });
  } else {
    const step = dy >= 0 ? 1 : -1;
    for (let ty = ty0; step > 0 ? ty <= ty1 : ty >= ty1; ty += step) tiles.push({ tx: tx0, ty });
  }
  return tiles;
}

export function ghostAtTile(
  ctx: InputContext,
  tx: number,
  ty: number,
  footprint: number,
  defId: string,
  opts?: { requireZone?: boolean },
): PlacementGhost {
  const requireZone = opts?.requireZone !== false;
  const def = ctx.registry.buildings.get(defId);
  const spacing = placementSpacing(def);
  const { x, y } = ghostWorldPos(tx, ty, footprint);
  const navOk = ctx.canPlace(tx, ty, footprint, spacing);
  const nodeBlocked = ctx.onNode(tx, ty, footprint);
  const zoneOk = requireZone ? ctx.canBuildNear(tx, ty, footprint) : true;
  const heightOk = ctx.nav.footprintHeightOk(tx, ty, footprint);
  const cells = classifyPlacementCells({
    tx,
    ty,
    footprint,
    requireZone,
    tileInZone: (cx, cy) => ctx.canBuildNear(cx, cy, 1),
    tileOnNode: (cx, cy) => ctx.onNode(cx, cy, 1),
    tileOccupied: (cx, cy) => ctx.nav.isOccupied(cx, cy),
    heightOk,
  });
  const occupied = cells.some((c) => c.kind === 'blocked');
  const valid = navOk && !nodeBlocked && zoneOk;
  const issue = placementIssueFromChecks({ occupied, heightOk, nodeBlocked, zoneOk, navOk });
  return { x, y, valid, issue, cells };
}

export function placementConfirmHint(issue?: PlacementIssue): string {
  switch (issue) {
    case 'node':
      return '· on a mana pool';
    case 'range':
      return '· too far from your buildings';
    case 'cliff':
      return '· needs level ground';
    case 'blocked':
      return '· blocked by terrain or a structure';
    default:
      return '· click map or Place';
  }
}

/**
 * Footer cost for the current preview. Wall lines charge per valid segment;
 * an invalid preview still shows the unit cost so it matches the build list.
 */
export function placementCostLabel(unitCost: number, wallTiles?: readonly { valid: boolean }[] | null): string {
  if (!wallTiles?.length) return String(unitCost);
  let validCount = 0;
  for (const tile of wallTiles) if (tile.valid) validCount += 1;
  return String(unitCost * Math.max(validCount, 1));
}

export function isWallBuild(ctx: InputContext): boolean {
  if (ctx.session.mode !== 'build' || !ctx.session.buildDefId) return false;
  return !!ctx.registry.buildings.get(ctx.session.buildDefId)?.isWall;
}
