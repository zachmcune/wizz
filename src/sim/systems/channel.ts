// Mana Weaver channeling: sit and conjure mana in discrete pulses (10 mana / 2 sec).
import { secondsToTicks } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { entitiesSorted, isAlive, getPlayer } from '../queries';

export function channelSystem(state: GameState, ctx: StepContext): void {
  const balance = ctx.services.registry.balance;
  const intervalTicks = secondsToTicks(balance.conjureManaIntervalSeconds);

  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'unit' || !isAlive(e) || !e.channeling) continue;
    const udef = ctx.services.registry.units.get(e.defId);
    if (!udef?.canConjureMana) {
      e.channeling = false;
      e.channelTicks = undefined;
      if (e.state === 'channeling') e.state = 'idle';
      continue;
    }
    e.vel = { x: 0, y: 0 };
    e.orders = [];
    const player = getPlayer(state, e.owner);
    if (!player) continue;

    const acc = (e.channelTicks ?? 0) + 1;
    if (acc < intervalTicks) {
      e.channelTicks = acc;
      continue;
    }
    e.channelTicks = 0;
    player.mana += balance.conjureManaAmount;
    ctx.events.push({
      type: 'manaConjured',
      playerId: player.id,
      amount: balance.conjureManaAmount,
      x: e.pos.x,
      y: e.pos.y,
    });
    ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
  }
}
