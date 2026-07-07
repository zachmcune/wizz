// Single source of truth for coordinate conversions. ALL conversions go through here.
// World units: floating-point sim space. Tile: integer grid. Screen: pixels after camera.
import { TILE } from './constants';
import { getProjection } from './projection';

export interface Vec2 {
  x: number;
  y: number;
}

export interface CameraView {
  x: number; // world position of the top-left of the viewport
  y: number;
  zoom: number;
}

export function worldToTileX(worldX: number): number {
  return Math.floor(worldX / TILE);
}

export function worldToTileY(worldY: number): number {
  return Math.floor(worldY / TILE);
}

/** Returns the world-space center of a tile. */
export function tileToWorld(tileX: number, tileY: number): Vec2 {
  return { x: tileX * TILE + TILE / 2, y: tileY * TILE + TILE / 2 };
}

/** Project world ground position into render-layer coordinates (before camera zoom/pan). */
export function projectGround(world: Vec2, visualHeight = 0): Vec2 {
  return getProjection().projectGround(world, visualHeight);
}

export function worldToScreen(world: Vec2, cam: CameraView, visualHeight = 0): Vec2 {
  return getProjection().worldToScreen(world, cam, visualHeight);
}

export function screenToWorld(screen: Vec2, cam: CameraView): Vec2 {
  return getProjection().screenToWorld(screen, cam);
}

export function projectionSortKey(world: Vec2, cam: CameraView, visualHeight = 0): number {
  return getProjection().sortKey(world, cam, visualHeight);
}
