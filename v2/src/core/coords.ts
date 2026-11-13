// Coordinate helpers. TILE is the only bridge between world units and the tile grid.
// Rendering must go through core/projection.ts; these two concerns stay separate on purpose.

import { TILE } from './constants';
import type { Vec2 } from './math';

export function worldToTile(x: number, y: number): { tx: number; ty: number } {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

export function tileToWorld(tx: number, ty: number): Vec2 {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

/** Top-left corner of a tile in world units (use for footprints, which are anchored there). */
export function tileCornerToWorld(tx: number, ty: number): Vec2 {
  return { x: tx * TILE, y: ty * TILE };
}

/** Centre of a square footprint anchored at its top-left tile. */
export function footprintCenter(tx: number, ty: number, footprint: number): Vec2 {
  return { x: (tx + footprint / 2) * TILE, y: (ty + footprint / 2) * TILE };
}

/** Tile index in a row-major grid. */
export function tileIndex(tx: number, ty: number, width: number): number {
  return ty * width + tx;
}
