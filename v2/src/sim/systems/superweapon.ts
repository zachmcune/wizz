// Superweapon beams (Astral Lance): a steerable satellite beam on a long cooldown.
//
// The beam charges for `chargeTicks`, then fires for `durationTicks` while travelling at `speed`
// and damaging anything within `radius` each tick. While firing, `steerSuperweapon` re-aims it.

import { TICK_HZ, TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { KIND_PROJECTILE, KIND_RESOURCE_NODE } from '../entity-store';
import { applyDamage } from '../combat-util';
import { clamp } from '../../core/math';
import { isAliveSlot } from '../queries';

export function superweaponSystem(state: GameState, ctx: StepContext): void {
  if (state.beams.length === 0) return;
  const store = state.entities;
  const dt = 1 / TICK_HZ;
  const map = ctx.services.registry.map(state.mapId);
  const maxX = map.tileW * TILE;
  const maxY = map.tileH * TILE;
  const survivors: typeof state.beams = [];

  for (const beam of state.beams) {
    if (beam.state === 'charging') {
      if (state.tick >= beam.fireTick) {
        beam.state = 'firing';
        beam.expiresTick = state.tick + beam.durationTicks;
        ctx.events.push({ type: 'superweaponFired', playerId: beam.owner, x: beam.x, y: beam.y });
      }
      survivors.push(beam);
      continue;
    }

    beam.x = clamp(beam.x + beam.dirX * beam.speed * dt, 0, maxX);
    beam.y = clamp(beam.y + beam.dirY * beam.speed * dt, 0, maxY);
    const r2 = beam.radius * beam.radius;
    for (let slot = 0; slot < store.count; slot++) {
      if (!isAliveSlot(state, slot)) continue;
      const kind = store.kind[slot]!;
      if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
      const dx = store.posX[slot]! - beam.x;
      const dy = store.posY[slot]! - beam.y;
      if (dx * dx + dy * dy <= r2) applyDamage(state, ctx, slot, beam.damagePerTick, beam.vs);
    }

    if (state.tick >= beam.expiresTick) {
      ctx.events.push({ type: 'superweaponEnded', playerId: beam.owner, x: beam.x, y: beam.y });
    } else {
      survivors.push(beam);
    }
  }
  state.beams = survivors;
}
