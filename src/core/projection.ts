// World ↔ screen projection strategies. Ortho preserves legacy top-down; oblique is RA2-style 2.5D.
import type { CameraView, Vec2 } from './coords';

export type ProjectionMode = 'ortho' | 'oblique';

/** Screen lift per visual height level in oblique mode (world units before zoom). */
export const VISUAL_HEIGHT_STEP = 8;

/** Dimetric scale factors (2:1-style oblique). */
export const OBLIQUE_SCALE_X = 0.5;
export const OBLIQUE_SCALE_Y = 0.25;

export interface Projection {
  readonly mode: ProjectionMode;
  projectGround(world: Vec2, visualHeight?: number): Vec2;
  worldToScreen(world: Vec2, cam: CameraView, visualHeight?: number): Vec2;
  screenToWorld(screen: Vec2, cam: CameraView): Vec2;
  sortKey(world: Vec2, cam: CameraView, visualHeight?: number): number;
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

export const OrthoProjection: Projection = {
  mode: 'ortho',
  projectGround(world: Vec2, _visualHeight = 0): Vec2 {
    return { x: world.x, y: world.y };
  },
  worldToScreen(world: Vec2, cam: CameraView, _visualHeight = 0): Vec2 {
    return { x: (world.x - cam.x) * cam.zoom, y: (world.y - cam.y) * cam.zoom };
  },
  screenToWorld(screen: Vec2, cam: CameraView): Vec2 {
    return { x: screen.x / cam.zoom + cam.x, y: screen.y / cam.zoom + cam.y };
  },
  sortKey(world: Vec2, _cam: CameraView, _visualHeight = 0): number {
    return world.y;
  },
};

export const ObliqueProjection: Projection = {
  mode: 'oblique',
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
};

const PROJECTIONS: Record<ProjectionMode, Projection> = {
  ortho: OrthoProjection,
  oblique: ObliqueProjection,
};

let activeMode: ProjectionMode = 'oblique';

export function getProjectionMode(): ProjectionMode {
  return activeMode;
}

export function getProjection(): Projection {
  return PROJECTIONS[activeMode];
}

export function setProjectionMode(mode: ProjectionMode): void {
  activeMode = mode;
}

/** URL param ?view=2d|oblique overrides stored settings when valid. */
export function resolveProjectionMode(stored: ProjectionMode | undefined): ProjectionMode {
  if (typeof window === 'undefined') return stored ?? 'oblique';
  const param = new URLSearchParams(window.location.search).get('view');
  if (param === '2d' || param === 'ortho') return 'ortho';
  if (param === 'oblique') return 'oblique';
  return stored ?? 'oblique';
}

/** Map sim facing (radians) to 8-direction sprite index (0 = east, counter-clockwise). */
export function facingToDirection(facing: number): number {
  const tau = Math.PI * 2;
  const n = ((facing % tau) + tau) % tau;
  return Math.round(n / (Math.PI / 4)) % 8;
}
