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
