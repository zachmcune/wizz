// Moves units along flow fields toward their goal, with local separation + collision.
// Makes group movement look coherent (no overlap/jitter). This is a "feel" system.
import { TILE, TICK_HZ } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, Entity, EntityId } from '../types';
import { entitiesSorted, isAlive, hasBuff } from '../queries';
import { steerToGoal, applyVelocityMove, slidePosition, makePathContext } from '../pathing';

const scratch: EntityId[] = [];
const SEP_BLEND = 0.55;

function goalOf(e: Entity): { x: number; y: number } | null {
  const o = e.orders[0];
  if (!o) return null;
  if (o.type === 'move' || o.type === 'attackMove') return { x: o.x, y: o.y };
  return null;
}

export function movementSystem(state: GameState, ctx: StepContext): void {
  const nav = ctx.services.nav;
  const flow = ctx.services.flow;
  const dt = 1 / TICK_HZ;

  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'unit' || !isAlive(e)) continue;
    if (e.morphProgress !== undefined || e.channeling) {
      e.vel = { x: 0, y: 0 };
      continue;
    }
    const udef = ctx.services.registry.unit(e.defId);
    let speed = udef.speed;
    if (hasBuff(e, 'haste', state.tick)) speed *= 1.5;

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
      const ox = e.pos.x - other.pos.x;
      const oy = e.pos.y - other.pos.y;
      const dd = Math.hypot(ox, oy);
      const minDist = e.radius + other.radius;
      if (dd > 0 && dd < minDist) {
        const push = (minDist - dd) / minDist;
        sepX += (ox / dd) * push;
        sepY += (oy / dd) * push;
      }
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
    if (e.kind !== 'unit' || !isAlive(e) || e.orders.length > 0 || e.channeling) continue;
    const pathCtx = makePathContext(nav, flow, state.relations, e.owner);
    const neighbors = ctx.services.spatial.queryRadius(e.pos.x, e.pos.y, e.radius * 2.5, scratch);
    let sepX = 0;
    let sepY = 0;
    for (const nid of neighbors) {
      if (nid === e.id) continue;
      const other = state.entities.get(nid);
      if (!other || other.kind !== 'unit') continue;
      const ox = e.pos.x - other.pos.x;
      const oy = e.pos.y - other.pos.y;
      const dd = Math.hypot(ox, oy);
      const minDist = e.radius + other.radius;
      if (dd > 0 && dd < minDist) {
        const push = (minDist - dd) / minDist;
        sepX += (ox / dd) * push;
        sepY += (oy / dd) * push;
      }
    }
    if (sepX === 0 && sepY === 0) continue;
    const nudge = slidePosition(pathCtx, e.pos.x, e.pos.y, e.pos.x + sepX * 8 * dt, e.pos.y + sepY * 8 * dt);
    if (nudge) {
      e.pos.x = nudge.x;
      e.pos.y = nudge.y;
    }
  }
}
