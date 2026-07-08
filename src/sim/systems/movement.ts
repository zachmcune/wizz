// Moves units along flow fields toward their goal, with local separation + collision.
// Makes group movement look coherent (no overlap/jitter). This is a "feel" system.
import { TILE, TICK_HZ } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, UnitEntity, EntityId } from '../types';
import { entitiesSorted, isAlive, hasBuff, strongestSlowMoveFactor } from '../queries';
import { steerToGoal, applyVelocityMove, slidePosition, makePathContext, moveTowardGoal } from '../pathing';
import { canUnitGarrison } from '../garrison';

const scratch: EntityId[] = [];
const SEP_BLEND = 0.55;

function separationForPair(e: UnitEntity, other: { id: EntityId; pos: { x: number; y: number }; radius: number }): { x: number; y: number } {
  const ox = e.pos.x - other.pos.x;
  const oy = e.pos.y - other.pos.y;
  const dd = Math.hypot(ox, oy);
  const minDist = e.radius + other.radius;
  if (dd >= minDist) return { x: 0, y: 0 };
  if (dd > 0) {
    const push = (minDist - dd) / minDist;
    return { x: (ox / dd) * push, y: (oy / dd) * push };
  }

  const low = Math.min(e.id, other.id);
  const high = Math.max(e.id, other.id);
  const angle = (((low * 73856093 + high * 19349663) >>> 0) % 360) * (Math.PI / 180);
  const sign = e.id === low ? 1 : -1;
  return { x: Math.cos(angle) * sign, y: Math.sin(angle) * sign };
}

function goalOf(e: UnitEntity): { x: number; y: number } | null {
  const o = e.orders[0];
  if (!o) return null;
  if (o.type === 'move' || o.type === 'attackMove' || o.type === 'moveInOrder') return { x: o.x, y: o.y };
  return null;
}

function removeReservation(building: { garrisonReservedIds?: EntityId[] }, unitId: EntityId): void {
  if (!building.garrisonReservedIds) return;
  building.garrisonReservedIds = building.garrisonReservedIds.filter((id) => id !== unitId);
}

export function movementSystem(state: GameState, ctx: StepContext): void {
  const nav = ctx.services.nav;
  const flow = ctx.services.flow;
  const dt = 1 / TICK_HZ;

  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'unit' || !isAlive(e)) continue;
    if (e.state === 'garrisoned' || e.garrisonedIn !== undefined) {
      e.vel = { x: 0, y: 0 };
      continue;
    }
    if (e.morphProgress !== undefined || e.channeling) {
      e.vel = { x: 0, y: 0 };
      continue;
    }
    const order = e.orders[0];
    const udef = ctx.services.registry.unit(e.defId);
    let speed = udef.speed;
    if (hasBuff(e, 'haste', state.tick)) speed *= 1.5;
    if (order?.type === 'moveInOrder') speed = order.groupSpeed;
    speed *= strongestSlowMoveFactor(e, state.tick);

    if (order?.type === 'garrison') {
      const building = state.entities.get(order.buildingId);
      if (!building || building.kind !== 'building' || !isAlive(building) || !canUnitGarrison(ctx.services.registry, e, building)) {
        if (building?.kind === 'building') removeReservation(building, e.id);
        e.orders.shift();
        e.state = 'idle';
        e.vel = { x: 0, y: 0 };
        continue;
      }
      const d = Math.hypot(building.pos.x - e.pos.x, building.pos.y - e.pos.y);
      if (d <= e.radius + building.radius + 8) {
        removeReservation(building, e.id);
        building.garrisonedIds ??= [];
        if (!building.garrisonedIds.includes(e.id)) building.garrisonedIds.push(e.id);
        e.garrisonedIn = building.id;
        e.pos = { x: building.pos.x, y: building.pos.y };
        e.vel = { x: 0, y: 0 };
        e.orders = [];
        e.state = 'garrisoned';
        e.targetId = undefined;
        continue;
      }
      const pathCtx = makePathContext(nav, flow, state.relations, e.owner);
      moveTowardGoal(pathCtx, e, building.pos, speed, dt);
      continue;
    }

    const goal = goalOf(e);
    if (!goal) {
      e.vel = { x: 0, y: 0 };
      continue;
    }

    const pathCtx = makePathContext(nav, flow, state.relations, e.owner);
    const dx = goal.x - e.pos.x;
    const dy = goal.y - e.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= TILE * 0.4) {
      e.orders.shift();
      e.vel = { x: 0, y: 0 };
      if (e.orders.length === 0 && e.state === 'moving') e.state = 'idle';
      continue;
    }

    const goalTx = Math.floor(goal.x / TILE);
    const goalTy = Math.floor(goal.y / TILE);
    const block = (tx: number, ty: number) => nav.isBlockedFor(e.owner, tx, ty, state.relations);
    const field = flow.getFor(nav, goalTx, goalTy, e.owner, block);
    const steer = steerToGoal(pathCtx, e.pos, goal);

    let moveX = steer.x * speed;
    let moveY = steer.y * speed;

    const neighbors = ctx.services.spatial.queryRadius(e.pos.x, e.pos.y, e.radius * 3, scratch);
    let sepX = 0;
    let sepY = 0;
    for (const nid of neighbors) {
      if (nid === e.id) continue;
      const other = state.entities.get(nid);
      if (!other || other.kind === 'resource_node') continue;
      const sep = separationForPair(e, other);
      sepX += sep.x;
      sepY += sep.y;
    }

    moveX += sepX * speed * SEP_BLEND;
    moveY += sepY * speed * SEP_BLEND;

    if (moveX !== 0 || moveY !== 0) {
      const moved = applyVelocityMove(e, moveX, moveY, pathCtx, dt, field);
      if (moved) e.facing = Math.atan2(moveY, moveX);
      else e.vel = { x: 0, y: 0 };
    } else {
      e.vel = { x: 0, y: 0 };
    }
  }

  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'unit' || !isAlive(e) || e.orders.length > 0 || e.channeling || e.state === 'garrisoned') continue;
    const pathCtx = makePathContext(nav, flow, state.relations, e.owner);
    const neighbors = ctx.services.spatial.queryRadius(e.pos.x, e.pos.y, e.radius * 2.5, scratch);
    let sepX = 0;
    let sepY = 0;
    for (const nid of neighbors) {
      if (nid === e.id) continue;
      const other = state.entities.get(nid);
      if (!other || other.kind !== 'unit') continue;
      const sep = separationForPair(e, other);
      sepX += sep.x;
      sepY += sep.y;
    }
    if (sepX === 0 && sepY === 0) continue;
    const nudge = slidePosition(pathCtx, e.pos.x, e.pos.y, e.pos.x + sepX * 8 * dt, e.pos.y + sepY * 8 * dt);
    if (nudge) {
      e.pos.x = nudge.x;
      e.pos.y = nudge.y;
    }
  }
}
