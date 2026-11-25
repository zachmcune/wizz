// Channel: Mana Weavers sitting still and conjuring mana in discrete pulses.
//
// Channeling is a *state*, not an order: any move/attack/garrison order clears it (the command
// handlers do that). A channeler that loses its unit def mid-game stops cleanly.

import { secondsToTicks } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { KIND_UNIT, STATE_CHANNELING, STATE_IDLE } from '../entity-store';
import { getChanneler, isChanneling } from '../capabilities';
import { getPlayer } from '../queries';
import { resolveEconomyStat } from '../modifiers';

export function channelSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;
  const intervalTicks = secondsToTicks(registry.balance.conjureManaIntervalSeconds);

  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    const ex = store.extras[slot]!;
    if (!isChanneling(ex)) continue;

    const udef = registry.units.get(ex.defId);
    const channeler = getChanneler(ex)!;
    if (!udef?.canConjureMana) {
      channeler.channeling = false;
      channeler.channelTicks = 0;
      if (store.state[slot] === STATE_CHANNELING) store.state[slot] = STATE_IDLE;
      continue;
    }

    const owner = store.ownerId(store.ownerIndex[slot]!);
    const player = getPlayer(state, owner);
    if (!player) continue;

    store.velX[slot] = 0;
    store.velY[slot] = 0;
    ex.orders.length = 0;

    channeler.channelTicks++;
    if (channeler.channelTicks < intervalTicks) continue;
    channeler.channelTicks = 0;
    // Conjured mana scales with the same economy modifier as siphoning, so research that improves
    // harvesting also improves weavers (one economy stat, one place to tune).
    const perPulse =
      registry.balance.conjureManaAmount *
      (resolveEconomyStat(registry, player, 'siphonPerSecond') / registry.balance.siphonPerSecond);
    const amount = perPulse;
    player.mana += amount;
    ctx.events.push({
      type: 'manaConjured',
      playerId: player.id,
      amount,
      x: store.posX[slot]!,
      y: store.posY[slot]!,
    });
    ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
  }
}
