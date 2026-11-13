// World ↔ screen projection. The game is 2.5D only (dimetric / RA2-style oblique).
// The simulation stays in 2D world units; this is the ONLY world↔screen mapping.
//
// There is deliberately no ortho / top-down / classic-2D path here. v1 removed 2D mode and
// the rebuild keeps that decision (see v2/docs/REBUILD_PLAN.md): a single projection means a
// single set of picking, sorting, and occlusion rules to get right, instead of two that drift.

import type { Vec2 } from './math';

/** Screen lift per visual height level (pre-zoom pixels). One level matches a tile's projected height. */
export const VISUAL_HEIGHT_STEP = 16;

/** Extra visual height levels applied to flying units (render + picking only). */
export const FLYER_HOVER_LEVELS = 2;

/** Dimetric scale factors (2:1-style oblique): a 45° world axis halves in X and quarters in Y. */
export const OBLIQUE_SCALE_X = 0.5;
export const OBLIQUE_SCALE_Y = 0.25;

export interface CameraView {
  /** World coordinate at the viewport's top-left, in *projected* space terms. */
  x: number;
  y: number;
  zoom: number;
}

export interface Projection {
  projectGround(world: Vec2, visualHeight?: number): Vec2;
  worldToScreen(world: Vec2, cam: CameraView, visualHeight?: number): Vec2;
  screenToWorld(screen: Vec2, cam: CameraView, visualHeight?: number): Vec2;
  sortKey(world: Vec2, cam: CameraView, visualHeight?: number): number;
  screenPanToCameraDelta(dxScreen: number, dyScreen: number, zoom: number): Vec2;
}

export function projectObliqueGround(world: Vec2, visualHeight = 0): Vec2 {
  return {
    x: (world.x - world.y) * OBLIQUE_SCALE_X,
    y: (world.x + world.y) * OBLIQUE_SCALE_Y - visualHeight * VISUAL_HEIGHT_STEP,
  };
}

function camProjectGround(cam: CameraView): Vec2 {
  return projectObliqueGround({ x: cam.x, y: cam.y });
}

export const ObliqueProjection: Projection = {
  projectGround(world: Vec2, visualHeight = 0): Vec2 {
    return projectObliqueGround(world, visualHeight);
  },

  worldToScreen(world: Vec2, cam: CameraView, visualHeight = 0): Vec2 {
    const p = projectObliqueGround(world, visualHeight);
    const c = camProjectGround(cam);
    return { x: (p.x - c.x) * cam.zoom, y: (p.y - c.y) * cam.zoom };
  },

  /**
   * Inverse of `worldToScreen`. `visualHeight` must be supplied by the caller when picking an
   * entity that is lifted off the ground (flyers, height levels) — a flat pick assumes ground.
   */
  screenToWorld(screen: Vec2, cam: CameraView, visualHeight = 0): Vec2 {
    const c = camProjectGround(cam);
    const px = screen.x / cam.zoom + c.x;
    const py = screen.y / cam.zoom + c.y + visualHeight * VISUAL_HEIGHT_STEP;
    const a = px / OBLIQUE_SCALE_X;
    const b = py / OBLIQUE_SCALE_Y;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  },

  sortKey(world: Vec2, cam: CameraView, visualHeight = 0): number {
    return this.worldToScreen(world, cam, visualHeight).y;
  },

  /** Convert a screen-space drag into the camera top-left delta that makes content follow the finger. */
  screenPanToCameraDelta(dxScreen: number, dyScreen: number, zoom: number): Vec2 {
    const invZoom = 1 / zoom;
    const dwx = -0.5 * ((dxScreen * invZoom) / OBLIQUE_SCALE_X + (dyScreen * invZoom) / OBLIQUE_SCALE_Y);
    const dwy = 0.5 * ((dxScreen * invZoom) / OBLIQUE_SCALE_X - (dyScreen * invZoom) / OBLIQUE_SCALE_Y);
    return { x: dwx, y: dwy };
  },
};

export function getProjection(): Projection {
  return ObliqueProjection;
}

/** Map a sim facing (radians) to an 8-direction index (0 = east, counter-clockwise). */
export function facingToDirection(facing: number): number {
  const tau = Math.PI * 2;
  const n = ((facing % tau) + tau) % tau;
  return Math.round(n / (Math.PI / 4)) % 8;
}

/**
 * Axis-aligned world-space bounding box of everything currently on screen.
 * In 2.5D the visible region is a parallelogram, so this is its bounding box — used for
 * culling only, which is why an over-estimate is safe and an under-estimate is not.
 */
export function visibleWorldAabb(
  cam: CameraView,
  viewW: number,
  viewH: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const corners: Vec2[] = [
    ObliqueProjection.screenToWorld({ x: 0, y: 0 }, cam),
    ObliqueProjection.screenToWorld({ x: viewW, y: 0 }, cam),
    ObliqueProjection.screenToWorld({ x: 0, y: viewH }, cam),
    ObliqueProjection.screenToWorld({ x: viewW, y: viewH }, cam),
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// --------------------------------------------------------------------------------- free functions
// Thin wrappers so call sites read as maths rather than as method chains on a singleton. These are
// the ONLY world↔screen entry points used by the renderer.

export function projectGround(world: Vec2, visualHeight = 0): Vec2 {
  return ObliqueProjection.projectGround(world, visualHeight);
}

export function worldToScreen(world: Vec2, cam: CameraView, visualHeight = 0): Vec2 {
  return ObliqueProjection.worldToScreen(world, cam, visualHeight);
}

export function screenToWorld(screen: Vec2, cam: CameraView, visualHeight = 0): Vec2 {
  return ObliqueProjection.screenToWorld(screen, cam, visualHeight);
}

export function projectionSortKey(world: Vec2, cam: CameraView, visualHeight = 0): number {
  return ObliqueProjection.sortKey(world, cam, visualHeight);
}
