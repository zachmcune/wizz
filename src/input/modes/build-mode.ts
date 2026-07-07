import type { Vec2 } from '../../core/coords';
import type { InputContext, ModeTapHandler } from '../input-context';
import { ghostAtTile, isWallBuild, tileAt, wallLineTiles } from '../placement';

export const buildMode: ModeTapHandler = {
  onTap(ctx, _screen, world): void {
    if (isWallBuild(ctx)) {
      previewWallAt(ctx, world);
    } else {
      updateBuildGhost(ctx, world);
    }
  },
};

export function updateBuildGhost(ctx: InputContext, world: Vec2): void {
  if (!ctx.session.buildDefId) return;
  const def = ctx.registry.buildings.get(ctx.session.buildDefId);
  if (!def) return;
  const { tx, ty } = tileAt(world, def.footprint);
  ctx.session.buildGhost = ghostAtTile(ctx, tx, ty, def.footprint, def.id);
}

export function startWallDrag(ctx: InputContext, world: Vec2): void {
  if (!isWallBuild(ctx) || !ctx.session.buildDefId) return;
  const def = ctx.registry.buildings.get(ctx.session.buildDefId)!;
  const { tx, ty } = tileAt(world, def.footprint);
  ctx.session.wallDragStart = { tx, ty };
  ctx.session.wallDragTiles = [ghostAtTile(ctx, tx, ty, def.footprint, def.id)];
  ctx.session.buildGhost = ctx.session.wallDragTiles[0]!;
}

export function updateWallDrag(ctx: InputContext, world: Vec2): void {
  if (!isWallBuild(ctx) || !ctx.session.buildDefId || !ctx.session.wallDragStart) return;
  const def = ctx.registry.buildings.get(ctx.session.buildDefId)!;
  const { tx, ty } = tileAt(world, def.footprint);
  const start = ctx.session.wallDragStart;
  ctx.session.wallDragTiles = wallLineTiles(start.tx, start.ty, tx, ty).map((t) =>
    ghostAtTile(ctx, t.tx, t.ty, def.footprint, def.id),
  );
  const last = ctx.session.wallDragTiles[ctx.session.wallDragTiles.length - 1];
  if (last) ctx.session.buildGhost = last;
}

export function previewWallAt(ctx: InputContext, world: Vec2): void {
  if (!isWallBuild(ctx) || !ctx.session.buildDefId) return;
  const def = ctx.registry.buildings.get(ctx.session.buildDefId)!;
  const { tx, ty } = tileAt(world, def.footprint);
  ctx.session.wallDragStart = null;
  ctx.session.wallDragTiles = [ghostAtTile(ctx, tx, ty, def.footprint, def.id)];
  ctx.session.buildGhost = ctx.session.wallDragTiles[0]!;
}

export function confirmWallDrag(ctx: InputContext): void {
  if (!isWallBuild(ctx) || !ctx.session.buildDefId || !ctx.session.wallDragTiles?.length) return;
  const defId = ctx.session.buildDefId;
  let placed = false;
  for (const tile of ctx.session.wallDragTiles) {
    if (!tile.valid) continue;
    ctx.emit({ type: 'build', playerId: ctx.playerId, defId, x: tile.x, y: tile.y });
    placed = true;
  }
  if (placed) ctx.onOrderFeedback('build', ctx.session.wallDragTiles[0]!);
  ctx.session.wallDragTiles = null;
  ctx.session.wallDragStart = null;
  ctx.session.buildGhost = null;
}

export function confirmBuild(ctx: InputContext): void {
  if (ctx.session.mode !== 'build' || !ctx.session.buildDefId || !ctx.session.buildGhost) return;
  if (!ctx.session.buildGhost.valid) return;
  ctx.emit({
    type: 'build',
    playerId: ctx.playerId,
    defId: ctx.session.buildDefId,
    x: ctx.session.buildGhost.x,
    y: ctx.session.buildGhost.y,
  });
  ctx.onOrderFeedback('build', ctx.session.buildGhost);
  ctx.setMode('normal');
}

export function wallPlacementValid(ctx: InputContext): boolean {
  return !!ctx.session.wallDragTiles?.some((t) => t.valid);
}

export function hasWallDragTiles(ctx: InputContext): boolean {
  return (ctx.session.wallDragTiles?.length ?? 0) > 0;
}

export function finishWallDrag(ctx: InputContext): void {
  ctx.session.wallDragStart = null;
}
