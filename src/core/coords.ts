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

export function screenPanToCameraDelta(dxScreen: number, dyScreen: number, zoom: number): Vec2 {
  return getProjection().screenPanToCameraDelta(dxScreen, dyScreen, zoom);
}

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * World-space AABB of the pixels currently on screen.
 * The visible 2.5D region is a parallelogram; this is its axis-aligned bounds.
 * Do not use `{ x: cam.x, y: cam.y, w: viewW / zoom, h: viewH / zoom }` — that is
 * the camera-origin rectangle and misses most of the viewport after projection.
 */
export function visibleWorldAabb(cam: CameraView, viewW: number, viewH: number): WorldRect {
  const corners = [
    screenToWorld({ x: 0, y: 0 }, cam),
    screenToWorld({ x: viewW, y: 0 }, cam),
    screenToWorld({ x: 0, y: viewH }, cam),
    screenToWorld({ x: viewW, y: viewH }, cam),
  ];
  let minX = corners[0]!.x;
  let maxX = minX;
  let minY = corners[0]!.y;
  let maxY = minY;
  for (let i = 1; i < corners.length; i++) {
    const c = corners[i]!;
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** True when a world point lies inside `rect`, expanded by `pad` on each side. */
export function worldPointInView(worldX: number, worldY: number, rect: WorldRect, pad = 0): boolean {
  return (
    worldX + pad >= rect.x &&
    worldX - pad <= rect.x + rect.w &&
    worldY + pad >= rect.y &&
    worldY - pad <= rect.y + rect.h
  );
}
