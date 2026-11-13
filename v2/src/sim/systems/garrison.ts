// Garrison: units inside a bunker fire from protected runic slits.
//
// Garrisoned units are not valid targets (they are inside the host), they cannot move, and they
// fire with a range bonus. This is what makes the Arcane Bunker a real defensive choice rather
// than a wall.

import { TICK_HZ } from '../../core/constants';
import type { WeaponDef } from '../../data/defs';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { KIND_BUILDING, KIND_PROJECTILE, KIND_RESOURCE_NODE, KIND_UNIT } from '../entity-store';
import { distSq } from '../../core/math';
import { buildingHasPower } from '../power';
import { isVisibleTo } from '../fog';
import { garrisonedIds, hasMorph } from '../capabilities';
import { fire, weaponOfSlot } from './combat';

export function garrisonSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;

  for (let hostSlot = 0; hostSlot < store.count; hostSlot++) {
    if (store.dead[hostSlot] || store.kind[hostSlot] !== KIND_BUILDING) continue;
    const ex = store.extras[hostSlot]!;
    const ids = garrisonedIds(ex);
    if (!ids.length) continue;
    if (ex.caps.building && (ex.caps.building as { buildProgress?: number }).buildProgress !== undefined) continue;
    if (hasMorph(ex)) continue;
    const bdef = registry.buildings.get(ex.defId);
    if (!bdef?.garrison) continue;
    if (!buildingHasPower(state, registry, hostSlot)) continue;

    const owner = store.ownerId(store.ownerIndex[hostSlot]!);
    const rangeBonus = bdef.garrison.rangeBonus ?? 0;

    for (const unitId of ids) {
      const unitSlot = store.slotOf(unitId);
      if (unitSlot < 0 || store.dead[unitSlot] || store.kind[unitSlot] !== KIND_UNIT) continue;
      const uex = store.extras[unitSlot]!;
      const w = weaponOfSlot(registry, store, unitSlot);
      if (!w) continue;

      if (uex.cooldowns.attack && uex.cooldowns.attack > 0) uex.cooldowns.attack--;
      if ((uex.cooldowns.attack ?? 0) > 0) continue;

      const effective: WeaponDef = { ...w, range: w.range + rangeBonus };
      const targetSlot = acquireGarrisonTarget(state, ctx, hostSlot, unitSlot, effective.range, effective);
      if (targetSlot < 0) continue;
      // The shot originates from the building, not the unit's stored position.
      fire(state, ctx, unitSlot, targetSlot, effective);
      void owner;
    }
  }
  void TICK_HZ;
}

function acquireGarrisonTarget(
  state: GameState,
  ctx: StepContext,
  hostSlot: number,
  unitSlot: number,
  range: number,
  w: WeaponDef,
): number {
  const store = state.entities;
  const owner = store.ownerId(store.ownerIndex[unitSlot]!);
  let best = -1;
  let bestD = Infinity;
  let bestId = Infinity;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    const kind = store.kind[slot]!;
    if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
    if (state.relations[owner]?.[store.ownerId(store.ownerIndex[slot]!)] !== 'enemy') continue;
    if (!isVisibleTo(state, owner, slot, ctx.services.nav)) continue;
    const air = kind === KIND_UNIT && ctx.services.registry.units.get(store.extras[slot]!.defId)?.mobility === 'air';
    if (air && w.targetsAir !== true) continue;
    if (!air && w.targetsGround === false) continue;
    const d = distSq(store.posX[hostSlot]!, store.posY[hostSlot]!, store.posX[slot]!, store.posY[slot]!);
    const reach = range + store.radius[hostSlot]! + store.radius[slot]!;
    if (d > reach * reach) continue;
    const id = store.id[slot]!;
    if (d < bestD || (d === bestD && id < bestId)) {
      bestD = d;
      bestId = id;
      best = slot;
    }
  }
  return best;
}
