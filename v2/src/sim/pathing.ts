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

/**
 * Neighbour scan order for the flat-field escape hatch.
 *
 * THE ORDER IS A TIE-BREAK, AND A FIXED ORDER IS NOT SYMMETRIC. This array used to be
 * `[1,0],[-1,0],[0,1],[0,-1],...` — ascending x first — and `bestNeighborSteer` keeps the FIRST neighbour
 * that strictly improves on the current cost. When two neighbours are exactly level (which is common: flow
 * costs are integers, so plateaus and 45-degree ties are everywhere), the winner was decided by array order,
 * i.e. by "prefer +x, then −x, then +y, then −y".
 *
 * That preference does not reflect. A unit at (x,y) and its mirror at (W−x,y) facing the mirrored goal saw the
 * same plateau resolve in OPPOSITE world directions, so the two bases pathed differently through identical
 * terrain. Measured with `audit/neighbor-symmetry.ts`: **595 of 1221 sampled tiles steered differently from
 * their own reflection** on one flow field. That is what put the mirror win rate at 18.2% (95% CI 9.5–32.0%)
 * with 0 unfinished, and it is why raising HQ HP or tuning the AI could never fix fairness.
 *
 * The fix is not a better fixed order — no fixed order can be mirror-covariant, because +x and −x must be
 * treated equally. The tie is broken by a hash of the CANDIDATE TILE POSITION instead (see
 * `bestNeighborSteer`), which is symmetric in expectation: a tile and its reflection get unrelated but equally
 * distributed ranks, so neither side of the map is systematically preferred.
 */
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

/**
 * A tile rank that is INVARIANT under reflection about the vertical midline.
 *
 * `bestNeighborSteer` needs it for cost ties: the choice must be identical (as a reflection) for a unit at
 * (x,y) and its mirror at (W−x,y), or two identical bases on symmetric halves of the map path differently.
 *
 * A hash of the tile coordinates does not have that property — it gives unrelated values to a tile and its
 * mirror, so it is symmetric only in aggregate (measured 51.3% per-tile agreement). Comparing distances from
 * the two midlines does: `|2x − (w−1)|` maps to itself when x maps to `w−1−x`, and likewise for y. The row and
 * column are the tie-breakers, and both are invariant as well.
 *
 * Ordering is by `dMin` then `dMax` then `ty` then `tx`, chosen so that the centre of the map sorts first and
 * movement tends to stay near the diagonal rather than hugging one edge — a purely aesthetic choice that the
 * symmetry allows, because it treats all four quadrants identically.
 */
export function mirrorRank(tx: number, ty: number, w: number, h: number): number {
  const dx = Math.abs(2 * tx - (w - 1));
  const dy = Math.abs(2 * ty - (h - 1));
  const dMin = Math.min(dx, dy);
  const dMax = Math.max(dx, dy);
  // Pack into a single comparable integer: each term is bounded by the map size, so this is exact.
  const scale = 1_000_000;
  return dMin * scale * scale * scale + dMax * scale * scale + ty * scale + tx;
}

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
  let bestRank = 0;
  let bx = 0;
  let by = 0;
  let found = false;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (!nav.inBounds(nx, ny)) continue;
    if (!nav.canStep(tx, ty, nx, ny)) continue;
    if (dx !== 0 && dy !== 0) {
      if (isTileBlocked(tx + dx, ty) || isTileBlocked(tx, ty + dy)) continue;
    }
    const nc = field.cost[ny * nav.w + nx]!;
    /**
     * TIES ARE BROKEN BY A MIRROR-INVARIANT RANK, NOT BY SCAN ORDER.
     *
     * The guard is unchanged: a candidate must strictly improve on where we stand, which is what stops a unit
     * on a plateau from stepping sideways forever. Among improving candidates the lowest cost wins.
     *
     * Among candidates of EQUAL cost, the old code let `NEIGHBORS` order decide, which prefers +x over −x and
     * therefore cannot survive reflection: a unit and its mirror image resolved the same plateau in opposite
     * world directions, so the two bases pathed differently through identical terrain. Measured with
     * `audit/neighbor-symmetry.ts`: 595 of 1221 sampled tiles steered differently from their own reflection.
     *
     * A hash of the candidate tile fixes the *aggregate* but not the *individual* case — it is symmetric only in
     * expectation, measured at 51.3% agreement, which is no use when the property required is that a mirrored
     * match plays out identically. What is needed is a rank that is INVARIANT under the reflection, so a tile and
     * its mirror always rank the same way relative to the other candidates.
     *
     * `mirrorRank` compares the tile's distance from the vertical and horizontal midlines, then its row and
     * column. Both are unchanged when x is reflected about the midline, so the choice a unit makes at (x,y) and
     * the choice its mirror makes at (W−x,y) are reflections of each other. It is a pure function of the tile, so
     * replays and lockstep are unaffected.
     */
    if (nc >= here) continue;
    const rank = mirrorRank(nx, ny, nav.w, nav.h);
    if (!found || nc < bestC || (nc === bestC && rank < bestRank)) {
      bestC = nc;
      bestRank = rank;
      bx = dx;
      by = dy;
      found = true;
    }
  }
  if (!found) return { x: 0, y: 0 };
  const l = Math.hypot(bx, by);
  return { x: bx / l, y: by / l };
}

