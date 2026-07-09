// Advances in-flight projectiles toward their target and applies damage on hit.
import { TICK_HZ } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { entitiesSorted, isAlive } from '../queries';
import { len, normalize } from '../math';
import { applyDamage, applyOnHitStatus, applySplashDamage } from '../combat-util';
import type { ArmorClass } from '../../data/defs';
import { sandboxFreezeProjectiles } from '../sandbox-flags';

export function projectileSystem(state: GameState, ctx: StepContext): void {
  if (sandboxFreezeProjectiles(state)) return;
  const dt = 1 / TICK_HZ;
  const toRemove: number[] = [];
  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'projectile') continue;
    const target = e.projTargetId !== undefined ? state.entities.get(e.projTargetId) : undefined;
    if (!isAlive(target) || (target.kind === 'unit' && target.garrisonedIn !== undefined)) {
      toRemove.push(e.id);
      continue;
    }
    const dx = target.pos.x - e.pos.x;
    const dy = target.pos.y - e.pos.y;
    const d = len(dx, dy);
    const step = (e.projSpeed ?? 300) * dt;
    if (d <= step + target.radius) {
      const vs = e.projArmorVs as Record<ArmorClass, number>;
      const radius = e.projImpactRadius ?? e.projSplashRadius;
      if (radius !== undefined && e.projSourceOwner) {
        applySplashDamage(
          state,
          ctx,
          e.projSourceOwner,
          target.pos.x,
          target.pos.y,
          radius,
          e.projDamage ?? 0,
          vs,
          e.projSourceId,
          e.projOnHitStatus,
        );
      } else {
        applyDamage(state, ctx, target, e.projDamage ?? 0, vs, e.projSourceId);
        applyOnHitStatus(state, target, e.projOnHitStatus);
      }
      toRemove.push(e.id);
    } else {
      const n = normalize(dx, dy);
      e.pos.x += n.x * step;
      e.pos.y += n.y * step;
      e.facing = Math.atan2(n.y, n.x);
    }
  }
  for (const id of toRemove) state.entities.delete(id);
}
