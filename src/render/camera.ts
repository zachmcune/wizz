// View camera over the world. Position is the world coord at the viewport's top-left.
// Smoothly clamped to map bounds and zoom limits. Lives outside the sim (view concern).
import {
  CAMERA_OVERSCROLL_RATIO,
  CAMERA_OVERSCROLL_RATIO_X,
  CAMERA_OVERSCROLL_RATIO_Y,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../core/constants';
import { clamp } from '../sim/math';
import type { CameraView, Vec2 } from '../core/coords';
import { projectGround, screenPanToCameraDelta, screenToWorld } from '../core/coords';
import { getProjectionMode, OBLIQUE_SCALE_X, OBLIQUE_SCALE_Y } from '../core/projection';

export class Camera implements CameraView {
  x = 0;
  y = 0;
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
    this.clampToBounds();
  }

  setWorld(w: number, h: number): void {
    this.worldW = w;
    this.worldH = h;
    this.clampToBounds();
  }

  centerOn(x: number, y: number): void {
    if (getProjectionMode() === 'oblique') {
      const p = projectGround({ x, y });
      const cX = p.x - this.viewW / (2 * this.zoom);
      const cY = p.y - this.viewH / (2 * this.zoom);
      const a = cX / OBLIQUE_SCALE_X;
      const b = cY / OBLIQUE_SCALE_Y;
      this.x = (a + b) / 2;
      this.y = (b - a) / 2;
    } else {
      this.x = x - this.viewW / this.zoom / 2;
      this.y = y - this.viewH / this.zoom / 2;
    }
    this.clampToBounds();
  }

  /** Pan so world content follows the finger/mouse (projection-aware). */
  panByScreen(dxScreen: number, dyScreen: number): void {
    const delta = screenPanToCameraDelta(dxScreen, dyScreen, this.zoom);
    this.x += delta.x;
    this.y += delta.y;
    this.clampToBounds();
  }

  /** Zoom toward a screen anchor point (keeps that world point under the finger). */
  zoomAt(anchorScreen: Vec2, factor: number): void {
    const before = screenToWorld(anchorScreen, this);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = screenToWorld(anchorScreen, this);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampToBounds();
  }

  /** Set zoom level, keeping the viewport center fixed in world space. */
  setZoom(zoom: number): void {
    const anchor: Vec2 = { x: this.viewW / 2, y: this.viewH / 2 };
    const before = screenToWorld(anchor, this);
    this.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const after = screenToWorld(anchor, this);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampToBounds();
  }

  private overscrollPad(): { x: number; y: number } {
    const viewWorldW = this.viewW / this.zoom;
    const viewWorldH = this.viewH / this.zoom;
    if (getProjectionMode() === 'oblique') {
      return {
        x: viewWorldW * CAMERA_OVERSCROLL_RATIO_X,
        y: viewWorldH * CAMERA_OVERSCROLL_RATIO_Y,
      };
    }
    return {
      x: viewWorldW * CAMERA_OVERSCROLL_RATIO,
      y: viewWorldH * CAMERA_OVERSCROLL_RATIO,
    };
  }

  private clampToBounds(): void {
    const viewWorldW = this.viewW / this.zoom;
    const viewWorldH = this.viewH / this.zoom;
    if (getProjectionMode() === 'ortho') {
      // Legacy Classic 2D: tight map bounds, no overscroll.
      if (viewWorldW >= this.worldW) this.x = (this.worldW - viewWorldW) / 2;
      else this.x = clamp(this.x, 0, this.worldW - viewWorldW);
      if (viewWorldH >= this.worldH) this.y = (this.worldH - viewWorldH) / 2;
      else this.y = clamp(this.y, 0, this.worldH - viewWorldH);
      return;
    }
    const pad = this.overscrollPad();
    if (viewWorldW >= this.worldW) this.x = (this.worldW - viewWorldW) / 2;
    else this.x = clamp(this.x, -pad.x, this.worldW - viewWorldW + pad.x);
    if (viewWorldH >= this.worldH) this.y = (this.worldH - viewWorldH) / 2;
    else this.y = clamp(this.y, -pad.y, this.worldH - viewWorldH + pad.y);
  }

  view(): CameraView {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  /** The world-space rectangle currently visible. */
  visibleWorldRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.viewW / this.zoom, h: this.viewH / this.zoom };
  }
}
