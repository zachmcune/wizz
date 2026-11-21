// Death: remove dead entities, free nav footprints, eject garrisoned occupants.
//
// Compaction happens here, once per tick, after every system has had its chance to look at the
// dead entity (so a unit that died this tick is still visible to death-triggered effects). That
// ordering is deliberate: v1 removed entities inline, which made "who saw the corpse" depend on
// system order.

import type { StepContext } from '../context';
import type { GameState } from '../types';
import { KIND_BUILDING, KIND_RESOURCE_NODE, STATE_IDLE } from '../entity-store';
import { clearGarrisonHost, garrisonedIds, clearGarrisonedIn, getGarrisonable } from '../capabilities';
import { recomputePower } from '../power';
import { applyDamage } from '../combat-util';
import { findSpawnPosition, clearBuildingNav } from './production';

export function deathSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  let killedBuilding = false;

  // Eject occupants before the host disappears, so they are not orphaned.
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.hp[slot]! > 0) continue;
    const bdef = ctx.services.registry.buildings.get(store.extras[slot]!.defId);
    const garrison = bdef?.garrison;
    if (!garrison) continue;
    const ids = [...garrisonedIds(store.extras[slot]!)].sort((a, b) => a - b);
    for (const id of ids) {
      const unitSlot = store.slotOf(id);
      if (unitSlot < 0) continue;
      const spawn = findSpawnPosition(state, ctx, slot, store.radius[unitSlot]!);
      clearGarrisonedIn(store.extras[unitSlot]!);
      store.posX[unitSlot] = spawn.x;
      store.posY[unitSlot] = spawn.y;
      store.velX[unitSlot] = 0;
      store.velY[unitSlot] = 0;
      store.extras[unitSlot]!.orders.length = 0;
      store.state[unitSlot] = STATE_IDLE;
      // Occupants take a fraction of their max HP as the host collapses.
      applyDamage(
        state,
        ctx,
        unitSlot,
        store.maxHp[unitSlot]! * garrison.damageOnHostDestroyedFraction,
        { light: 1, heavy: 1, building: 1 },
      );
    }
    clearGarrisonHost(store.extras[slot]!);
  }

  // Free nav footprints of dead buildings before compaction invalidates the slots.
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.hp[slot]! > 0) continue;
    clearBuildingNav(state, ctx.services, slot);
    killedBuilding = true;
  }

  // Resource nodes die when depleted — handled by `isAliveSlot`, so mark them so compaction takes
  // them, and emit nothing (a drained node is not a death).
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_RESOURCE_NODE) continue;
    if (store.amount[slot]! <= 0) store.kill(slot);
  }

  // Kill anything that reached 0 HP this tick but was not marked by applyDamage (e.g. direct HP
  // writes from dev commands). applyDamage already calls kill(), so this is a safety net.
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    if (store.kind[slot] === KIND_RESOURCE_NODE) continue;
    if (store.hp[slot]! > 0) continue;
    store.kill(slot);
  }

  if (killedBuilding) recomputePower(state, ctx.services.registry);

  // Single compaction point for the tick.
  store.compact();
}

/** Any garrisonable marker left on a unit that is no longer garrisoned. */
export function isOrphanGarrisonable(state: GameState, slot: number): boolean {
  const cap = getGarrisonable(state.entities.extras[slot]!);
  return cap !== undefined && state.entities.dead[slot] === 1;
}
