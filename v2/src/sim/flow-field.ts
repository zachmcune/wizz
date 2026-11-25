// Flow-field pathfinding: one integration field per goal tile, shared by a whole group.
//
// Why flow fields rather than per-unit A*: an RTS moves many units to the same few goals, and a
// field costs the same whether one unit or ninety follow it. v1 used this and it works well; the
// rebuild keeps the approach but removes the per-call allocation and bounds the cache.
//
// Determinism: the field is a pure function of (grid, goal, passability). The frontier order is
// fixed by ascending tile index, and the 8-neighbour list is a module constant, so the same inputs
// always produce byte-identical fields regardless of insertion history.

import { TILE } from '../core/constants';
import type { NavGrid } from './nav-grid';

/** Sentinel for "unreachable". Larger than any real path cost on our map sizes. */
const UNREACHABLE = 0xffff;

/** Diagonal step cost 14, orthogonal 10 — the standard integer approximation of 1 and √2. */
const DIAG = 14;
const ORTHO = 10;

export interface FlowField {
  goalTx: number;
  goalTy: number;
  /** Integration (cost-to-goal) per tile. */
  cost: Uint16Array;
  /** Per-tile flow direction, components in {-1,0,1}. */
  dirX: Int8Array;
  dirY: Int8Array;
}

export type TileBlocked = (tx: number, ty: number) => boolean;

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

export function computeFlowField(
  nav: NavGrid,
  goalTx: number,
  goalTy: number,
  isTileBlocked: TileBlocked,
): FlowField {
  const size = nav.w * nav.h;
  const cost = new Uint16Array(size).fill(UNREACHABLE);
  const dirX = new Int8Array(size);
  const dirY = new Int8Array(size);

  // If the goal itself is blocked, walk to the nearest open tile instead of failing outright:
  // a unit ordered onto a wall should still approach it rather than stand still.
  if (isTileBlocked(goalTx, goalTy)) {
    let best = -1;
    let bestD = Infinity;
    for (let ty = 0; ty < nav.h; ty++) {
      for (let tx = 0; tx < nav.w; tx++) {
        if (isTileBlocked(tx, ty)) continue;
        const d = (tx - goalTx) * (tx - goalTx) + (ty - goalTy) * (ty - goalTy);
        if (d < bestD) {
          bestD = d;
          best = ty * nav.w + tx;
        }
      }
    }
    if (best < 0) {
      // Nothing passable at all; return an empty field rather than throwing.
      return { goalTx, goalTy, cost, dirX, dirY };
    }
    goalTx = best % nav.w;
    goalTy = Math.floor(best / nav.w);
  }

  const goalIdx = goalTy * nav.w + goalTx;
  cost[goalIdx] = 0;
  let frontier: number[] = [goalIdx];

  // Dial-style bucket queue would be faster, but the expansion is bounded by tile count and this
  // keeps the code obvious. Measured in tests/benchmarks; revisit in Phase 7 if it shows up.
  while (frontier.length) {
    const next: number[] = [];
    for (const cur of frontier) {
      const cx = cur % nav.w;
      const cy = (cur - cx) / nav.w;
      const cc = cost[cur]!;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (isTileBlocked(nx, ny)) continue;
        if (!nav.canStep(cx, cy, nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          // No corner cutting through blocked or unsteppable orthogonals.
          if (isTileBlocked(cx + dx, cy) || isTileBlocked(cx, cy + dy)) continue;
          if (!nav.canStep(cx, cy, cx + dx, cy) || !nav.canStep(cx, cy, cx, cy + dy)) continue;
        }
        const step = dx !== 0 && dy !== 0 ? DIAG : ORTHO;
        const ni = ny * nav.w + nx;
        const nc = cc + step;
        if (nc < cost[ni]!) {
          cost[ni] = nc;
          next.push(ni);
        }
      }
    }
    frontier = next;
  }

  // Second pass: each tile points at its cheapest neighbour.
  for (let ty = 0; ty < nav.h; ty++) {
    for (let tx = 0; tx < nav.w; tx++) {
      const i = ty * nav.w + tx;
      if (cost[i] === UNREACHABLE) continue;
      let bestC = cost[i]!;
      let bx = 0;
      let by = 0;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (!nav.inBounds(nx, ny)) continue;
        if (isTileBlocked(nx, ny)) continue;
        if (!nav.canStep(tx, ty, nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (isTileBlocked(tx + dx, ty) || isTileBlocked(tx, ty + dy)) continue;
          if (!nav.canStep(tx, ty, tx + dx, ty) || !nav.canStep(tx, ty, tx, ty + dy)) continue;
        }
        const nc = cost[ny * nav.w + nx]!;
        if (nc < bestC) {
          bestC = nc;
          bx = dx;
          by = dy;
        }
      }
      dirX[i] = bx;
      dirY[i] = by;
    }
  }

  return { goalTx, goalTy, cost, dirX, dirY };
}

/** Sample the flow direction at a world position. Returns a unit vector, or (0,0) at the goal. */
export function sampleFlow(field: FlowField, nav: NavGrid, x: number, y: number): { x: number; y: number } {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (!nav.inBounds(tx, ty)) return { x: 0, y: 0 };
  const i = ty * nav.w + tx;
  const dx = field.dirX[i]!;
  const dy = field.dirY[i]!;
  if (dx === 0 && dy === 0) return { x: 0, y: 0 };
  const l = Math.sqrt(dx * dx + dy * dy);
  return { x: dx / l, y: dy / l };
}

/**
 * Bounded LRU cache of flow fields, keyed by (owner-passability-class, goal tile).
 *
 * The bound matters: an unbounded cache grew without limit in v1 as units were ordered to new
 * tiles, and each field is `4 + 1 + 1` bytes per tile — on a 160×112 map that is 107 kB per field.
 * Evicting the least recently used keeps memory flat during a long match.
 */
export class FlowFieldCache {
  private readonly cache = new Map<string, FlowField>();
  private version = 0;
  private cachedVersion = 0;
  private readonly maxEntries: number;

  constructor(maxEntries = 48) {
    this.maxEntries = maxEntries;
  }

  /** Call whenever passability changes (a building is placed, sold, or destroyed). */
  invalidate(): void {
    this.version++;
  }

  get size(): number {
    return this.cache.size;
  }

  getFor(
    nav: NavGrid,
    goalTx: number,
    goalTy: number,
    cacheKey: string,
    isTileBlocked: TileBlocked,
  ): FlowField {
    if (this.cachedVersion !== this.version) {
      this.cache.clear();
      this.cachedVersion = this.version;
    }
    const key = `${cacheKey}:${goalTx},${goalTy}`;
    const existing = this.cache.get(key);
    if (existing) {
      // Refresh recency: delete + set moves it to the end of the Map's insertion order.
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing;
    }
    const field = computeFlowField(nav, goalTx, goalTy, isTileBlocked);
    this.cache.set(key, field);
    if (this.cache.size > this.maxEntries) {
      // Map iteration is insertion-ordered, so the first key is the least recently used.
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    return field;
  }
}
