// Tile passability grid. Derived from map terrain + building footprints.
// Used by pathfinding (flow fields) and building placement validation.
import { TILE } from '../core/constants';
import type { MapData } from '../data/defs';
import type { PlayerId, Relation } from './types';

export class NavGrid {
  readonly w: number;
  readonly h: number;
  private terrain: Uint8Array; // 1 = blocked terrain
  private blocked: Uint8Array; // terrain OR solid building (not gates)
  private gateOwners = new Map<number, PlayerId>(); // tile index -> gate owner

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

  /** Terrain or solid building — gates are passable here (use isBlockedFor for units). */
  isBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    return this.blocked[this.idx(tx, ty)] === 1;
  }

  /** Per-unit blocking: gates block enemies but let owner + allies through. */
  isBlockedFor(
    unitOwner: PlayerId,
    tx: number,
    ty: number,
    relations: Record<PlayerId, Record<PlayerId, Relation>>,
  ): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const i = this.idx(tx, ty);
    if (this.terrain[i] === 1) return true;
    const gateOwner = this.gateOwners.get(i);
    if (gateOwner !== undefined) {
      if (unitOwner === gateOwner) return false;
      const rel = relations[unitOwner]?.[gateOwner];
      if (rel === 'ally') return false;
      return true;
    }
    return this.blocked[i] === 1;
  }

  isBlockedWorld(x: number, y: number): boolean {
    return this.isBlocked(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  isBlockedWorldFor(
    unitOwner: PlayerId,
    x: number,
    y: number,
    relations: Record<PlayerId, Record<PlayerId, Relation>>,
  ): boolean {
    return this.isBlockedFor(unitOwner, Math.floor(x / TILE), Math.floor(y / TILE), relations);
  }

  /** True when a disc at world position overlaps any blocked tile (unit footprint). */
  isBlockedDisc(x: number, y: number, radius: number): boolean {
    return this.isBlockedDiscFor(x, y, radius, null, null);
  }

  isBlockedDiscFor(
    x: number,
    y: number,
    radius: number,
    unitOwner: PlayerId | null,
    relations: Record<PlayerId, Record<PlayerId, Relation>> | null,
  ): boolean {
    if (radius <= 0) {
      return unitOwner && relations
        ? this.isBlockedWorldFor(unitOwner, x, y, relations)
        : this.isBlockedWorld(x, y);
    }
    const minTx = Math.floor((x - radius) / TILE);
    const maxTx = Math.floor((x + radius) / TILE);
    const minTy = Math.floor((y - radius) / TILE);
    const maxTy = Math.floor((y + radius) / TILE);
    const r2 = radius * radius;
    const tileBlocked = unitOwner && relations
      ? (tx: number, ty: number) => this.isBlockedFor(unitOwner, tx, ty, relations)
      : (tx: number, ty: number) => this.isBlocked(tx, ty);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!this.inBounds(tx, ty)) return true;
        if (!tileBlocked(tx, ty)) continue;
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
    return this.nearestPassableFor(x, y, radius, maxDist, null, null);
  }

  nearestPassableFor(
    x: number,
    y: number,
    radius: number,
    maxDist: number,
    unitOwner: PlayerId | null,
    relations: Record<PlayerId, Record<PlayerId, Relation>> | null,
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const step = Math.max(4, Math.floor(TILE / 4));
    const range = Math.ceil(maxDist / step);
    for (let oy = -range; oy <= range; oy++) {
      for (let ox = -range; ox <= range; ox++) {
        const px = x + ox * step;
        const py = y + oy * step;
        const blocked = unitOwner && relations
          ? this.isBlockedDiscFor(px, py, radius, unitOwner, relations)
          : this.isBlockedDisc(px, py, radius);
        if (blocked) continue;
        const d = ox * ox + oy * oy;
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py };
        }
      }
    }
    return best;
  }

  /** Register gate tiles — allies of owner can pass; enemies are blocked. */
  setGate(tx: number, ty: number, footprint: number, owner: PlayerId | null): void {
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        if (owner === null) this.gateOwners.delete(i);
        else this.gateOwners.set(i, owner);
      }
    }
  }

  /** Rebuild the solid-building occupancy layer. Gates use setGate instead. */
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

  /** True when terrain, a wall, or a gate occupies the tile (for placement). */
  isOccupied(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const i = this.idx(tx, ty);
    if (this.terrain[i] === 1) return true;
    if (this.gateOwners.has(i)) return true;
    return this.blocked[i] === 1;
  }

  canPlace(tx: number, ty: number, footprint: number): boolean {
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        if (this.isOccupied(tx + dx, ty + dy)) return false;
      }
    }
    return true;
  }
}
