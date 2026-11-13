// Camera.
//
// DESIGN: the camera owns a world-space CENTRE (`centerX`, `centerY`) plus a zoom. Everything else is
// derived. `CameraView` (the interface `core/projection.ts` consumes) is satisfied by reporting the
// world coordinate that projects to the viewport's TOP-LEFT, computed from the centre on demand.
//
// Why this shape: an earlier version tried to store the top-left world coordinate directly and
// convert "centre on X" into a top-left offset using a screen-delta inverse. That is subtly wrong,
// because the projection is a rotation (a screen-aligned rectangle is a rotated diamond in world
// space), and the mistake showed up as the camera sitting ~800 units from where it was asked to be —
// which silently culled visible entities. Deriving the top-left from a centre is exact.

import { MAX_ZOOM, MIN_ZOOM } from '../core/constants';
import { screenToWorld, type CameraView } from '../core/projection';
import { clamp, type Vec2 } from '../core/math';

/** How far past the map edge the camera may scroll, as a fraction of the visible world extent. */
const OVERSCROLL = 0.08;

/** Inverse of `projectGround` for a delta: screen pixels -> world units. */
function screenDeltaToWorld(dx: number, dy: number): Vec2 {
  const a = dx / 0.5;
  const b = dy / 0.25;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export class Camera {
  /** World position at the centre of the viewport. */
  centerX = 0;
  centerY = 0;
  zoom = 1;

  constructor(
    private viewW: number,
    private viewH: number,
    private worldW: number,
    private worldH: number,
  ) {}

  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  /** World extent (world units) the current viewport covers. */
  private worldSpan(): { w: number; h: number } {
    if (this.zoom <= 0) return { w: this.worldW, h: this.worldH };
    const half = screenDeltaToWorld(this.viewW / (2 * this.zoom), this.viewH / (2 * this.zoom));
    return { w: Math.abs(half.x) * 2, h: Math.abs(half.y) * 2 };
  }

  /**
   * The `CameraView` the projection consumes: the world coordinate that maps to the viewport's
   * top-left, derived from the centre.
   */
  view(): CameraView {
    const half = screenDeltaToWorld(this.viewW / (2 * this.zoom), this.viewH / (2 * this.zoom));
    return { x: this.centerX - half.x, y: this.centerY - half.y, zoom: this.zoom };
  }

  /** Centre the viewport on a world position. */
  centerOn(wx: number, wy: number): void {
    this.centerX = wx;
    this.centerY = wy;
    this.clamp();
  }

  /** Pan by a screen-space delta so content follows the pointer. */
  panByScreen(dx: number, dy: number): void {
    if (this.zoom <= 0) return;
    const d = screenDeltaToWorld(dx / this.zoom, dy / this.zoom);
    this.centerX -= d.x;
    this.centerY -= d.y;
    this.clamp();
  }

  /** Zoom about the current centre. */
  setZoom(zoom: number): void {
    this.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.clamp();
  }

  zoomBy(factor: number): void {
    this.setZoom(this.zoom * factor);
  }

  /** World-space AABB currently visible, padded for culling. */
  visibleWorldRect(pad = 1.2): { minX: number; minY: number; maxX: number; maxY: number } {
    const v = this.view();
    const corners: Vec2[] = [];
    for (const [sx, sy] of [
      [0, 0],
      [this.viewW, 0],
      [0, this.viewH],
      [this.viewW, this.viewH],
    ] as const) {
      corners.push(screenToWorld({ x: sx, y: sy }, v));
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    }
    const padX = (maxX - minX) * (pad - 1) * 0.5;
    const padY = (maxY - minY) * (pad - 1) * 0.5;
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
  }

  private clamp(): void {
    if (this.viewW <= 0 || this.viewH <= 0 || this.zoom <= 0) return;
    const span = this.worldSpan();
    const padX = span.w * OVERSCROLL;
    const padY = span.h * OVERSCROLL;
    if (span.w >= this.worldW) this.centerX = this.worldW / 2;
    else this.centerX = clamp(this.centerX, -padX, this.worldW + padX);
    if (span.h >= this.worldH) this.centerY = this.worldH / 2;
    else this.centerY = clamp(this.centerY, -padY, this.worldH + padY);
  }
}
