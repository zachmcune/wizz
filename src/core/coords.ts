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

export function screenToWorld(screen: Vec2, cam: CameraView, visualHeight = 0): Vec2 {
  return getProjection().screenToWorld(screen, cam, visualHeight);
}

/** Discrete tile height used to pick the raised surface under a screen point. */
export type TileHeightAt = (tx: number, ty: number) => number;

function pointInConvexQuad(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const cross = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) =>
    (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  const d0 = cross(ax, ay, bx, by, px, py);
  const d1 = cross(bx, by, cx, cy, px, py);
  const d2 = cross(cx, cy, dx, dy, px, py);
  const d3 = cross(dx, dy, ax, ay, px, py);
  const hasNeg = d0 < 0 || d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d0 > 0 || d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export type WorldHeightAt = (worldX: number, worldY: number) => number;

function tileTopContainsScreen(
  tx: number,
  ty: number,
  height: number,
  screen: Vec2,
  cam: CameraView,
  surfaceHeightAt?: WorldHeightAt,
): boolean {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const x1 = x0 + TILE;
  const y1 = y0 + TILE;
  const htl = surfaceHeightAt ? surfaceHeightAt(x0, y0) : height;
  const htr = surfaceHeightAt ? surfaceHeightAt(x1, y0) : height;
  const hbr = surfaceHeightAt ? surfaceHeightAt(x1, y1) : height;
  const hbl = surfaceHeightAt ? surfaceHeightAt(x0, y1) : height;
  const tl = worldToScreen({ x: x0, y: y0 }, cam, htl);
  const tr = worldToScreen({ x: x1, y: y0 }, cam, htr);
  const br = worldToScreen({ x: x1, y: y1 }, cam, hbr);
  const bl = worldToScreen({ x: x0, y: y1 }, cam, hbl);
  return pointInConvexQuad(screen.x, screen.y, tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y);
}

/**
 * Unproject a screen point onto the raised tile under the cursor (highest first).
 * Height-0 `screenToWorld` is the fallback when no tile top contains the point.
 */
export function screenToWorldOnHeightField(
  screen: Vec2,
  cam: CameraView,
  heightAt: TileHeightAt,
  tileW: number,
  tileH: number,
  surfaceHeightAt?: WorldHeightAt,
): Vec2 {
  const fallback = screenToWorld(screen, cam, 0);
  let best: Vec2 | null = null;
  let bestH = -1;
  const seen = new Set<number>();
  for (const probe of [0, 0.25, 0.5, 0.75, 1, 2, 3]) {
    const world = screenToWorld(screen, cam, probe);
    const tx0 = Math.floor(world.x / TILE);
    const ty0 = Math.floor(world.y / TILE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = tx0 + dx;
        const ty = ty0 + dy;
        if (tx < 0 || ty < 0 || tx >= tileW || ty >= tileH) continue;
        const key = ty * tileW + tx;
        if (seen.has(key)) continue;
        seen.add(key);
        const h = heightAt(tx, ty);
        if (!tileTopContainsScreen(tx, ty, h, screen, cam, surfaceHeightAt)) continue;
        if (h < bestH) continue;
        bestH = h;
        const pickH = surfaceHeightAt
          ? surfaceHeightAt(tx * TILE + TILE / 2, ty * TILE + TILE / 2)
          : h;
        best = screenToWorld(screen, cam, pickH);
      }
    }
  }
  if (!best) return fallback;
  if (!surfaceHeightAt) return best;
  let refined = best;
  for (let i = 0; i < 4; i++) {
    refined = screenToWorld(screen, cam, surfaceHeightAt(refined.x, refined.y));
  }
  return refined;
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
