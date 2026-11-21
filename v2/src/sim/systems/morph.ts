// Mobile HQ deploy (unit → building) and pack (building → unit).
//
// The Waystone Wagon is the expansion mechanic: deploy it near a far node to build there, then pack
// it back up to move again. HP is preserved proportionally across the conversion so a damaged wagon
// deploys into a damaged camp.

import type { StepContext } from '../context';
import type { GameState } from '../types';
import { KIND_BUILDING, KIND_UNIT, STATE_IDLE } from '../entity-store';
import { getMorph, hasMorph, ensureMorph } from '../capabilities';
import { recomputePower } from '../power';
import { clearBuildingNav, spawnBuildingAt, spawnUnitAt, unlockTech, applyBuildingNav } from './production';
import { getPlayer } from '../queries';

export function morphSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;
  let powerDirty = false;

  // Collect first: converting an entity mutates the store (spawns + kills), which is unsafe to do
  // while iterating slots.
  const deploys: number[] = [];
  const packs: number[] = [];

  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    const ex = store.extras[slot]!;
    const morph = getMorph(ex);
    if (!morph) continue;
    if (store.kind[slot] === KIND_UNIT && morph.action === 'deploy') deploys.push(slot);
    else if (store.kind[slot] === KIND_BUILDING && morph.action === 'pack') packs.push(slot);
  }

  for (const slot of deploys) {
    const ex = store.extras[slot]!;
    const udef = registry.units.get(ex.defId);
    const morph = ensureMorph(ex);
    if (!udef?.deploysAs) continue;
    const seconds = udef.deployTime ?? 10;
    morph.progress += 1 / Math.max(1, seconds * 20);
    if (morph.progress < 1) continue;

    const targetX = morph.targetX;
    const targetY = morph.targetY;
    if (targetX === undefined || targetY === undefined) {
      store.kill(slot);
      continue;
    }
    const owner = store.ownerId(store.ownerIndex[slot]!);
    const ratio = store.maxHp[slot]! > 0 ? store.hp[slot]! / store.maxHp[slot]! : 1;
    const newSlot = spawnBuildingAt(state, ctx.services, udef.deploysAs, owner, targetX, targetY, { complete: true }, ctx);
    if (newSlot >= 0) {
      store.hp[newSlot] = Math.max(1, store.maxHp[newSlot]! * ratio);
      applyBuildingNav(state, ctx.services, newSlot);
      unlockTech(state, owner, udef.deploysAs);
      ctx.events.push({ type: 'mobileHQDeployed', id: store.id[newSlot]!, defId: udef.deploysAs, owner });
    }
    store.kill(slot);
    powerDirty = true;
  }

  for (const slot of packs) {
    const ex = store.extras[slot]!;
    const bdef = registry.buildings.get(ex.defId);
    const morph = ensureMorph(ex);
    if (!bdef?.packsInto) continue;
    const seconds = bdef.packTime ?? 8;
    morph.progress += 1 / Math.max(1, seconds * 20);
    if (morph.progress < 1) continue;

    const owner = store.ownerId(store.ownerIndex[slot]!);
    const player = getPlayer(state, owner);
    const x = store.posX[slot]!;
    const y = store.posY[slot]!;
    const ratio = store.maxHp[slot]! > 0 ? store.hp[slot]! / store.maxHp[slot]! : 1;
    const unitDef = bdef.packsInto;
    const udef = registry.units.get(unitDef);
    clearBuildingNav(state, ctx.services, slot);
    store.kill(slot);
    const newSlot = spawnUnitAt(state, ctx.services, unitDef, owner, x, y, ctx);
    if (newSlot >= 0) {
      store.hp[newSlot] = Math.max(1, store.maxHp[newSlot]! * ratio);
      store.state[newSlot] = STATE_IDLE;
      store.extras[newSlot]!.orders.length = 0;
      ctx.events.push({ type: 'mobileHQPacked', id: store.id[newSlot]!, defId: unitDef, owner });
    }
    void udef;
    void player;
    powerDirty = true;
  }

  if (powerDirty) recomputePower(state, registry);
}

export { hasMorph };
