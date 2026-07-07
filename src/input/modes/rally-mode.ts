import type { Vec2 } from '../../core/coords';
import type { EntityId } from '../../sim/types';
import type { InputContext, ModeTapHandler } from '../input-context';

export const rallyMode: ModeTapHandler = {
  onTap(ctx, _screen, world): void {
    confirmRally(ctx, world);
  },
};

export function startRally(ctx: InputContext, buildingId: EntityId): void {
  if (ctx.session.mode === 'rally' && ctx.session.rallyBuildingId === buildingId) {
    ctx.setMode('normal');
    return;
  }
  const b = ctx.getState().entities.get(buildingId);
  if (!b || b.owner !== ctx.playerId || b.kind !== 'building') return;
  const bdef = ctx.registry.buildings.get(b.defId);
  if (!bdef?.producesUnits?.length) return;
  ctx.session.mode = 'rally';
  ctx.session.rallyBuildingId = buildingId;
  ctx.session.rallyCursor = b.rally ? { ...b.rally } : { ...b.pos };
}

export function confirmRally(ctx: InputContext, world: Vec2): void {
  if (ctx.session.mode !== 'rally' || !ctx.session.rallyBuildingId) return;
  ctx.emit({
    type: 'setRally',
    playerId: ctx.playerId,
    buildingId: ctx.session.rallyBuildingId,
    x: world.x,
    y: world.y,
  });
  ctx.onOrderFeedback('rally', world);
  ctx.setMode('normal');
}

export function updateRallyCursor(ctx: InputContext, world: Vec2): void {
  if (ctx.session.mode === 'rally') ctx.session.rallyCursor = { x: world.x, y: world.y };
}
