import { TICK_HZ, TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, SuperweaponBeam } from '../types';
import { entitiesSorted } from '../queries';
import { applyDamage } from '../combat-util';
import { clamp } from '../math';

export function superweaponSystem(state: GameState, ctx: StepContext): void {
  if (state.beams.length === 0) return;
  const dt = 1 / TICK_HZ;
  const map = ctx.services.registry.map(state.mapId);
  const maxX = map.tileW * TILE;
  const maxY = map.tileH * TILE;
  const survivors: SuperweaponBeam[] = [];

  for (const b of state.beams) {
    if (b.state === 'charging') {
      if (state.tick >= b.fireTick) {
        b.state = 'firing';
        b.expiresTick = state.tick + b.durationTicks;
        ctx.events.push({ type: 'superweaponFired', playerId: b.owner, x: b.pos.x, y: b.pos.y });
      }
      survivors.push(b);
      continue;
    }

    // firing: move then damage
    b.pos.x = clamp(b.pos.x + b.dir.x * b.speed * dt, 0, maxX);
    b.pos.y = clamp(b.pos.y + b.dir.y * b.speed * dt, 0, maxY);
    const r2 = b.radius * b.radius;
    for (const e of entitiesSorted(state)) {
      if (e.kind === 'resource_node' || e.state === 'dead') continue;
      const dx = e.pos.x - b.pos.x;
      const dy = e.pos.y - b.pos.y;
      if (dx * dx + dy * dy <= r2) applyDamage(state, ctx, e, b.damagePerTick, b.vs);
    }

    if (state.tick >= b.expiresTick) {
      ctx.events.push({ type: 'superweaponEnded', playerId: b.owner, x: b.pos.x, y: b.pos.y });
    } else {
      survivors.push(b);
    }
  }
  state.beams = survivors;
}
