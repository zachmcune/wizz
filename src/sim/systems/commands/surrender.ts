import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { getPlayer } from '../../queries';

export function handleSurrender(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'surrender' }>): void {
  const player = getPlayer(state, cmd.playerId);
  if (!player || player.defeated) return;
  player.defeated = true;
  ctx.events.push({ type: 'playerDefeated', playerId: player.id });
}
