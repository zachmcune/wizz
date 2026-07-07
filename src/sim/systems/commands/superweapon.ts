import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { normalize } from '../../math';

export function handleSteerSuperweapon(
  state: GameState,
  _ctx: StepContext,
  cmd: Extract<Command, { type: 'steerSuperweapon' }>,
): void {
  const beam = state.beams.find((b) => b.owner === cmd.playerId);
  if (!beam) return;
  beam.dir = normalize(cmd.x - beam.pos.x, cmd.y - beam.pos.y);
}
