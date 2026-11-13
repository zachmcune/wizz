// Passive support auras (Sanctuary Spire). Heals allied units inside the ward radius each tick.
//
// Auras are hard power consumers, so an unpowered Sanctuary Spire stops healing — the same rule
// that shuts off a turret.

import type { StepContext } from '../context';
import type { GameState } from '../types';
import { KIND_BUILDING, KIND_PROJECTILE, KIND_RESOURCE_NODE, KIND_UNIT } from '../entity-store';
import { buildingHasPower } from '../power';
import { distSq } from '../../core/math';
import { garrisonedInId, hasMorph } from '../capabilities';

export function auraSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;

  for (let source = 0; source < store.count; source++) {
    if (store.dead[source] || store.kind[source] !== KIND_BUILDING) continue;
    const ex = store.extras[source]!;
    const bdef = registry.buildings.get(ex.defId);
    const aura = bdef?.aura;
    if (!aura || aura.kind !== 'heal') continue;
    if (ex.caps.building && (ex.caps.building as { buildProgress?: number }).buildProgress !== undefined) continue;
    if (hasMorph(ex)) continue;
    if (!buildingHasPower(state, registry, source)) continue;

    const owner = store.ownerId(store.ownerIndex[source]!);
    const radiusSq = aura.radius * aura.radius;
    for (let target = 0; target < store.count; target++) {
      if (store.dead[target]) continue;
      const kind = store.kind[target]!;
      if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
      if (aura.affects === 'units' && kind !== KIND_UNIT) continue;
      if (aura.affects === 'buildings' && kind !== KIND_BUILDING) continue;
      if (kind === KIND_UNIT && garrisonedInId(store.extras[target]!) !== undefined) continue;
      if (store.hp[target]! >= store.maxHp[target]!) continue;

      const tOwner = store.ownerId(store.ownerIndex[target]!);
      if (tOwner !== owner && state.relations[owner]?.[tOwner] !== 'ally') continue;
      if (distSq(store.posX[source]!, store.posY[source]!, store.posX[target]!, store.posY[target]!) > radiusSq) continue;

      const amount = Math.min(aura.hpPerTick, store.maxHp[target]! - store.hp[target]!);
      if (amount <= 0) continue;
      store.hp[target] = store.hp[target]! + amount;
      ctx.events.push({
        type: 'healApplied',
        targetId: store.id[target]!,
        amount,
        x: store.posX[target]!,
        y: store.posY[target]!,
      });
    }
  }
}
