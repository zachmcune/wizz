import type { ModeTapHandler } from '../input-context';

export const moveInOrderMode: ModeTapHandler = {
  onTap(ctx, _screen, world): void {
    const ids = ctx.selectionEntities()
      .filter((e) => e.owner === ctx.playerId && e.kind === 'unit')
      .map((e) => e.id);
    if (ids.length) {
      ctx.emit({ type: 'moveInOrder', playerId: ctx.playerId, entityIds: ids, x: world.x, y: world.y });
      ctx.onOrderFeedback('moveInOrder', world);
    }
    ctx.setMode('normal');
  },
};
