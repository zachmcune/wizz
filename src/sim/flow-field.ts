// Flow-field pathfinding: one integration field per goal tile, shared by a whole group.
// Deterministic (pure function of grid + goal). Cached in runtime services, not serialized.
import { TILE } from '../core/constants';
import type { NavGrid } from './nav-grid';

const UNREACHABLE = 0xffff;

export interface FlowField {
  goalTx: number;
  goalTy: number;
  cost: Uint16Array; // integration field
  dirX: Int8Array; // per-tile flow direction (-1,0,1)
  dirY: Int8Array;
}

export type TileBlocked = (tx: number, ty: number) => boolean;

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
    if (best >= 0) {
      goalTx = best % nav.w;
      goalTy = Math.floor(best / nav.w);
    }
  }

  const goalIdx = goalTy * nav.w + goalTx;
  cost[goalIdx] = 0;
  let frontier: number[] = [goalIdx];
  while (frontier.length) {
    const next: number[] = [];
    for (const cur of frontier) {
      const cx = cur % nav.w;
      const cy = Math.floor(cur / nav.w);
      const cc = cost[cur]!;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (isTileBlocked(nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (isTileBlocked(cx + dx, cy) || isTileBlocked(cx, cy + dy)) continue;
        }
        const step = dx !== 0 && dy !== 0 ? 14 : 10;
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

/** Sample the flow direction at a world position. Returns a unit-ish vector. */
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

export class FlowFieldCache {
  private cache = new Map<string, FlowField>();
  private version = 0;
  private cachedVersion = 0;

  invalidate(): void {
    this.version++;
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
    let f = this.cache.get(key);
    if (!f) {
      f = computeFlowField(nav, goalTx, goalTy, isTileBlocked);
      this.cache.set(key, f);
    }
    return f;
  }
}
