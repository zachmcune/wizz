import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { getChanneler, makeChannelerCapability } from '../../capabilities';
import { isAlive } from '../../queries';

export function handleChannel(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'channel' }>): void {
  for (const id of cmd.entityIds) {
    const e = state.entities.get(id);
    if (!e || e.owner !== cmd.playerId || e.kind !== 'unit' || !isAlive(e)) continue;
    if (e.morphProgress !== undefined) continue;
    const udef = ctx.services.registry.units.get(e.defId);
    if (!udef?.canConjureMana) continue;
    if (!cmd.enabled) {
      const ch = getChanneler(e);
      if (ch) {
        ch.channeling = false;
        ch.channelTicks = undefined;
      }
      if (e.state === 'channeling') e.state = 'idle';
      continue;
    }
    if (!e.caps) e.caps = {};
    e.caps.channeler = makeChannelerCapability(true, 0);
    e.state = 'channeling';
    e.orders = [];
    e.targetId = undefined;
    e.vel = { x: 0, y: 0 };
  }
}
