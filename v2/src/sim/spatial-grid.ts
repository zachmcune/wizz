// Spatial index: a uniform grid for radius queries (target acquisition, splash, separation, auras).
//
// v1 rebuilt a Map-of-arrays every tick and then linearly scanned `entitiesSorted()` for splash,
// chain, aura and targeting. Here the grid is flat typed arrays and is rebuilt with a single pass
// over the entity store's live slots — no per-cell array allocation, no sorting.
//
// Determinism: bucket contents are appended in ascending slot order (which is ascending entity id
// order), and queries iterate buckets in a fixed order, so results are stable across runs.

import { EntityStore, KIND_RESOURCE_NODE, KIND_UNIT } from './entity-store';

const CELL = 48; // world units per bucket — 1.5 tiles, matching v1's tuning

export class SpatialGrid {
  private readonly cols: number;
  private readonly rows: number;
  /** Start index into `items` for each cell, length cells+1 (CSR layout). */
  private readonly cellStart: Int32Array;
  private items: Int32Array;
  private fill: Int32Array;

  constructor(worldW: number, worldH: number) {
    this.cols = Math.max(1, Math.ceil(worldW / CELL));
    this.rows = Math.max(1, Math.ceil(worldH / CELL));
    const cells = this.cols * this.rows;
    this.cellStart = new Int32Array(cells + 1);
    this.items = new Int32Array(256);
    this.fill = new Int32Array(cells);
  }

  private cellOf(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)));
    return cy * this.cols + cx;
  }

  /**
   * Rebuild from the entity store. Projectiles and garrisoned units are excluded: they are never
   * valid targets and excluding them keeps queries smaller.
   */
  rebuild(store: EntityStore): void {
    const cells = this.cols * this.rows;
    this.cellStart.fill(0);
    this.fill.fill(0);

    // Pass 1: count.
    for (let i = 0; i < store.count; i++) {
      if (store.dead[i]) continue;
      if (!this.indexable(store, i)) continue;
      const c = this.cellOf(store.posX[i]!, store.posY[i]!);
      this.cellStart[c + 1] = this.cellStart[c + 1]! + 1;
    }
    // Prefix sum into start offsets.
    for (let c = 0; c < cells; c++) this.cellStart[c + 1]! += this.cellStart[c]!;

    if (this.items.length < store.count) this.items = new Int32Array(Math.max(store.count, this.items.length * 2));

    // Pass 2: place slot indices in ascending order within each cell.
    for (let i = 0; i < store.count; i++) {
      if (store.dead[i]) continue;
      if (!this.indexable(store, i)) continue;
      const c = this.cellOf(store.posX[i]!, store.posY[i]!);
      const at = this.cellStart[c]! + this.fill[c]!;
      this.items[at] = i;
      this.fill[c] = this.fill[c]! + 1;
    }
  }

  private indexable(store: EntityStore, i: number): boolean {
    if (store.kind[i] === 2) return false; // projectile
    if (store.kind[i] === KIND_RESOURCE_NODE) return true;
    if (store.kind[i] === KIND_UNIT && store.state[i] === 8) return false; // garrisoned
    return true;
  }

  /**
   * Append the slot indices within `radius` world units of (x, y) to `out`.
   * This is a broad phase: the caller still checks exact distance, because the grid returns whole
   * cells. `out` is cleared first and returned for chaining.
   */
  queryRadius(x: number, y: number, radius: number, out: number[]): number[] {
    out.length = 0;
    const minCx = Math.min(this.cols - 1, Math.max(0, Math.floor((x - radius) / CELL)));
    const maxCx = Math.min(this.cols - 1, Math.max(0, Math.floor((x + radius) / CELL)));
    const minCy = Math.min(this.rows - 1, Math.max(0, Math.floor((y - radius) / CELL)));
    const maxCy = Math.min(this.rows - 1, Math.max(0, Math.floor((y + radius) / CELL)));
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const c = cy * this.cols + cx;
        const from = this.cellStart[c]!;
        const to = this.cellStart[c + 1]!;
        for (let k = from; k < to; k++) out.push(this.items[k]!);
      }
    }
    return out;
  }
}
