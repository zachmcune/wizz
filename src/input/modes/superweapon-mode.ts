import type { ModeTapHandler } from '../input-context';

export const superweaponMode: ModeTapHandler = {
  onTap(ctx, _screen, world): void {
    const spellId = ctx.session.spellId;
    if (!spellId) return;
    const beam = ctx.getState().beams.find((b) => b.owner === ctx.playerId);
    if (!beam) {
      ctx.emit({ type: 'castSpell', playerId: ctx.playerId, spellId, x: world.x, y: world.y });
      ctx.onOrderFeedback('spell', world);
    } else {
      ctx.emit({ type: 'steerSuperweapon', playerId: ctx.playerId, x: world.x, y: world.y });
      ctx.onOrderFeedback('move', world);
    }
  },
};
