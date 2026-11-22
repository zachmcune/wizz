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
import { getPlayer, hasHQ } from '../queries';
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
  let yard = -1;
  let yardD = Infinity;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.ownerId(store.ownerIndex[slot]!) !== owner) continue;
    const ex = store.extras[slot]!;
    const bdef = ctx.services.registry.buildings.get(ex.defId);
    if (!bdef) continue;
    if (ex.caps.building && (ex.caps.building as { buildProgress?: number }).buildProgress !== undefined) continue;
    const dx = store.posX[slot]! - store.posX[unitSlot]!;
    const dy = store.posY[slot]! - store.posY[unitSlot]!;
    const d = dx * dx + dy * dy;
    if (bdef.isRefinery) {
      if (d < bestD) {
        bestD = d;
        best = slot;
      }
    } else if (bdef.isConstructionYard) {
      /**
       * THE CONSTRUCTION YARD IS A FALLBACK DROP-OFF.
       *
       * Without this, a harvester that filled before the player's first refinery existed went into `returning`,
       * found no refinery, was pushed back to `harvesting`, and then had no room left to siphon — so it stood
       * at the node, permanently full, for the rest of the match, and the player's income was zero forever.
       * That is a genuine soft-lock, and it was reachable simply by taking one wisp off the starting node
       * before building a refinery.
       *
       * Depositing at the yard is slower in practice (the yard is further from the nodes than a refinery the
       * player placed deliberately), so refinery placement still matters — which is what keeps the §5.5
       * decision about refinery distance intact.
       */
      if (d < yardD) {
        yardD = d;
        yard = slot;
      }
    }
  }
  return best >= 0 ? best : yard;
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
    /**
     * A FULL WORKER ALWAYS DELIVERS, даже without a harvest order.
     *
     * A worker carrying a full load whose order was replaced (by any other system — a flee, a re-task, a queued move) used to
     * stop being processed entirely here, because the harvest system only ran for `type === 'harvest'`. Observed on seed 1000:
     * two workers held `carry 75/75` with no order and were skipped for the rest of the match, so the player had NO income for
     * sixteen minutes despite thirteen live mana nodes. Cargo is the player's money and it must always reach a drop-off.
     */
    const carrying = harvester.carry > 0;
    if (carrying && (!order || order.type !== 'harvest')) {
      store.state[slot] = STATE_RETURNING;
      ex.orders = [{ type: 'harvest' }];
      continue;
    }
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

  /**
   * THE SANCTUM TRICKLE — a floor under a dead economy.
   *
   * With no harvesters a side has no income whatsoever, so it can never afford the worker that would restore its income. Measured
   * on seed 1000: p2 held **155 mana** against a 200-cost worker with two attunement spires standing and stayed exactly 45 short
   * for the rest of the match, while its opponent sat on 111,700 untouched mana. Nothing could be sold — the yard and both spires
   * are load-bearing — so the game had no way to resolve.
   *
   * The rate is deliberately tiny (see `sanctumTricklePerSecond`): at 0.6/s it takes about six minutes to fund one worker, so it
   * is a recovery floor after a disaster, not an income that competes with mining. Accrued per player per tick only while the
   * player still holds an HQ, and credited only when it crosses a whole mana point so the bank stays an integer.
   */
  const trickle = registry.balance.sanctumTricklePerSecond;
  if (trickle > 0) {
    for (const player of state.players) {
      if (player.defeated) continue;
      if (!hasHQ(state, player.id)) continue;
      const before = Math.floor(player.mana);
      player.mana += trickle / TICK_HZ;
      // Only emit an event when the visible integer changes, so a trickle does not flood the event stream.
      if (Math.floor(player.mana) !== before) {
        ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: Math.floor(player.mana) });
      }
    }
  }
}
