// World ↔ screen projection. The game is 2.5D only (dimetric / RA2-style oblique).
// Simulation stays in 2D world units; this module is the only world↔screen mapping.
import type { CameraView, Vec2 } from './coords';

/** Screen lift per visual height level (world units before zoom). */
export const VISUAL_HEIGHT_STEP = 8;

/** Extra visual height levels applied to flying units (render + picking only). */
export const FLYER_HOVER_LEVELS = 2;

/** Dimetric scale factors (2:1-style oblique). */
export const OBLIQUE_SCALE_X = 0.5;
export const OBLIQUE_SCALE_Y = 0.25;

export interface Projection {
  projectGround(world: Vec2, visualHeight?: number): Vec2;
  worldToScreen(world: Vec2, cam: CameraView, visualHeight?: number): Vec2;
  screenToWorld(screen: Vec2, cam: CameraView): Vec2;
  sortKey(world: Vec2, cam: CameraView, visualHeight?: number): number;
  /** Convert a screen drag delta to camera top-left movement in world space. */
  screenPanToCameraDelta(dxScreen: number, dyScreen: number, zoom: number): Vec2;
}

function projectObliqueGround(world: Vec2, visualHeight = 0): Vec2 {
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
  screenToWorld(screen: Vec2, cam: CameraView): Vec2 {
    const c = camProjectGround(cam);
    const px = screen.x / cam.zoom + c.x;
    const py = screen.y / cam.zoom + c.y;
    const a = px / OBLIQUE_SCALE_X;
    const b = py / OBLIQUE_SCALE_Y;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  },
  sortKey(world: Vec2, cam: CameraView, visualHeight = 0): number {
    return this.worldToScreen(world, cam, visualHeight).y;
  },
  screenPanToCameraDelta(dxScreen: number, dyScreen: number, zoom: number): Vec2 {
    const invZoom = 1 / zoom;
    const dwx =
      -0.5 * (dxScreen * invZoom / OBLIQUE_SCALE_X + dyScreen * invZoom / OBLIQUE_SCALE_Y);
    const dwy =
      0.5 * (dxScreen * invZoom / OBLIQUE_SCALE_X - dyScreen * invZoom / OBLIQUE_SCALE_Y);
    return { x: dwx, y: dwy };
  },
};

export function getProjection(): Projection {
  return ObliqueProjection;
}

/** Map sim facing (radians) to 8-direction sprite index (0 = east, counter-clockwise). */
export function facingToDirection(facing: number): number {
  const tau = Math.PI * 2;
  const n = ((facing % tau) + tau) % tau;
  return Math.round(n / (Math.PI / 4)) % 8;
}
