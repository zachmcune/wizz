import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { getPlayer } from '../../queries';
import { requirementsMet } from './shared';
import { sandboxIgnoreTech, sandboxNoSpellCooldowns } from '../../sandbox-flags';
import { castSpellBehavior } from '../../behaviors/registry';
import '../../behaviors/spell-behaviors';

export function handleSpell(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'castSpell' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const spell = ctx.services.registry.spells.get(cmd.spellId);
  if (!spell) return;
  if (!sandboxIgnoreTech(state) && !requirementsMet(player, spell.requires)) return;
  if (!sandboxNoSpellCooldowns(state) && (player.spellCooldowns[cmd.spellId] ?? 0) > 0) return;
  if (!sandboxNoSpellCooldowns(state)) player.spellCooldowns[cmd.spellId] = spell.cooldownTicks;

  castSpellBehavior({ state, ctx, cmd, spell });
}
