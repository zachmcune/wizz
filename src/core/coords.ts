// Single source of truth for coordinate conversions. ALL conversions go through here.
// World units: floating-point sim space. Tile: integer grid. Screen: pixels after camera.
import { TILE } from './constants';

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

export function worldToScreen(world: Vec2, cam: CameraView): Vec2 {
  return { x: (world.x - cam.x) * cam.zoom, y: (world.y - cam.y) * cam.zoom };
}

export function screenToWorld(screen: Vec2, cam: CameraView): Vec2 {
  return { x: screen.x / cam.zoom + cam.x, y: screen.y / cam.zoom + cam.y };
}
