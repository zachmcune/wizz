// Mana Weaver channeling: sit and conjure mana over time.
import { secondsToTicks } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { entitiesSorted, isAlive, getPlayer } from '../queries';

export function channelSystem(state: GameState, ctx: StepContext): void {
  const balance = ctx.services.registry.balance;
  const intervalTicks = secondsToTicks(balance.conjureManaIntervalSeconds);
  const manaPerTick = balance.conjureManaAmount / intervalTicks;

  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'unit' || !isAlive(e) || !e.channeling) continue;
    const udef = ctx.services.registry.units.get(e.defId);
    if (!udef?.canConjureMana) {
      e.channeling = false;
      if (e.state === 'channeling') e.state = 'idle';
      continue;
    }
    e.vel = { x: 0, y: 0 };
    e.orders = [];
    const player = getPlayer(state, e.owner);
    if (!player) continue;
    player.mana += manaPerTick;
    ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
  }
}
