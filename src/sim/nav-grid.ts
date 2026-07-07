// Tile passability grid. Derived from map terrain + building footprints.
// Used by pathfinding (flow fields) and building placement validation.
import { TILE } from '../core/constants';
import type { MapData } from '../data/defs';

export class NavGrid {
  readonly w: number;
  readonly h: number;
  private terrain: Uint8Array; // 1 = blocked terrain
  private blocked: Uint8Array; // terrain OR building

  constructor(map: MapData) {
    this.w = map.tileW;
    this.h = map.tileH;
    this.terrain = new Uint8Array(this.w * this.h);
    this.blocked = new Uint8Array(this.w * this.h);
    for (let i = 0; i < this.terrain.length; i++) {
      const t = map.tiles[i] === 1 ? 1 : 0;
      this.terrain[i] = t;
      this.blocked[i] = t;
    }
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  isBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    return this.blocked[this.idx(tx, ty)] === 1;
  }

  isBlockedWorld(x: number, y: number): boolean {
    return this.isBlocked(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** True when a disc at world position overlaps any blocked tile (unit footprint). */
  isBlockedDisc(x: number, y: number, radius: number): boolean {
    if (radius <= 0) return this.isBlockedWorld(x, y);
    const minTx = Math.floor((x - radius) / TILE);
    const maxTx = Math.floor((x + radius) / TILE);
    const minTy = Math.floor((y - radius) / TILE);
    const maxTy = Math.floor((y + radius) / TILE);
    const r2 = radius * radius;
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!this.inBounds(tx, ty)) return true;
        if (!this.isBlocked(tx, ty)) continue;
        const closestX = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE));
        const closestY = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
        const dx = x - closestX;
        const dy = y - closestY;
        if (dx * dx + dy * dy < r2) return true;
      }
    }
    return false;
  }

  /** Nearest passable world position within maxDist (for unstuck nudges). */
  nearestPassable(x: number, y: number, radius: number, maxDist: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const step = Math.max(4, Math.floor(TILE / 4));
    const range = Math.ceil(maxDist / step);
    for (let oy = -range; oy <= range; oy++) {
      for (let ox = -range; ox <= range; ox++) {
        const px = x + ox * step;
        const py = y + oy * step;
        if (this.isBlockedDisc(px, py, radius)) continue;
        const d = ox * ox + oy * oy;
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py };
        }
      }
    }
    return best;
  }

  /** Rebuild the building-occupancy layer. Called when buildings change. */
  setBuildingBlock(tx: number, ty: number, footprint: number, blocked: boolean): void {
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        // never override impassable terrain back to passable
        this.blocked[i] = blocked ? 1 : this.terrain[i]!;
      }
    }
  }

  canPlace(tx: number, ty: number, footprint: number): boolean {
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        if (this.isBlocked(tx + dx, ty + dy)) return false;
      }
    }
    return true;
  }
}
