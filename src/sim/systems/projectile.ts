// Advances in-flight projectiles toward their target and applies damage on hit.
import { TICK_HZ } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { entitiesSorted, isAlive } from '../queries';
import { len, normalize } from '../math';
import { applyDamage, applyOnHitStatus, applySplashDamage } from '../combat-util';
import type { ArmorClass } from '../../data/defs';
import { sandboxFreezeProjectiles } from '../sandbox-flags';
import { getProjectileCapability, garrisonedInId } from '../capabilities';

export function projectileSystem(state: GameState, ctx: StepContext): void {
  if (sandboxFreezeProjectiles(state)) return;
  const dt = 1 / TICK_HZ;
  const toRemove: number[] = [];
  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'projectile') continue;
    const cap = getProjectileCapability(e);
    if (!cap) {
      toRemove.push(e.id);
      continue;
    }
    const target = state.entities.get(cap.targetId);
    if (!isAlive(target) || (target.kind === 'unit' && garrisonedInId(target) !== undefined)) {
      toRemove.push(e.id);
      continue;
    }
    const dx = target.pos.x - e.pos.x;
    const dy = target.pos.y - e.pos.y;
    const d = len(dx, dy);
    const step = cap.speed * dt;
    if (d <= step + target.radius) {
      const vs = cap.armorVs as Record<ArmorClass, number>;
      const radius = cap.impactRadius ?? cap.splashRadius;
      if (radius !== undefined) {
        applySplashDamage(
          state,
          ctx,
          cap.sourceOwner,
          target.pos.x,
          target.pos.y,
          radius,
          cap.damage,
          vs,
          cap.sourceId,
          cap.onHitStatus,
        );
      } else {
        applyDamage(state, ctx, target, cap.damage, vs, cap.sourceId);
        applyOnHitStatus(state, target, cap.onHitStatus);
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
