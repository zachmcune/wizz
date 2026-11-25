// Projectiles: advance toward the target and apply damage on arrival.
//
// A projectile holds a target id rather than a position snapshot, so it tracks a moving target the
// way v1 did. If the target dies or is garrisoned first, the projectile is removed — no phantom
// damage on whatever happens to be nearby.

import { TICK_HZ } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { KIND_PROJECTILE, KIND_UNIT, STATE_GARRISONED } from '../entity-store';
import { normalize } from '../../core/math';
import { applyDamage, applyOnHitStatus, applySplashDamage } from '../combat-util';
import { getProjectile, garrisonedInId } from '../capabilities';

export function projectileSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const dt = 1 / TICK_HZ;
  const remove: number[] = [];

  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_PROJECTILE) continue;
    const cap = getProjectile(store.extras[slot]!);
    if (!cap) {
      remove.push(slot);
      continue;
    }
    const targetSlot = store.slotOf(cap.targetId);
    if (
      targetSlot < 0 ||
      store.dead[targetSlot] ||
      (store.kind[targetSlot] === KIND_UNIT && garrisonedInId(store.extras[targetSlot]!) !== undefined)
    ) {
      remove.push(slot);
      continue;
    }

    const dx = store.posX[targetSlot]! - store.posX[slot]!;
    const dy = store.posY[targetSlot]! - store.posY[slot]!;
    const d = Math.hypot(dx, dy);
    const step = cap.speed * dt;

    if (d <= step + store.radius[targetSlot]!) {
      const radius = cap.impactRadius ?? cap.splashRadius;
      if (radius !== undefined) {
        applySplashDamage(
          state,
          ctx,
          cap.sourceOwner,
          store.posX[targetSlot]!,
          store.posY[targetSlot]!,
          radius,
          cap.damage,
          cap.armorVs,
          cap.sourceId,
          cap.onHitStatus,
          { targetsAir: cap.targetsAir, targetsGround: cap.targetsGround },
        );
      } else {
        applyDamage(state, ctx, targetSlot, cap.damage, cap.armorVs, cap.sourceId);
        applyOnHitStatus(state, targetSlot, cap.onHitStatus);
      }
      remove.push(slot);
    } else {
      const n = normalize(dx, dy);
      store.posX[slot] = store.posX[slot]! + n.x * step;
      store.posY[slot] = store.posY[slot]! + n.y * step;
      store.facing[slot] = Math.atan2(n.y, n.x);
    }
  }

  // Mark rather than delete: compaction at end of tick keeps slot indices stable for this system.
  for (const slot of remove) store.kill(slot);
}

export { STATE_GARRISONED };
