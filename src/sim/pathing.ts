// Shared flow-field steering for units. Used by movement, combat chase, and harvest.
import { TILE } from '../core/constants';
import type { NavGrid } from './nav-grid';
import type { FlowField, FlowFieldCache, TileBlocked } from './flow-field';
import { sampleFlow } from './flow-field';
import { len, normalize } from './math';
import type { Entity, PlayerId, Relation } from './types';

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

export interface PathContext {
  nav: NavGrid;
  flow: FlowFieldCache;
  relations: Record<PlayerId, Record<PlayerId, Relation>>;
  unitOwner: PlayerId;
}

function tileBlocked(ctx: PathContext): TileBlocked {
  return (tx, ty) => ctx.nav.isBlockedFor(ctx.unitOwner, tx, ty, ctx.relations);
}

/** Pick the passable neighbor with the lowest integration cost (escape hatch when flow is flat). */
export function bestNeighborSteer(
  field: FlowField,
  nav: NavGrid,
  tx: number,
  ty: number,
  isTileBlocked: TileBlocked,
): { x: number; y: number } {
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
      if (isTileBlocked(tx + dx, ty) || isTileBlocked(tx, ty + dy)) continue;
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
  ctx: PathContext,
  pos: { x: number; y: number },
  goal: { x: number; y: number },
): { x: number; y: number } {
  const { nav, flow } = ctx;
  const block = tileBlocked(ctx);
  const dx = goal.x - pos.x;
  const dy = goal.y - pos.y;
  const d = len(dx, dy);
  if (d < TILE * 0.4) return { x: 0, y: 0 };

  const goalTx = Math.floor(goal.x / TILE);
  const goalTy = Math.floor(goal.y / TILE);
  const field = flow.getFor(nav, goalTx, goalTy, ctx.unitOwner, block);

  let steer = sampleFlow(field, nav, pos.x, pos.y);
  if (steer.x !== 0 || steer.y !== 0) return steer;

  const tx = Math.floor(pos.x / TILE);
  const ty = Math.floor(pos.y / TILE);
  const idx = ty * nav.w + tx;
  if (field.cost[idx] === 0) return normalize(dx, dy);

  steer = bestNeighborSteer(field, nav, tx, ty, block);
  if (steer.x !== 0 || steer.y !== 0) return steer;

  return normalize(dx, dy);
}

/** Slide along axes when the full move hits a blocked tile. */
export function slidePosition(
  ctx: PathContext,
  x: number,
  y: number,
  nx: number,
  ny: number,
  radius = 0,
): { x: number; y: number } | null {
  const { nav, relations, unitOwner } = ctx;
  const blocked =
    radius > 0
      ? (px: number, py: number) => nav.isBlockedDiscFor(px, py, radius, unitOwner, relations)
      : (px: number, py: number) => nav.isBlockedWorldFor(unitOwner, px, py, relations);

  if (!blocked(nx, ny)) return { x: nx, y: ny };
  if (!blocked(nx, y)) return { x: nx, y };
  if (!blocked(x, ny)) return { x, y: ny };
  return null;
}

function tryEscapeMove(
  e: Entity,
  ctx: PathContext,
  field: FlowField,
  speed: number,
  dt: number,
  radius: number,
): boolean {
  const { nav } = ctx;
  const block = tileBlocked(ctx);
  const tx = Math.floor(e.pos.x / TILE);
  const ty = Math.floor(e.pos.y / TILE);
  const here = field.cost[ty * nav.w + tx]!;
  if (here === UNREACHABLE) return false;

  const candidates: { dx: number; dy: number; cost: number }[] = [];
  for (const [dx, dy] of NEIGHBORS) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (!nav.inBounds(nx, ny)) continue;
    if (dx !== 0 && dy !== 0) {
      if (block(tx + dx, ty) || block(tx, ty + dy)) continue;
    }
    const nc = field.cost[ny * nav.w + nx]!;
    if (nc < here) candidates.push({ dx, dy, cost: nc });
  }
  candidates.sort((a, b) => a.cost - b.cost);

  for (const c of candidates) {
    const nx = e.pos.x + c.dx * speed * dt;
    const ny = e.pos.y + c.dy * speed * dt;
    const slid = slidePosition(ctx, e.pos.x, e.pos.y, nx, ny, radius);
    if (!slid) continue;
    e.pos.x = slid.x;
    e.pos.y = slid.y;
    e.vel = { x: c.dx * speed, y: c.dy * speed };
    e.facing = Math.atan2(c.dy, c.dx);
    return true;
  }
  return false;
}

function tryUnstuckNudge(e: Entity, ctx: PathContext, radius: number): boolean {
  const nudgeR = radius > 0 ? radius : 4;
  const nudge = ctx.nav.nearestPassableFor(e.pos.x, e.pos.y, nudgeR, TILE * 2, ctx.unitOwner, ctx.relations);
  if (!nudge) return false;
  e.pos.x = nudge.x;
  e.pos.y = nudge.y;
  return true;
}

/** Apply steered movement with collision slide and flow-field escape when stuck. */
export function applySteeredMove(
  e: Entity,
  steer: { x: number; y: number },
  speed: number,
  ctx: PathContext,
  dt: number,
  field?: FlowField,
  radius = 0,
): boolean {
  if (steer.x === 0 && steer.y === 0) return false;

  const moveX = steer.x * speed;
  const moveY = steer.y * speed;
  const nx = e.pos.x + moveX * dt;
  const ny = e.pos.y + moveY * dt;

  const slid = slidePosition(ctx, e.pos.x, e.pos.y, nx, ny, radius);
  if (slid) {
    e.pos.x = slid.x;
    e.pos.y = slid.y;
    e.vel = { x: moveX, y: moveY };
    e.facing = Math.atan2(moveY, moveX);
    return true;
  }

  if (field && tryEscapeMove(e, ctx, field, speed, dt, radius)) return true;
  if (tryUnstuckNudge(e, ctx, radius)) return true;

  return false;
}

/** Apply a velocity vector with collision slide and escape when stuck. */
export function applyVelocityMove(
  e: Entity,
  vx: number,
  vy: number,
  ctx: PathContext,
  dt: number,
  field?: FlowField,
  radius = 0,
): boolean {
  const mag = Math.hypot(vx, vy);
  if (mag < 0.001) return false;
  return applySteeredMove(e, { x: vx / mag, y: vy / mag }, mag, ctx, dt, field, radius);
}

/** Move a unit toward a world goal using flow-field pathing. */
export function moveTowardGoal(
  ctx: PathContext,
  e: Entity,
  goal: { x: number; y: number },
  speed: number,
  dt: number,
): number {
  const { nav, flow } = ctx;
  const block = tileBlocked(ctx);
  const dx = goal.x - e.pos.x;
  const dy = goal.y - e.pos.y;
  const d = len(dx, dy);
  if (d < 1) return d;

  const goalTx = Math.floor(goal.x / TILE);
  const goalTy = Math.floor(goal.y / TILE);
  const field = flow.getFor(nav, goalTx, goalTy, ctx.unitOwner, block);
  const steer = steerToGoal(ctx, e.pos, goal);
  applySteeredMove(e, steer, speed, ctx, dt, field);
  return d;
}

export function makePathContext(
  nav: NavGrid,
  flow: FlowFieldCache,
  relations: Record<PlayerId, Record<PlayerId, Relation>>,
  unitOwner: PlayerId,
): PathContext {
  return { nav, flow, relations, unitOwner };
}
