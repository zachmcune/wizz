import type { Vec2 } from '../../core/coords';
import type { InputContext, ModeTapHandler } from '../input-context';

export const spellMode: ModeTapHandler = {
  onTap(ctx, _screen, world): void {
    castSpellAt(ctx, world);
  },
};

export function castSpellAt(ctx: InputContext, world: Vec2): void {
  const spellId = ctx.session.spellId!;
  const spell = ctx.registry.spells.get(spellId);
  if (!spell) return;
  if (spell.requiresConfirm && !ctx.session.pendingConfirm) {
    ctx.session.pendingConfirm = { spellId, x: world.x, y: world.y };
    return;
  }
  const entityIds = spell.targeting === 'group' ? ctx.ownCombatSelected() : undefined;
  ctx.emit({ type: 'castSpell', playerId: ctx.playerId, spellId, x: world.x, y: world.y, entityIds });
  ctx.onOrderFeedback('spell', world);
  ctx.session.pendingConfirm = null;
  ctx.setMode('normal');
}

export function confirmSpell(ctx: InputContext): void {
  if (!ctx.session.pendingConfirm) return;
  const { spellId, x, y } = ctx.session.pendingConfirm;
  const spell = ctx.registry.spells.get(spellId);
  const entityIds = spell?.targeting === 'group' ? ctx.ownCombatSelected() : undefined;
  ctx.emit({ type: 'castSpell', playerId: ctx.playerId, spellId, x, y, entityIds });
  ctx.onOrderFeedback('spell', { x, y });
  ctx.session.pendingConfirm = null;
  ctx.setMode('normal');
}

export function startSpell(ctx: InputContext, spellId: string): void {
  ctx.session.mode = 'spell';
  ctx.session.spellId = spellId;
}
