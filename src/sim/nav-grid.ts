// Tile passability grid. Derived from map terrain + building footprints.
// Used by pathfinding (flow fields) and building placement validation.
import { BUILD_SPACING_TILES, TILE, TILE_BLOCKED, TILE_RAMP } from '../core/constants';
import { surfaceHeightAt } from '../core/ramp-slope';
import type { MapData } from '../data/defs';
import type { PlayerId, Relation } from './types';

export class NavGrid {
  readonly w: number;
  readonly h: number;
  private terrain: Uint8Array; // 1 = blocked terrain
  private blocked: Uint8Array; // terrain OR solid building (not gates)
  private heights: Uint8Array; // discrete elevation per tile
  private ramps: Uint8Array; // 1 = ramp tile (allows ±1 height steps)
  private gateOwners = new Map<number, PlayerId>(); // tile index -> gate owner

  constructor(map: MapData) {
    this.w = map.tileW;
    this.h = map.tileH;
    this.terrain = new Uint8Array(this.w * this.h);
    this.blocked = new Uint8Array(this.w * this.h);
    this.heights = new Uint8Array(this.w * this.h);
    this.ramps = new Uint8Array(this.w * this.h);
    const heightSrc = map.heights ?? map.visualHeights;
    for (let i = 0; i < this.terrain.length; i++) {
      const code = map.tiles[i] ?? 0;
      const t = code === TILE_BLOCKED ? 1 : 0;
      this.terrain[i] = t;
      this.blocked[i] = t;
      this.heights[i] = heightSrc?.[i] ?? 0;
      this.ramps[i] = code === TILE_RAMP ? 1 : 0;
    }
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  heightAt(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return 0;
    return this.heights[this.idx(tx, ty)]!;
  }

  heightAtWorld(x: number, y: number): number {
    return this.heightAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Continuous walkable surface height (ramps lerp; cliffs stay discrete). */
  surfaceHeightAtWorld(x: number, y: number): number {
    return surfaceHeightAt(
      {
        tileW: this.w,
        tileH: this.h,
        heightAt: (tx, ty) => this.heightAt(tx, ty),
        isRamp: (tx, ty) => this.isRamp(tx, ty),
      },
      x,
      y,
    );
  }

  isRamp(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    return this.ramps[this.idx(tx, ty)] === 1;
  }

  /**
   * Ground units may step between tiles of equal height, or change height by 1
   * when at least one of the tiles is a ramp.
   */
  canStep(fromTx: number, fromTy: number, toTx: number, toTy: number): boolean {
    if (!this.inBounds(fromTx, fromTy) || !this.inBounds(toTx, toTy)) return false;
    if (fromTx === toTx && fromTy === toTy) return true;
    const from = this.idx(fromTx, fromTy);
    const to = this.idx(toTx, toTy);
    const hf = this.heights[from]!;
    const ht = this.heights[to]!;
    if (hf === ht) return true;
    if (Math.abs(hf - ht) === 1 && (this.ramps[from] === 1 || this.ramps[to] === 1)) return true;
    return false;
  }

  /** Air units only collide with the map edge. */
  isBlockedForAir(tx: number, ty: number): boolean {
    return !this.inBounds(tx, ty);
  }

  isBlockedWorldForAir(x: number, y: number): boolean {
    return this.isBlockedForAir(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  isBlockedDiscForAir(x: number, y: number, radius: number): boolean {
    if (radius <= 0) return this.isBlockedWorldForAir(x, y);
    const minTx = Math.floor((x - radius) / TILE);
    const maxTx = Math.floor((x + radius) / TILE);
    const minTy = Math.floor((y - radius) / TILE);
    const maxTy = Math.floor((y + radius) / TILE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (this.isBlockedForAir(tx, ty)) return true;
      }
    }
    return false;
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
    fromX?: number,
    fromY?: number,
  ): boolean {
    const toTx = Math.floor(x / TILE);
    const toTy = Math.floor(y / TILE);
    const fromTx = Math.floor((fromX ?? x) / TILE);
    const fromTy = Math.floor((fromY ?? y) / TILE);
    if (!this.canStep(fromTx, fromTy, toTx, toTy)) return true;

    if (radius <= 0) {
      const occupancy = unitOwner && relations
        ? this.isBlockedWorldFor(unitOwner, x, y, relations)
        : this.isBlockedWorld(x, y);
      return occupancy;
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
        const closestX = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE));
        const closestY = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
        const dx = x - closestX;
        const dy = y - closestY;
        if (dx * dx + dy * dy >= r2) continue;
        if (tileBlocked(tx, ty)) return true;
        if (!this.canStep(toTx, toTy, tx, ty)) return true;
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
          ? this.isBlockedDiscFor(px, py, radius, unitOwner, relations, x, y)
          : this.isBlockedDiscFor(px, py, radius, null, null, x, y);
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

  /** Clear building/gate occupancy and restore terrain-only passability. */
  resetBuildings(): void {
    for (let i = 0; i < this.blocked.length; i++) {
      this.blocked[i] = this.terrain[i]!;
    }
    this.gateOwners.clear();
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

  canPlace(tx: number, ty: number, footprint: number, spacing = BUILD_SPACING_TILES): boolean {
    for (let dy = -spacing; dy < footprint + spacing; dy++) {
      for (let dx = -spacing; dx < footprint + spacing; dx++) {
        if (this.isOccupied(tx + dx, ty + dy)) return false;
      }
    }
    return this.footprintHeightOk(tx, ty, footprint);
  }

  /** Buildings cannot hang off a cliff; ramps may mix adjacent heights. */
  footprintHeightOk(tx: number, ty: number, footprint: number): boolean {
    let groundedHeight: number | null = null;
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (!this.inBounds(x, y)) return false;
        const h = this.heightAt(x, y);
        if (this.isRamp(x, y)) {
          if (groundedHeight !== null && Math.abs(h - groundedHeight) > 1) return false;
          continue;
        }
        if (groundedHeight === null) groundedHeight = h;
        else if (h !== groundedHeight) return false;
      }
    }
    return true;
  }
}
