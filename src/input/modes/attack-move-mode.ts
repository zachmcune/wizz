import type { ModeTapHandler } from '../input-context';

export const attackMoveMode: ModeTapHandler = {
  onTap(ctx, _screen, world): void {
    const ids = ctx.ownCombatSelected();
    if (ids.length) {
      ctx.emit({ type: 'attackMove', playerId: ctx.playerId, entityIds: ids, x: world.x, y: world.y });
      ctx.onOrderFeedback('attackMove', world);
    }
    ctx.setMode('normal');
  },
};