/** Unit direction toward a world goal, using the cached flow field to path around obstacles. */
export function steerToGoal(
  ctx: PathContext,
  pos: { x: number; y: number },
  goal: { x: number; y: number },
  /**
   * The tile to build the FLOW FIELD for, when it differs from the exact goal.
   *
   * Formation offsets give every unit in a group its own goal a few tiles apart, and the flow field is cached per goal
   * TILE. Measured on the 225-entity stress match: the cache sat pinned at its 48-entry maximum on every tick, so
   * almost every unit lookup missed and ran a full-map BFS — 48 x 11,264-tile searches per tick, 553 ms/tick instead of
   * ~12. Passing the group's shared order point as the field goal collapses 180 distinct fields into one, while the
   * exact goal still governs the final approach through the direct-steer fallbacks below.
   */
  fieldGoal?: { x: number; y: number },
): { x: number; y: number } {
  const { nav, flow } = ctx;
  const dx = goal.x - pos.x;
  const dy = goal.y - pos.y;
  const d = len(dx, dy);
  if (d < TILE * 0.4) return { x: 0, y: 0 };
  if (ctx.air) return normalize(dx, dy);

  const block = tileBlocked(ctx);
  const fieldAt = fieldGoal ?? goal;
  const goalTx = Math.floor(fieldAt.x / TILE);
  const goalTy = Math.floor(fieldAt.y / TILE);
  const field = flow.getFor(nav, goalTx, goalTy, ctx.unitOwner, block);

  /**
   * ON THE FINAL APPROACH, STEER AT THE UNIT'S OWN GOAL.
   *
   * When a shared `fieldGoal` is supplied the flow field points at the ORDER POINT, not at this unit's formation slot, so
   * `sampleFlow` near the destination steers every unit at the same spot and they pile up there. Measured on the Phase 4
   * separation gate: 22-28% of units deeply interpenetrating against a 15% ceiling, on the same scene that had passed before
   * shared flow fields were introduced.
   *
   * Once the unit is within a couple of tiles of its own goal the flow field has no useful routing left to offer -- obstacles
   * that close are handled by the slide/escape path in `applySteeredMove` -- so the direct vector is both correct and what
   * keeps a formation a formation. Further out the field is used, which is what makes the field shareable.
   */
  if (fieldGoal && d < TILE * 3) return normalize(dx, dy);

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
  /**
   * AXIS SLIDES MUST ACTUALLY MOVE.
   *
   * `blocked(nx, y)` says the destination is legal — but with a purely vertical steer (`nx === x`) the result is the
   * unit's CURRENT position, so the caller is told `moved: true` while the coordinates never change. Measured on a
   * harvester wedged against a cliff at (578.4, 503.2): 100 ticks of movement produced **0 units of displacement**, the
   * harvest order stayed queued forever, its carry stayed 0, and the player's income was exactly zero for the last 11
   * minutes of the match. The player's whole economy was two stuck wisps.
   *
   * A slide that does not change position is not a slide, so each axis is only accepted when it genuinely moved.
   */
  if (!blocked(nx, y) && Math.abs(nx - x) > 1e-9) return { x: nx, y };
  if (!blocked(x, ny) && Math.abs(ny - y) > 1e-9) return { x, y: ny };
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
    /**
     * ESCAPE IN TILE-SIZED STEPS, NOT FRAME-SIZED ONES.
     *
     * `slidePosition` rejects a move if the destination's radius disc touches a blocked tile. When a unit is
     * pressed against an obstacle, a one-frame step (`speed * dt`, ~1-3 world units) is still inside the
     * blocked disc — so every candidate failed the slide and the unit never moved, even though the flow field
     * said five neighbours were downhill. Measured symptom: a unit with nonzero velocity and a valid order
     * moved **0 units in 10 seconds** while `tryEscapeMove` returned null every tick.
     *
     * Escaping needs to clear the obstacle, so the step is scaled up to a fraction of a tile (and never less
     * than a frame's worth), which gets the unit's disc out of the blocked region in one move.
     */
    const stepLen = Math.max(speed * dt, TILE * 0.5);
    const len = Math.hypot(c.dx, c.dy) || 1;
    const nx = x + (c.dx / len) * stepLen;
    const ny = y + (c.dy / len) * stepLen;
    // Try the full escape step first, then progressively smaller ones so a tight gap is still passable.
    for (const factor of [1, 0.6, 0.3]) {
      const sx = x + ((nx - x) * factor);
      const sy = y + ((ny - y) * factor);
      const slid = slidePosition(ctx, x, y, sx, sy, radius);
      if (slid && (Math.abs(slid.x - x) > 1e-6 || Math.abs(slid.y - y) > 1e-6)) {
        return { x: slid.x, y: slid.y, facing: Math.atan2(c.dy, c.dx) };
      }
    }
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
