// Harvest cycle: travel to a Mana Node → siphon → return to an Attunement Spire → deposit.
//
// The siphon rate is `balance.siphonPerSecond` (16/s) applied ONLY while in contact with the node,
// which is what makes refinery placement matter. This is v1 behaviour, kept verbatim per the
// decision to reject the harvest retune — see REBUILD_PLAN §3.1, where the per-tick instrumentation
// proving the rate is exactly as configured is recorded.

import { TICK_HZ, TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { KIND_BUILDING, KIND_RESOURCE_NODE, KIND_UNIT, STATE_HARVESTING, STATE_IDLE, STATE_RETURNING } from '../entity-store';
import { getHarvester, isChanneling } from '../capabilities';
import { buildingHasPower } from '../power';
import { resolveEconomyStat } from '../modifiers';
import { getPlayer } from '../queries';
import { makePathContext, moveTowardGoal } from '../pathing';

/**
 * Distance from a point to a building's *footprint rectangle* (0 when inside).
 *
 * Dock checks must use this rather than distance-to-centre. A 2x2 building is a 64x64 square whose
 * half-diagonal is 45.25, so a wisp approaching a corner can never get closer to the centre than
 * 45.25 + its own radius (54.25) — which is outside the old 45-unit dock radius. That made a wisp
 * that happened to approach a corner park with a full load and freeze forever. Found by the headless
 * match demo: player1's three wisps sat at carry=75 in `returning` with no error.
 */
function distanceToFootprint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  footprint: number,
): number {
  const half = (footprint * TILE) / 2;
  const dx = Math.max(Math.abs(x - cx) - half, 0);
  const dy = Math.max(Math.abs(y - cy) - half, 0);
  return Math.hypot(dx, dy);
}

function nearestRefinery(state: GameState, ctx: StepContext, unitSlot: number): number {
  const store = state.entities;
  const owner = store.ownerId(store.ownerIndex[unitSlot]!);
  let best = -1;
  let bestD = Infinity;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.ownerId(store.ownerIndex[slot]!) !== owner) continue;
    const bdef = ctx.services.registry.buildings.get(store.extras[slot]!.defId);
    if (!bdef?.isRefinery) continue;
    if (store.extras[slot]!.caps.building && (store.extras[slot]!.caps.building as { buildProgress?: number }).buildProgress !== undefined) continue;
    const dx = store.posX[slot]! - store.posX[unitSlot]!;
    const dy = store.posY[slot]! - store.posY[unitSlot]!;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = slot;
    }
  }
  return best;
}

function nearestNode(state: GameState, unitSlot: number): number {
  const store = state.entities;
  let best = -1;
  let bestD = Infinity;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_RESOURCE_NODE) continue;
    if (store.amount[slot]! <= 0) continue;
    const dx = store.posX[slot]! - store.posX[unitSlot]!;
    const dy = store.posY[slot]! - store.posY[unitSlot]!;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = slot;
    }
  }
  return best;
}

export function harvestSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;
  const dt = 1 / TICK_HZ;

  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    const ex = store.extras[slot]!;
    const harvester = getHarvester(ex);
    if (!harvester) continue;
    if (isChanneling(ex)) continue;
    const order = ex.orders[0] as { type: string; nodeId?: number } | undefined;
    if (!order || order.type !== 'harvest') continue;

    const owner = store.ownerId(store.ownerIndex[slot]!);
    const player = getPlayer(state, owner);
    const udef = registry.units.get(ex.defId);
    if (!player || !udef) continue;

    const pathCtx = makePathContext(ctx.services.nav, ctx.services.flow, state.relations, owner);

    if (store.state[slot] === STATE_RETURNING) {
      const spireSlot = nearestRefinery(state, ctx, slot);
      if (spireSlot < 0) {
        // No drop-off: nothing to return to, so go back to harvesting rather than freezing.
        store.state[slot] = STATE_HARVESTING;
        continue;
      }
      if (!buildingHasPower(state, registry, spireSlot)) continue;
      const res = moveTowardGoal(
        store.posX[slot]!,
        store.posY[slot]!,
        pathCtx,
        { x: store.posX[spireSlot]!, y: store.posY[spireSlot]! },
        udef.speed,
        dt,
        store.radius[slot]!,
      );
      if (res.result.moved) {
        store.posX[slot] = res.result.x;
        store.posY[slot] = res.result.y;
      }
      // Distance is measured AFTER the move. Measuring before the write uses a stale position and
      // can miss the dock on the tick the unit actually arrives, delaying every deposit by a tick.
      const spireDef = ctx.services.registry.buildings.get(store.extras[spireSlot]!.defId);
      const edgeDist = distanceToFootprint(
        store.posX[slot]!,
        store.posY[slot]!,
        store.posX[spireSlot]!,
        store.posY[spireSlot]!,
        spireDef?.footprint ?? 1,
      );
      // Dock when touching the footprint, not the centre — see distanceToFootprint.
      if (edgeDist <= store.radius[slot]! + 8) {
        const amount = harvester.carry;
        player.mana += amount;
        ctx.events.push({
          type: 'manaDeposited',
          playerId: player.id,
          amount,
          x: store.posX[spireSlot]!,
          y: store.posY[spireSlot]!,
        });
        ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
        harvester.carry = 0;
        store.state[slot] = STATE_HARVESTING;
      }
      continue;
    }

    // ---- harvesting (moving to the node, then siphoning)
    let nodeSlot = order.nodeId !== undefined ? store.slotOf(order.nodeId) : -1;
    if (nodeSlot < 0 || store.kind[nodeSlot] !== KIND_RESOURCE_NODE || store.amount[nodeSlot]! <= 0 || store.dead[nodeSlot]) {
      nodeSlot = nearestNode(state, slot);
      if (nodeSlot < 0) {
        ex.orders.length = 0;
        store.state[slot] = STATE_IDLE;
        continue;
      }
      ex.orders = [{ type: 'harvest', nodeId: store.id[nodeSlot]! }];
    }

    const res = moveTowardGoal(
      store.posX[slot]!,
      store.posY[slot]!,
      pathCtx,
      { x: store.posX[nodeSlot]!, y: store.posY[nodeSlot]! },
      udef.speed,
      dt,
      store.radius[slot]!,
    );
    if (res.result.moved) {
      store.posX[slot] = res.result.x;
      store.posY[slot] = res.result.y;
    }

    const d = Math.hypot(
      store.posX[nodeSlot]! - store.posX[slot]!,
      store.posY[nodeSlot]! - store.posY[slot]!,
    );
    const contact = store.radius[nodeSlot]! + store.radius[slot]! + 4;
    if (d <= contact) {
      const room = harvester.carryMax - harvester.carry;
      const vaultBonus = player.unlockedTech.includes('resonance_vault')
        ? registry.balance.vaultSiphonMultiplier
        : 1;
      const siphonPerSec = resolveEconomyStat(registry, player, 'siphonPerSecond') * vaultBonus;
      const take = Math.min((siphonPerSec / TICK_HZ), room, store.amount[nodeSlot]!);
      harvester.carry += take;
      store.amount[nodeSlot] = store.amount[nodeSlot]! - take;
      if (harvester.carry >= harvester.carryMax) store.state[slot] = STATE_RETURNING;
    }
  }
}
