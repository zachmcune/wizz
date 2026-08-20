// Continuous ramp surfaces. Discrete tile heights stay a stair; this lerps along a
// contiguous ramp run so units and terrain climb the way RA2 ramps do.
import { TILE, TILE_RAMP } from './constants';

export interface TileQuery {
  tileW: number;
  tileH: number;
  heightAt(tx: number, ty: number): number;
  isRamp(tx: number, ty: number): boolean;
}

export interface RampSpan {
  /** 0 = interpolate along world X, 1 = along world Y. */
  axis: 0 | 1;
  t0: number;
  t1: number;
  h0: number;
  h1: number;
}

export interface CornerHeights {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

export function mapTileQuery(map: {
  tileW: number;
  tileH: number;
  tiles: number[];
  heights?: number[];
  visualHeights?: number[];
}): TileQuery {
  const heights = map.heights ?? map.visualHeights;
  return {
    tileW: map.tileW,
    tileH: map.tileH,
    heightAt(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return 0;
      return heights?.[ty * map.tileW + tx] ?? 0;
    },
    isRamp(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return false;
      return map.tiles[ty * map.tileW + tx] === TILE_RAMP;
    },
  };
}

function inBounds(q: TileQuery, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < q.tileW && ty < q.tileH;
}

function scanRampAxis(q: TileQuery, tx: number, ty: number, axis: 0 | 1): RampSpan {
  let t0 = axis === 0 ? tx : ty;
  let t1 = t0;
  const max = axis === 0 ? q.tileW : q.tileH;
  const isRampAt = (t: number) => (axis === 0 ? q.isRamp(t, ty) : q.isRamp(tx, t));
  const heightAtT = (t: number) => (axis === 0 ? q.heightAt(t, ty) : q.heightAt(tx, t));
  while (t0 > 0 && isRampAt(t0 - 1)) t0--;
  while (t1 + 1 < max && isRampAt(t1 + 1)) t1++;
  const h0 = t0 > 0 ? heightAtT(t0 - 1) : heightAtT(t0);
  const h1 = t1 + 1 < max ? heightAtT(t1 + 1) : heightAtT(t1);
  return { axis, t0, t1, h0, h1 };
}

/** Slope of the ramp covering `tx, ty`, or null when the tile is not a sloped ramp. */
export function rampSpanAt(q: TileQuery, tx: number, ty: number): RampSpan | null {
  if (!inBounds(q, tx, ty) || !q.isRamp(tx, ty)) return null;
  const alongX = scanRampAxis(q, tx, ty, 0);
  const alongY = scanRampAxis(q, tx, ty, 1);
  const dx = Math.abs(alongX.h1 - alongX.h0);
  const dy = Math.abs(alongY.h1 - alongY.h0);
  if (dx === 0 && dy === 0) return null;
  if (dx >= dy) return alongX;
  return alongY;
}

export function heightAlongRamp(span: RampSpan, worldX: number, worldY: number): number {
  const p = span.axis === 0 ? worldX : worldY;
  const spanTiles = span.t1 + 1 - span.t0;
  if (spanTiles <= 0) return span.h0;
  let u = (p / TILE - span.t0) / spanTiles;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  return span.h0 + (span.h1 - span.h0) * u;
}

/** Discrete tile height, or a lerp along the ramp when the tile is a slope. */
export function surfaceHeightAt(q: TileQuery, worldX: number, worldY: number): number {
  const tx = Math.floor(worldX / TILE);
  const ty = Math.floor(worldY / TILE);
  if (!inBounds(q, tx, ty)) return 0;
  const span = rampSpanAt(q, tx, ty);
  if (!span) return q.heightAt(tx, ty);
  return heightAlongRamp(span, worldX, worldY);
}

export function tileCornerHeights(q: TileQuery, tx: number, ty: number): CornerHeights {
  const span = rampSpanAt(q, tx, ty);
  if (!span) {
    const h = inBounds(q, tx, ty) ? q.heightAt(tx, ty) : 0;
    return { tl: h, tr: h, br: h, bl: h };
  }
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const x1 = x0 + TILE;
  const y1 = y0 + TILE;
  return {
    tl: heightAlongRamp(span, x0, y0),
    tr: heightAlongRamp(span, x1, y0),
    br: heightAlongRamp(span, x1, y1),
    bl: heightAlongRamp(span, x0, y1),
  };
}
