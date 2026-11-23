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
//
// ── CLAMPING, AND WHY IT IS DONE IN PROJECTED SPACE ──────────────────────────────────────────────
//
// The map is a DIAMOND in projected space, not a rectangle: world (0,0) projects to (0,0), world
// (W,0) to (W/2, W/4), world (0,H) to (-H/2, H/4). The previous clamp used a world-space AABB, whose
// width (`~1417` world units at 667x375) is unrelated to how much of the map is actually on screen.
// The consequence was the reported bug: the camera could sit with most of the viewport outside the
// map, and the player saw a large black void above their base.
//
// Clamping now happens on the camera's PROJECTED centre against the map's projected bounding box,
// inset by half the viewport, so the viewport's projected rect stays on the map's projected box.
// That does not make the diamond fill a rectangle — near a corner it cannot, by geometry — so at
// match start we additionally pick the camera that MAXIMISES the fraction of the safe viewport
// covered by map, while keeping the player's Sanctum inside the safe (HUD-free) area.

import { MAX_ZOOM, MIN_ZOOM, TILE } from '../core/constants';
import { projectGround, screenToWorld, type CameraView } from '../core/projection';
import { clamp, type Vec2 } from '../core/math';

/** How far past the map's projected bounds the camera may centre, as a fraction of the viewport. */
const OVERSCROLL = 0.04;

/** Screen-space margins occupied by HUD chrome. The camera frames inside what is left. */
export interface SafeInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const NO_INSETS: SafeInsets = { left: 0, top: 0, right: 0, bottom: 0 };

