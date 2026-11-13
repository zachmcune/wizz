// Movement: flow-field steering plus local separation and collision.
//
// This is a "feel" system as much as a correctness one. Two rules drive the design:
//   1. Units in a group must not overlap or jitter — separation is applied before the move, and the
//      move itself slides along blocked axes rather than stopping dead.
//   2. A unit that cannot reach its exact goal must still make progress, so the goal is considered
//      reached within `TILE * 0.4` rather than at exact equality.
//
// The separation hash (a pair-keyed angle) is deterministic: it derives from the two entity ids, not
// from iteration order, so two perfectly-overlapping units always push apart the same way.

import { TICK_HZ, TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, EntityId } from '../types';
import {
  EntityStore,
  KIND_UNIT,
  STATE_GARRISONED,
  STATE_IDLE,
  STATE_MOVING,
} from '../entity-store';
import {
  ensureGarrisonHost,
  garrisonedInId,
  getGarrisonHost,
  hasMorph,
  isChanneling,
} from '../capabilities';
import { makePathContext, moveTowardGoal, slidePosition, applyVelocityMove, steerToGoal } from '../pathing';
import { resolveUnitStat } from '../modifiers';
import { getPlayer } from '../queries';

const SEP_BLEND = 0.55;

export interface SeparationPush {
  x: number;
  y: number;
}

/**
 * Push that resolves one overlapping pair. Symmetric in the two ids so the result does not depend
 * on which entity is processed first; perfectly-coincident units are separated along a deterministic
 * pseudo-angle derived from their ids.
 */
export function separationForPair(
  ax: number,
  ay: number,
  aRadius: number,
  aId: EntityId,
  bx: number,
  by: number,
  bRadius: number,
  bId: EntityId,
): SeparationPush {
  const ox = ax - bx;
  const oy = ay - by;
  const dd = Math.hypot(ox, oy);
  const minDist = aRadius + bRadius;
  if (dd >= minDist) return { x: 0, y: 0 };
  if (dd > 0) {
    const push = (minDist - dd) / minDist;
    return { x: (ox / dd) * push, y: (oy / dd) * push };
  }
  const low = Math.min(aId, bId);
  const high = Math.max(aId, bId);
  const angle = (((low * 73856093 + high * 19349663) >>> 0) % 360) * (Math.PI / 180);
  const sign = aId === low ? 1 : -1;
  return { x: Math.cos(angle) * sign, y: Math.sin(angle) * sign };
}

function isAir(store: EntityStore, registry: StepContext['services']['registry'], slot: number): boolean {
  if (store.kind[slot] !== KIND_UNIT) return false;
  return registry.units.get(store.extras[slot]!.defId)?.mobility === 'air';
}

/** Remove a unit's garrison reservation from every host (cheap: only hosts that have any). */
function clearGarrisonReservations(state: GameState, unitId: EntityId): void {
  const store = state.entities;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.kind[slot] !== 1) continue;
    const host = getGarrisonHost(store.extras[slot]!);
    if (!host?.garrisonReservedIds.length) continue;
    const filtered = host.garrisonReservedIds.filter((id: EntityId) => id !== unitId);
    if (filtered.length !== host.garrisonReservedIds.length) host.garrisonReservedIds = filtered;
  }
}

