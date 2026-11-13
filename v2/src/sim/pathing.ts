// Shared flow-field steering for units. Used by movement, combat chase and harvest.
//
// The steering rule is a three-tier fallback, in order of preference:
//   1. The flow field's direction at the unit's tile — correct around obstacles.
//   2. The cheapest passable neighbour, when the field is flat at this tile (e.g. the unit is
//      standing on an obstacle that was placed after the field was computed).
//   3. A straight line to the goal, when no field exists or the unit is off-grid.
// Returning a straight-line vector as the last resort is deliberate: standing still forever is a
// worse failure than walking into a wall once and being slid along it.

import { TILE } from '../core/constants';
import type { FlowField, FlowFieldCache, TileBlocked } from './flow-field';
import { sampleFlow } from './flow-field';
import type { NavGrid } from './nav-grid';
import { len, normalize } from '../core/math';
import type { Relation } from './types';

const NEIGHBORS: readonly [number, number][] = [
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
  relations: Record<string, Record<string, Relation>>;
  unitOwner: string;
  air?: boolean;
}

function tileBlocked(ctx: PathContext): TileBlocked {
  if (ctx.air) return (tx, ty) => ctx.nav.isBlockedForAir(tx, ty);
  return (tx, ty) => ctx.nav.isBlockedFor(ctx.unitOwner, tx, ty, ctx.relations);
}

/** Pick the passable neighbour with the lowest integration cost (escape hatch when flow is flat). */
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
    if (!nav.canStep(tx, ty, nx, ny)) continue;
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

/** Unit direction toward a world goal, using the cached flow field to path around obstacles. */
export function steerToGoal(
  ctx: PathContext,
  pos: { x: number; y: number },
  goal: { x: number; y: number },
): { x: number; y: number } {
  const { nav, flow } = ctx;
  const dx = goal.x - pos.x;
  const dy = goal.y - pos.y;
  const d = len(dx, dy);
  if (d < TILE * 0.4) return { x: 0, y: 0 };
  if (ctx.air) return normalize(dx, dy);

  const block = tileBlocked(ctx);
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

/** Slide along an axis when the full move is blocked, instead of stopping dead. */
export function slidePosition(
  ctx: PathContext,
  x: number,
  y: number,
  nx: number,
  ny: number,
  radius = 0,
): { x: number; y: number } | null {
  const { nav, relations, unitOwner } = ctx;
  const blocked = ctx.air
    ? (px: number, py: number) =>
        radius > 0 ? nav.isBlockedDiscForAir(px, py, radius) : nav.isBlockedWorldForAir(px, py)
    : radius > 0
      ? (px: number, py: number) => nav.isBlockedDiscFor(px, py, radius, unitOwner, relations, x, y)
      : (px: number, py: number) => {
          if (
            !nav.canStep(
              Math.floor(x / TILE),
              Math.floor(y / TILE),
              Math.floor(px / TILE),
              Math.floor(py / TILE),
            )
          ) {
            return true;
          }
          return nav.isBlockedWorldFor(unitOwner, px, py, relations);
        };

  if (!blocked(nx, ny)) return { x: nx, y: ny };
  if (!blocked(nx, y)) return { x: nx, y };
  if (!blocked(x, ny)) return { x, y: ny };
  return null;
}

/** Try to step toward the cheapest neighbour; used when a unit is wedged. */
function tryEscapeMove(
  x: number,
  y: number,
  ctx: PathContext,
  field: FlowField,
  speed: number,
  dt: number,
  radius: number,
): { x: number; y: number; facing: number } | null {
  const { nav } = ctx;
  const block = tileBlocked(ctx);
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (!nav.inBounds(tx, ty)) return null;
  const here = field.cost[ty * nav.w + tx]!;
  if (here === UNREACHABLE) return null;

  const candidates: { dx: number; dy: number; cost: number }[] = [];
  for (const [dx, dy] of NEIGHBORS) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (!nav.inBounds(nx, ny)) continue;
    if (!ctx.air && !nav.canStep(tx, ty, nx, ny)) continue;
    if (dx !== 0 && dy !== 0) {
      if (block(tx + dx, ty) || block(tx, ty + dy)) continue;
    }
    const nc = field.cost[ny * nav.w + nx]!;
    if (nc < here) candidates.push({ dx, dy, cost: nc });
  }
  candidates.sort((a, b) => a.cost - b.cost || a.dy - b.dy || a.dx - b.dx);

  for (const c of candidates) {
    const nx = x + c.dx * speed * dt;
    const ny = y + c.dy * speed * dt;
    const slid = slidePosition(ctx, x, y, nx, ny, radius);
    if (!slid) continue;
    return { x: slid.x, y: slid.y, facing: Math.atan2(c.dy, c.dx) };
  }
  return null;
}

