// Shared flow-field steering for units. Used by movement, combat chase, and harvest.
import { TILE } from '../core/constants';
import type { NavGrid } from './nav-grid';
import type { FlowField, FlowFieldCache } from './flow-field';
import { sampleFlow } from './flow-field';
import { len, normalize } from './math';
import type { Entity } from './types';

const NEIGHBORS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const UNREACHABLE = 0xffff;

/** Pick the passable neighbor with the lowest integration cost (escape hatch when flow is flat). */
export function bestNeighborSteer(field: FlowField, nav: NavGrid, tx: number, ty: number): { x: number; y: number } {
  const i = ty * nav.w + tx;
  const here = field.cost[i]!;
  if (here === UNREACHABLE) return { x: 0, y: 0 };

  let bestC = here;
  let bx = 0;
  let by = 0;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (!nav.inBounds(nx, ny)) continue;
    if (dx !== 0 && dy !== 0) {
      if (nav.isBlocked(tx + dx, ty) || nav.isBlocked(tx, ty + dy)) continue;
    }
    const nc = field.cost[ny * nav.w + nx]!;
    if (nc < bestC) {
      bestC = nc;
      bx = dx;
      by = dy;
    }
  }
  if (bx === 0 && by === 0) return { x: 0, y: 0 };
  const l = Math.hypot(bx, by);
  return { x: bx / l, y: by / l };
}

/** Unit direction toward a world goal using the cached flow field (paths around obstacles). */
export function steerToGoal(
  nav: NavGrid,
  flowCache: FlowFieldCache,
  pos: { x: number; y: number },
  goal: { x: number; y: number },
): { x: number; y: number } {
  const dx = goal.x - pos.x;
  const dy = goal.y - pos.y;
  const d = len(dx, dy);
  if (d < TILE * 0.4) return { x: 0, y: 0 };

  const goalTx = Math.floor(goal.x / TILE);
  const goalTy = Math.floor(goal.y / TILE);
  const field = flowCache.get(nav, goalTx, goalTy);

  let steer = sampleFlow(field, nav, pos.x, pos.y);
  if (steer.x !== 0 || steer.y !== 0) return steer;

  const tx = Math.floor(pos.x / TILE);
  const ty = Math.floor(pos.y / TILE);
  const idx = ty * nav.w + tx;
  if (field.cost[idx] === 0) return normalize(dx, dy);

  steer = bestNeighborSteer(field, nav, tx, ty);
  if (steer.x !== 0 || steer.y !== 0) return steer;

  return normalize(dx, dy);
}

/** Apply steered movement with axis-separated collision slide against blocked tiles. */
export function applySteeredMove(
  e: Entity,
  steer: { x: number; y: number },
  speed: number,
  nav: NavGrid,
  dt: number,
  field?: FlowField,
): boolean {
  if (steer.x === 0 && steer.y === 0) return false;

  let moveX = steer.x * speed;
  let moveY = steer.y * speed;
  let nx = e.pos.x + moveX * dt;
  let ny = e.pos.y + moveY * dt;

  if (nav.isBlockedWorld(nx, e.pos.y)) nx = e.pos.x;
  if (nav.isBlockedWorld(e.pos.x, ny)) ny = e.pos.y;

  if (nx === e.pos.x && ny === e.pos.y && field) {
    const tx = Math.floor(e.pos.x / TILE);
    const ty = Math.floor(e.pos.y / TILE);
    const escape = bestNeighborSteer(field, nav, tx, ty);
    if (escape.x !== 0 || escape.y !== 0) {
      moveX = escape.x * speed;
      moveY = escape.y * speed;
      nx = e.pos.x + moveX * dt;
      ny = e.pos.y + moveY * dt;
      if (nav.isBlockedWorld(nx, e.pos.y)) nx = e.pos.x;
      if (nav.isBlockedWorld(e.pos.x, ny)) ny = e.pos.y;
    }
  }

  if (nx === e.pos.x && ny === e.pos.y) return false;

  e.pos.x = nx;
  e.pos.y = ny;
  e.vel = { x: moveX, y: moveY };
  e.facing = Math.atan2(moveY, moveX);
  return true;
}

/** Move a unit toward a world goal using flow-field pathing. */
export function moveTowardGoal(
  nav: NavGrid,
  flowCache: FlowFieldCache,
  e: Entity,
  goal: { x: number; y: number },
  speed: number,
  dt: number,
): number {
  const dx = goal.x - e.pos.x;
  const dy = goal.y - e.pos.y;
  const d = len(dx, dy);
  if (d < 1) return d;

  const goalTx = Math.floor(goal.x / TILE);
  const goalTy = Math.floor(goal.y / TILE);
  const field = flowCache.get(nav, goalTx, goalTy);
  const steer = steerToGoal(nav, flowCache, e.pos, goal);
  applySteeredMove(e, steer, speed, nav, dt, field);
  return d;
}