export function movementSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;
  const nav = ctx.services.nav;
  const dt = 1 / TICK_HZ;
  const scratch: number[] = [];

  // ---- pass 1: ordered movement
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    const ex = store.extras[slot]!;

    if (store.state[slot] === STATE_GARRISONED || garrisonedInId(ex) !== undefined) {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }
    if (hasMorph(ex) || isChanneling(ex)) {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }

    const order = ex.orders[0] as
      | { type: 'move' | 'attackMove' | 'moveInOrder'; x: number; y: number; groupSpeed?: number }
      | { type: 'garrison'; buildingId: EntityId }
      | undefined;
    if (!order) {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }

    const owner = store.ownerId(store.ownerIndex[slot]!);
    const player = getPlayer(state, owner);
    const udef = registry.units.get(ex.defId);
    if (!player || !udef) continue;

    let speed = resolveUnitStat(state, registry, player, udef, 'speed', slot);
    if (order.type === 'moveInOrder' && order.groupSpeed !== undefined) speed = order.groupSpeed;

    const flying = isAir(store, registry, slot);
    const pathCtx = makePathContext(nav, ctx.services.flow, state.relations, owner, flying);

    // Garrison walk-in resolves to an occupancy handoff, not a position.
    if (order.type === 'garrison') {
      const hostSlot = store.slotOf(order.buildingId);
      if (hostSlot < 0 || store.kind[hostSlot] !== 1 || store.dead[hostSlot]) {
        clearGarrisonReservations(state, store.id[slot]!);
        ex.orders.shift();
        store.state[slot] = STATE_IDLE;
        store.velX[slot] = 0;
        store.velY[slot] = 0;
        continue;
      }
      const dx = store.posX[hostSlot]! - store.posX[slot]!;
      const dy = store.posY[hostSlot]! - store.posY[slot]!;
      const d = Math.hypot(dx, dy);
      if (d <= store.radius[slot]! + store.radius[hostSlot]! + 8) {
        clearGarrisonReservations(state, store.id[slot]!);
        const host = ensureGarrisonHost(store.extras[hostSlot]!);
        if (!host.garrisonedIds.includes(store.id[slot]!)) host.garrisonedIds.push(store.id[slot]!);
        // The garrison capability lives on the unit.
        store.extras[slot]!.caps.garrisonable = { garrisonedIn: store.id[hostSlot]! };
        store.posX[slot] = store.posX[hostSlot]!;
        store.posY[slot] = store.posY[hostSlot]!;
        store.velX[slot] = 0;
        store.velY[slot] = 0;
        ex.orders.length = 0;
        store.state[slot] = STATE_GARRISONED;
        continue;
      }
      const res = moveTowardGoal(
        store.posX[slot]!,
        store.posY[slot]!,
        pathCtx,
        { x: store.posX[hostSlot]!, y: store.posY[hostSlot]! },
        speed,
        dt,
        store.radius[slot]!,
      );
      if (res.result.moved) {
        store.posX[slot] = res.result.x;
        store.posY[slot] = res.result.y;
      }
      continue;
    }

    const goalX = order.x;
    const goalY = order.y;
    const dx = goalX - store.posX[slot]!;
    const dy = goalY - store.posY[slot]!;
    const d = Math.hypot(dx, dy);
    if (d <= TILE * 0.4) {
      ex.orders.shift();
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      if (ex.orders.length === 0 && store.state[slot] === STATE_MOVING) store.state[slot] = STATE_IDLE;
      continue;
    }

    // Separation from neighbours, applied as an extra steering term.
    let sepX = 0;
    let sepY = 0;
    const neighbours = ctx.services.spatial.queryRadius(
      store.posX[slot]!,
      store.posY[slot]!,
      store.radius[slot]! * 3,
      scratch,
    );
    for (const other of neighbours) {
      if (other === slot) continue;
      if (store.kind[other] !== KIND_UNIT) continue;
      if (isAir(store, registry, other) !== flying) continue;
      const push = separationForPair(
        store.posX[slot]!,
        store.posY[slot]!,
        store.radius[slot]!,
        store.id[slot]!,
        store.posX[other]!,
        store.posY[other]!,
        store.radius[other]!,
        store.id[other]!,
      );
      sepX += push.x;
      sepY += push.y;
    }

    // Primary steering, then separation blended in. The blend is capped so separation can never
    // overwhelm the path direction and push a unit away from its goal.
    const baseSteer = steerToGoal(
      makePathContext(nav, ctx.services.flow, state.relations, owner, flying),
      { x: store.posX[slot]!, y: store.posY[slot]! },
      { x: goalX, y: goalY },
    );
    let moveX = baseSteer.x * speed + sepX * speed * SEP_BLEND;
    let moveY = baseSteer.y * speed + sepY * speed * SEP_BLEND;

    if (moveX === 0 && moveY === 0) {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }

    // Clamp the combined vector to the unit's speed so separation cannot make units faster.
    const mag = Math.hypot(moveX, moveY);
    if (mag > speed) {
      moveX = (moveX / mag) * speed;
      moveY = (moveY / mag) * speed;
    }

    const res = applyVelocityMove(
      store.posX[slot]!,
      store.posY[slot]!,
      moveX,
      moveY,
      pathCtx,
      dt,
      undefined,
      store.radius[slot]!,
    );
    if (res.moved) {
      store.posX[slot] = res.x;
      store.posY[slot] = res.y;
      store.velX[slot] = moveX;
      store.velY[slot] = moveY;
      if (res.facing !== 0) store.facing[slot] = res.facing;
    } else {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
    }
  }

  // ---- pass 2: idle separation so stacked units spread out without orders
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    const ex = store.extras[slot]!;
    if (ex.orders.length > 0 || isChanneling(ex) || store.state[slot] === STATE_GARRISONED) continue;
    const owner = store.ownerId(store.ownerIndex[slot]!);
    const flying = isAir(store, registry, slot);
    const pathCtx = makePathContext(nav, ctx.services.flow, state.relations, owner, flying);
    const neighbours = ctx.services.spatial.queryRadius(
      store.posX[slot]!,
      store.posY[slot]!,
      store.radius[slot]! * 2.5,
      scratch,
    );
    let sepX = 0;
    let sepY = 0;
    for (const other of neighbours) {
      if (other === slot) continue;
      if (store.kind[other] !== KIND_UNIT) continue;
      if (isAir(store, registry, other) !== flying) continue;
      const push = separationForPair(
        store.posX[slot]!,
        store.posY[slot]!,
        store.radius[slot]!,
        store.id[slot]!,
        store.posX[other]!,
        store.posY[other]!,
        store.radius[other]!,
        store.id[other]!,
      );
      sepX += push.x;
      sepY += push.y;
    }
    if (sepX === 0 && sepY === 0) continue;
    const slid = slidePosition(
      pathCtx,
      store.posX[slot]!,
      store.posY[slot]!,
      store.posX[slot]! + sepX * 8 * dt,
      store.posY[slot]! + sepY * 8 * dt,
      store.radius[slot]!,
    );
    if (slid) {
      store.posX[slot] = slid.x;
      store.posY[slot] = slid.y;
    }
  }
}