/** Inverse of `projectGround` for a delta: screen pixels -> world units. */
function screenDeltaToWorld(dx: number, dy: number): Vec2 {
  const a = dx / 0.5;
  const b = dy / 0.25;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Inverse of `projectGround` for an absolute projected point. */
function unprojectGround(p: Vec2): Vec2 {
  const a = p.x / 0.5;
  const b = p.y / 0.25;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export interface MapProjectedBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Clamp a world centre so the viewport's projected rect stays on the map's projected bounds.
 *
 * Free function rather than a method so `frameOn` can probe candidate zooms without mutating state —
 * the search would otherwise have to save and restore three fields per probe and one missing restore
 * would corrupt the camera.
 */
function clampProjected(wx: number, wy: number, cam: CameraLike, zoom: number): Vec2 {
  const b = cam.projectedMapBounds();
  const halfW = cam.viewportWidth / (2 * zoom);
  const halfH = cam.viewportHeight / (2 * zoom);
  const slackX = halfW * 2 * OVERSCROLL;
  const slackY = halfH * 2 * OVERSCROLL;
  const mapW = b.maxX - b.minX;
  const mapH = b.maxY - b.minY;
  const p = projectGround({ x: wx, y: wy });
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  const x = halfW * 2 >= mapW + slackX * 2 ? midX : clamp(p.x, b.minX + halfW - slackX, b.maxX - halfW + slackX);
  const y = halfH * 2 >= mapH + slackY * 2 ? midY : clamp(p.y, b.minY + halfH - slackY, b.maxY - halfH + slackY);
  return { x, y };
}

interface CameraLike {
  projectedMapBounds(): MapProjectedBounds;
  viewportWidth: number;
  viewportHeight: number;
}

export class Camera {
  /** World position at the centre of the viewport. */
  centerX = 0;
  centerY = 0;
  zoom = 1;

  private insets: SafeInsets = NO_INSETS;

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

  get viewport(): { w: number; h: number } {
    return { w: this.viewW, h: this.viewH };
  }

  get viewportWidth(): number {
    return this.viewW;
  }

  get viewportHeight(): number {
    return this.viewH;
  }

  /**
   * Tell the camera which parts of the screen the HUD occupies.
   *
   * Framing and follow logic use the SAFE rect (viewport minus insets) so the thing being framed
   * lands in the visible battlefield rather than underneath the command sidebar.
   */
  setInsets(insets: Partial<SafeInsets>): void {
    this.insets = {
      left: Math.max(0, insets.left ?? this.insets.left),
      top: Math.max(0, insets.top ?? this.insets.top),
      right: Math.max(0, insets.right ?? this.insets.right),
      bottom: Math.max(0, insets.bottom ?? this.insets.bottom),
    };
  }

  get safeInsets(): SafeInsets {
    return { ...this.insets };
  }

  /** The usable battlefield rectangle, in CSS pixels from the viewport's top-left. */
  safeRect(): { x: number; y: number; w: number; h: number } {
    const w = Math.max(40, this.viewW - this.insets.left - this.insets.right);
    const h = Math.max(40, this.viewH - this.insets.top - this.insets.bottom);
    return { x: this.insets.left, y: this.insets.top, w, h };
  }

  /** World extent (world units) the current viewport covers. Used for culling only. */
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

  /**
   * Centre a world position in the SAFE rect rather than the raw viewport.
   *
   * With the command sidebar docked right (or a top rail), centring on the viewport centre would put
   * the thing being framed under the chrome. The shift is applied in projected space so it is exact
   * at any zoom.
   */
  centerInSafeArea(wx: number, wy: number): void {
    const r = this.safeRect();
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const p = projectGround({ x: wx, y: wy });
    const camProj = { x: p.x - (cx - this.viewW / 2) / this.zoom, y: p.y - (cy - this.viewH / 2) / this.zoom };
    const world = unprojectGround(camProj);
    this.centerX = world.x;
    this.centerY = world.y;
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

  /**
   * Frame a world point as a MATCH-START camera: a playable view centred on the point.
   *
   * THE INSIGHT THIS ENCODES. "Maximise how much of the map is on screen" is the wrong objective, and
   * optimising it is how the reported bug survived a fix attempt. A 1920x1080 window at zoom 1 shows the
   * whole 128x88 board, so the base is a dot surrounded by empty ground and the diamond's uncovered
   * corners read as a void band. A 667x375 phone at the same zoom shows a comfortable neighbourhood, and
   * the SAME camera settings therefore produce completely different framing on the two devices.
   *
   * What a player expects at match start is a CONSISTENT view: roughly the same amount of world on screen
   * whatever the screen is. So the zoom is derived from the viewport, targeting a fixed world span across
   * the playable rect's short side (`TARGET_FRAME_WORLD`), clamped to the zoom range. Then the camera is
   * centred on the point in the safe rect.
   *
   * If that zoom cannot centre the point (a spawn corner near the board edge, where the clamp would push
   * it away), the zoom is raised until it can — up to MAX_ZOOM — because being able to see your own start
   * beats any amount of extra context.
   *
   * Returns the zoom that was applied.
   */
  frameOn(wx: number, wy: number): number {
    const r = this.safeRect();
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const shortSide = Math.min(r.w, r.h);

    /**
     * The target span is expressed in PROJECTED pixels of the short side, because one projected pixel is
     * one world unit at zoom 1 along both projected axes. 360 was chosen by measuring the resulting world
     * span against the base: it puts ~11 base-widths across a phone and ~11 across a desktop, which is the
     * amount of context a player needs to see their own base, the lane out of it, and the ground in front.
     */
    const TARGET_FRAME_WORLD = 360;

    /** The offset the clamp would apply at a candidate zoom, as a fraction of the safe rect. */
    const centreError = (zoom: number): number => {
      this.zoom = zoom;
      this.centerInSafeArea(wx, wy);
      const p = this.worldToScreenPoint(wx, wy);
      return Math.max(Math.abs(p.x - cx) / r.w, Math.abs(p.y - cy) / r.h);
    };

    let zoom = clamp(shortSide / TARGET_FRAME_WORLD, MIN_ZOOM, MAX_ZOOM);
    /**
     * Raise the zoom until the point can actually be centred, and STOP BELOW THE CEILING.
     *
     * Two separate requirements meet here:
     *
     *   • The point has to be centreable, or the base sits at a clamped edge (the reported bug).
     *   • The match must not START at maximum zoom, or the player cannot zoom in at all — the browser
     *     pinch proof caught exactly that on Chromebook, where the required zoom reached 2.0 and a
     *     pinch-out therefore did nothing.
     *
     * So the search targets `MAX_ZOOM - 0.15`, leaving a visible amount of zoom-in available, and it stops
     * as soon as the point is within 12% of the centre. If it hits the cap the base is as centred as the
     * board allows, which is the correct trade at that point.
     */
    const zoomCeiling = MAX_ZOOM - 0.15;
    for (let i = 0; i < 30 && zoom < zoomCeiling && centreError(zoom) > 0.12; i++) {
      zoom = Math.min(zoomCeiling, zoom + 0.1);
    }

    this.zoom = clamp(zoom, MIN_ZOOM, zoomCeiling);
    this.centerInSafeArea(wx, wy);
    return this.zoom;
  }

  /** Zoom about the current centre. */
  setZoom(zoom: number): void {
    this.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.clamp();
  }

  zoomBy(factor: number): void {
    this.setZoom(this.zoom * factor);
  }

  /**
   * Zoom toward a screen anchor so the world point under the finger/cursor stays put.
   *
   * `anchor` is in viewport CSS pixels. This is what makes pinch-to-zoom feel attached to the pinch
   * centre rather than to the middle of the screen.
   */
  zoomAt(anchor: Vec2, factor: number): void {
    const before = screenToWorld(anchor, this.view());
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = screenToWorld(anchor, this.view());
    this.centerX += before.x - after.x;
    this.centerY += before.y - after.y;
    this.clamp();
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

  /** The map's projected bounding box — the space the clamp works in. */
  projectedMapBounds(): MapProjectedBounds {
    const corners = [
      projectGround({ x: 0, y: 0 }),
      projectGround({ x: this.worldW, y: 0 }),
      projectGround({ x: 0, y: this.worldH }),
      projectGround({ x: this.worldW, y: this.worldH }),
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of corners) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Fraction (0..1) of the SAFE rect covered by the map's projected diamond.
   *
   * Sampled on a grid — exact polygon clipping is more code for no extra decision value here, and a
   * 24x14 sample is well under a millisecond. Exposed because the proof asserts it, so the number in
   * the report is the number the camera was framed against.
   */
  safeMapCoverage(samplesX = 24, samplesY = 14): number {
    const r = this.safeRect();
    const v = this.view();
    let inside = 0;
    let total = 0;
    for (let iy = 0; iy < samplesY; iy++) {
      for (let ix = 0; ix < samplesX; ix++) {
        const sx = r.x + ((ix + 0.5) / samplesX) * r.w;
        const sy = r.y + ((iy + 0.5) / samplesY) * r.h;
        const world = screenToWorld({ x: sx, y: sy }, v);
        total++;
        if (world.x >= 0 && world.y >= 0 && world.x <= this.worldW && world.y <= this.worldH) inside++;
      }
    }
    return total === 0 ? 0 : inside / total;
  }

  /** Projected viewport position (CSS px) of a world point at ground level. */
  worldToScreenPoint(wx: number, wy: number, visualHeight = 0): Vec2 {
    const p = projectGround({ x: wx, y: wy }, visualHeight);
    const c = projectGround({ x: this.centerX, y: this.centerY });
    return { x: (p.x - c.x) * this.zoom + this.viewW / 2, y: (p.y - c.y) * this.zoom + this.viewH / 2 };
  }

  /**
   * Is every corner of a `radius`-tile square around a world point on the board?
   *
   * The question a match-start framing has to answer is not "how much of the screen is map" — a diamond
   * board in a rectangular window can never fill it from a corner — but "can the player see the ground
   * around their own base". This samples the square's corners and edges, which are the points that leave
   * the board first, and reports whether all of them are inside it. Exposed for the proof, so the number
   * in the test is the property the framing was built to satisfy.
   */
  aroundIsMap(wx: number, wy: number, radiusTiles: number): boolean {
    const r = radiusTiles * TILE;
    const pts: Vec2[] = [
      { x: wx - r, y: wy - r },
      { x: wx + r, y: wy - r },
      { x: wx - r, y: wy + r },
      { x: wx + r, y: wy + r },
      { x: wx, y: wy - r },
      { x: wx, y: wy + r },
      { x: wx - r, y: wy },
      { x: wx + r, y: wy },
    ];
    for (const p of pts) {
      if (p.x < 0 || p.y < 0 || p.x > this.worldW || p.y > this.worldH) return false;
    }
    return true;
  }

  private clamp(): void {
    if (this.viewW <= 0 || this.viewH <= 0 || this.zoom <= 0) return;
    const camProj = projectGround({ x: this.centerX, y: this.centerY });
    const clamped = clampProjected(this.centerX, this.centerY, this, this.zoom);
    if (clamped.x !== camProj.x || clamped.y !== camProj.y) {
      const world = unprojectGround({ x: clamped.x, y: clamped.y });
      this.centerX = world.x;
      this.centerY = world.y;
    }
    if (!Number.isFinite(this.centerX)) this.centerX = this.worldW / 2;
    if (!Number.isFinite(this.centerY)) this.centerY = this.worldH / 2;
  }

  /** World span accessor, kept for callers that cull by camera extent. */
  get worldExtent(): { w: number; h: number } {
    return this.worldSpan();
  }
}

export { NO_INSETS };
