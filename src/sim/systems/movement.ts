// Moves units along flow fields toward their goal, with local separation + collision.
// Makes group movement look coherent (no overlap/jitter). This is a "feel" system.
import { TILE, TICK_HZ } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, Entity, EntityId } from '../types';
import { entitiesSorted, isAlive, hasBuff } from '../queries';
import { sampleFlow } from '../flow-field';
import { normalize, len } from '../math';

const scratch: EntityId[] = [];

function goalOf(e: Entity): { x: number; y: number } | null {
  const o = e.orders[0];
  if (!o) return null;
  if (o.type === 'move' || o.type === 'attackMove') return { x: o.x, y: o.y };
  return null;
}

export function movementSystem(state: GameState, ctx: StepContext): void {
  const nav = ctx.services.nav;
  const dt = 1 / TICK_HZ;

  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'unit' || !isAlive(e)) continue;
    if (e.morphProgress !== undefined) {
      e.vel = { x: 0, y: 0 };
      continue;
    }
    const udef = ctx.services.registry.unit(e.defId);
    let speed = udef.speed;
    if (hasBuff(e, 'haste', state.tick)) speed *= 1.5;

    const goal = goalOf(e);
    let steerX = 0;
    let steerY = 0;

    if (goal) {
      const dx = goal.x - e.pos.x;
      const dy = goal.y - e.pos.y;
      const d = len(dx, dy);
      if (d <= TILE * 0.4) {
        // arrived
        e.orders.shift();
        e.vel = { x: 0, y: 0 };
        if (e.orders.length === 0 && e.state === 'moving') e.state = 'idle';
      } else if (d < TILE * 1.5) {
        // close: steer straight to avoid flow-field snapping near goal
        const n = normalize(dx, dy);
        steerX = n.x;
        steerY = n.y;
      } else {
        const gt = { tx: Math.floor(goal.x / TILE), ty: Math.floor(goal.y / TILE) };
        const field = ctx.services.flow.get(nav, gt.tx, gt.ty);
        const flow = sampleFlow(field, nav, e.pos.x, e.pos.y);
        if (flow.x === 0 && flow.y === 0) {
          const n = normalize(dx, dy);
          steerX = n.x;
          steerY = n.y;
        } else {
          steerX = flow.x;
          steerY = flow.y;
        }
      }
    }

    // Local separation from nearby units (boids-style push).
    const neighbors = ctx.services.spatial.queryRadius(e.pos.x, e.pos.y, e.radius * 3, scratch);
    let sepX = 0;
    let sepY = 0;
    for (const nid of neighbors) {
      if (nid === e.id) continue;
      const other = state.entities.get(nid);
      if (!other || other.kind === 'resource_node') continue;
      const ox = e.pos.x - other.pos.x;
      const oy = e.pos.y - other.pos.y;
      const dd = len(ox, oy);
      const minDist = e.radius + other.radius;
      if (dd > 0 && dd < minDist) {
        const push = (minDist - dd) / minDist;
        sepX += (ox / dd) * push;
        sepY += (oy / dd) * push;
      }
    }

    const moveX = steerX * speed + sepX * speed * 0.9;
    const moveY = steerY * speed + sepY * speed * 0.9;

    if (moveX !== 0 || moveY !== 0) {
      let nx = e.pos.x + moveX * dt;
      let ny = e.pos.y + moveY * dt;
      // collision with blocked terrain/buildings: axis-separated slide
      if (nav.isBlockedWorld(nx, e.pos.y)) nx = e.pos.x;
      if (nav.isBlockedWorld(e.pos.x, ny)) ny = e.pos.y;
      e.pos.x = nx;
      e.pos.y = ny;
      e.vel = { x: moveX, y: moveY };
      if (goal) e.facing = Math.atan2(moveY, moveX);
    } else {
      e.vel = { x: 0, y: 0 };
    }
  }
}
