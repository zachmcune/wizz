import type { Vec2 } from '../../core/coords';
import type { EntityId } from '../../sim/types';
import type { InputContext, ModeTapHandler } from '../input-context';
import { tileAt, placementSpacing } from '../placement';

export const deployMode: ModeTapHandler = {
  onTap(_ctx, _screen, world): void {
    updateDeployGhost(_ctx, world);
  },
};

export function computeDeployGhost(
  ctx: InputContext,
  world: Vec2,
): { x: number; y: number; valid: boolean; issue?: 'blocked' | 'range' | 'node' } {
  const entityId = ctx.session.deployEntityId;
  const unit = entityId ? ctx.getState().entities.get(entityId) : null;
  const udef = unit && unit.kind === 'unit' ? ctx.registry.units.get(unit.defId) : null;
  const def = udef?.deploysAs ? ctx.registry.buildings.get(udef.deploysAs) : null;
  if (!def) return { x: world.x, y: world.y, valid: false, issue: 'blocked' };
  const { tx, ty, cx, cy } = tileAt(world, def.footprint);
  const navOk = ctx.canPlace(tx, ty, def.footprint, placementSpacing(def));
  const nodeBlocked = ctx.onNode(tx, ty, def.footprint);
  const valid = navOk && !nodeBlocked;
  const issue = !navOk ? 'blocked' : nodeBlocked ? 'node' : undefined;
  return { x: cx, y: cy, valid, issue };
}

export function updateDeployGhost(ctx: InputContext, world: Vec2): void {
  if (!ctx.session.deployEntityId) return;
  ctx.session.buildGhost = computeDeployGhost(ctx, world);
}

export function startDeploy(ctx: InputContext, entityId: EntityId): void {
  const unit = ctx.getState().entities.get(entityId);
  if (!unit || unit.owner !== ctx.playerId || unit.kind !== 'unit') return;
  const udef = ctx.registry.units.get(unit.defId);
  if (!udef?.deploysAs) return;
  ctx.session.deployEntityId = entityId;
  const ghost = computeDeployGhost(ctx, unit.pos);
  if (ghost.valid) {
    ctx.session.mode = 'deploy';
    ctx.session.buildGhost = ghost;
    confirmDeploy(ctx);
    return;
  }
  ctx.session.mode = 'deploy';
  ctx.session.buildGhost = ghost;
}

export function confirmDeploy(ctx: InputContext): void {
  if (ctx.session.mode !== 'deploy' || !ctx.session.deployEntityId || !ctx.session.buildGhost) return;
  if (!ctx.session.buildGhost.valid) return;
  ctx.emit({
    type: 'deploy',
    playerId: ctx.playerId,
    entityId: ctx.session.deployEntityId,
    x: ctx.session.buildGhost.x,
    y: ctx.session.buildGhost.y,
  });
  ctx.onOrderFeedback('deploy', ctx.session.buildGhost);
  ctx.setMode('normal');
}