/** Result of a movement attempt, so callers can update position/velocity without a mutable entity. */
export interface MoveResult {
  moved: boolean;
  x: number;
  y: number;
  facing: number;
}

/**
 * Apply a steered move with collision slide and a flow-field escape when stuck.
 * Takes and returns plain coordinates so it works on the typed-array store without allocating an
 * entity view per unit per tick.
 */
export function applySteeredMove(
  x: number,
  y: number,
  steer: { x: number; y: number },
  speed: number,
  ctx: PathContext,
  dt: number,
  field?: FlowField,
  radius = 0,
): MoveResult {
  if (steer.x === 0 && steer.y === 0) return { moved: false, x, y, facing: 0 };

  const moveX = steer.x * speed;
  const moveY = steer.y * speed;
  const nx = x + moveX * dt;
  const ny = y + moveY * dt;

  const slid = slidePosition(ctx, x, y, nx, ny, radius);
  if (slid) {
    return { moved: true, x: slid.x, y: slid.y, facing: Math.atan2(moveY, moveX) };
  }

  if (field) {
    const escaped = tryEscapeMove(x, y, ctx, field, speed, dt, radius);
    if (escaped) return { moved: true, x: escaped.x, y: escaped.y, facing: escaped.facing };
  }

  if (!ctx.air) {
    const nudgeR = radius > 0 ? radius : 4;
    const nudge = ctx.nav.nearestPassableFor(x, y, nudgeR, TILE * 2, ctx.unitOwner, ctx.relations);
    if (nudge) return { moved: true, x: nudge.x, y: nudge.y, facing: 0 };
  }

  return { moved: false, x, y, facing: 0 };
}

/** Apply a velocity vector with collision slide and escape when stuck. */
export function applyVelocityMove(
  x: number,
  y: number,
  vx: number,
  vy: number,
  ctx: PathContext,
  dt: number,
  field?: FlowField,
  radius = 0,
): MoveResult {
  const mag = Math.hypot(vx, vy);
  if (mag < 0.001) return { moved: false, x, y, facing: 0 };
  return applySteeredMove(x, y, { x: vx / mag, y: vy / mag }, mag, ctx, dt, field, radius);
}

/** Move toward a world goal using flow-field pathing. Returns the remaining distance. */
export function moveTowardGoal(
  x: number,
  y: number,
  ctx: PathContext,
  goal: { x: number; y: number },
  speed: number,
  dt: number,
  radius = 0,
): { d: number; result: MoveResult } {
  const dx = goal.x - x;
  const dy = goal.y - y;
  const d = len(dx, dy);
  if (d < 1) return { d, result: { moved: false, x, y, facing: 0 } };

  if (ctx.air) {
    return { d, result: applySteeredMove(x, y, normalize(dx, dy), speed, ctx, dt, undefined, radius) };
  }

  const block = tileBlocked(ctx);
  const goalTx = Math.floor(goal.x / TILE);
  const goalTy = Math.floor(goal.y / TILE);
  const field = ctx.flow.getFor(ctx.nav, goalTx, goalTy, ctx.unitOwner, block);
  const steer = steerToGoal(ctx, { x, y }, goal);
  return { d, result: applySteeredMove(x, y, steer, speed, ctx, dt, field, radius) };
}

export function makePathContext(
  nav: NavGrid,
  flow: FlowFieldCache,
  relations: Record<string, Record<string, Relation>>,
  unitOwner: string,
  air = false,
): PathContext {
  return { nav, flow, relations, unitOwner, air };
}
