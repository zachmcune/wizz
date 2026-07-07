import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { isAlive } from '../../queries';

export function handleChannel(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'channel' }>): void {
  for (const id of cmd.entityIds) {
    const e = state.entities.get(id);
    if (!e || e.owner !== cmd.playerId || e.kind !== 'unit' || !isAlive(e)) continue;
    if (e.morphProgress !== undefined) continue;
    const udef = ctx.services.registry.units.get(e.defId);
    if (!udef?.canConjureMana) continue;
    if (!cmd.enabled) {
      e.channeling = false;
      e.channelTicks = undefined;
      if (e.state === 'channeling') e.state = 'idle';
      continue;
    }
    e.channeling = true;
    e.channelTicks = 0;
    e.state = 'channeling';
    e.orders = [];
    e.targetId = undefined;
    e.vel = { x: 0, y: 0 };
  }
}
