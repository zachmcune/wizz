import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { getPlayer, isAlive, entitiesSorted } from '../../queries';
import { applyDamage } from '../../combat-util';
import { requirementsMet } from './shared';

export function handleSpell(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'castSpell' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const spell = ctx.services.registry.spells.get(cmd.spellId);
  if (!spell) return;
  if (!requirementsMet(player, spell.requires)) return;
  if ((player.spellCooldowns[cmd.spellId] ?? 0) > 0) return;
  player.spellCooldowns[cmd.spellId] = spell.cooldownTicks;

  const eff = spell.effect;
  if (eff.kind === 'damage') {
    for (const e of entitiesSorted(state)) {
      if (e.kind === 'resource_node' || e.state === 'dead') continue;
      const dx = e.pos.x - cmd.x;
      const dy = e.pos.y - cmd.y;
      if (dx * dx + dy * dy <= eff.radius * eff.radius) applyDamage(state, ctx, e, eff.damage, eff.vs);
    }
  } else if (eff.kind === 'buff') {
    const ids = cmd.entityIds ?? [];
    for (const id of ids) {
      const e = state.entities.get(id);
      if (e && e.owner === cmd.playerId && isAlive(e) && e.kind !== 'resource_node') {
        e.buffs.push({ kind: eff.buff, expiresTick: state.tick + eff.durationTicks });
      }
    }
  } else if (eff.kind === 'blink') {
    const ids = cmd.entityIds ?? [];
    for (const id of ids) {
      const e = state.entities.get(id);
      if (e && e.owner === cmd.playerId && isAlive(e) && e.kind === 'unit') {
        e.pos = { x: cmd.x, y: cmd.y };
        e.orders = [];
        e.state = 'idle';
      }
    }
  }
  ctx.events.push({ type: 'spellCast', playerId: cmd.playerId, spellId: cmd.spellId, x: cmd.x, y: cmd.y });
}
