import { TILE } from '../core/constants';
import type { Vec2 } from '../core/coords';
import type { InputContext } from './input-context';

export function tileAt(world: Vec2, footprint: number): { tx: number; ty: number; cx: number; cy: number } {
  const tx = Math.floor((world.x - (footprint * TILE) / 2) / TILE);
  const ty = Math.floor((world.y - (footprint * TILE) / 2) / TILE);
  const cx = (tx + footprint / 2) * TILE;
  const cy = (ty + footprint / 2) * TILE;
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
): { x: number; y: number; valid: boolean; issue?: 'blocked' | 'range' | 'node' } {
  const cx = (tx + footprint / 2) * TILE;
  const cy = (ty + footprint / 2) * TILE;
  const navOk = ctx.canPlace(tx, ty, footprint);
  const nodeBlocked = ctx.onNode(tx, ty, footprint);
  const zoneOk = ctx.canBuildNear(tx, ty, footprint);
  const valid = navOk && !nodeBlocked && zoneOk;
  const issue = !navOk ? 'blocked' : nodeBlocked ? 'node' : !zoneOk ? 'range' : undefined;
  return { x: cx, y: cy, valid, issue };
}

export function isWallBuild(ctx: InputContext): boolean {
  if (ctx.session.mode !== 'build' || !ctx.session.buildDefId) return false;
  return !!ctx.registry.buildings.get(ctx.session.buildDefId)?.isWall;
}
