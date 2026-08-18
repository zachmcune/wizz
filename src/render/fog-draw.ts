// Fog geometry helpers (no Pixi). Viewport-cull and merge consecutive fogged tiles
// so the renderer is not rebuilding 10k+ polygons every frame.
import { TILE } from '../core/constants';
import { projectGround, screenToWorld, type CameraView } from '../core/coords';

export interface FogRun {
  tx: number;
  ty: number;
  tw: number;
}

export interface TileBounds {
  minTx: number;
  maxTx: number;
  minTy: number;
  maxTy: number;
}

/** Dark veil — light silver washed the dark map into a bright diamond grid. */
export const FOG_FILL_COLOR = 0x0a0812;
export const FOG_FILL_ALPHA = 0.62;

/** Inclusive tile range covering a world-space rectangle, padded by `padTiles`. */
export function visibleTileBounds(
  worldX: number,
  worldY: number,
  worldW: number,
  worldH: number,
  padTiles: number,
  tileW: number,
  tileH: number,
): TileBounds {
  const pad = padTiles * TILE;
  return {
    minTx: Math.max(0, Math.floor((worldX - pad) / TILE)),
    maxTx: Math.min(tileW - 1, Math.floor((worldX + worldW + pad) / TILE)),
    minTy: Math.max(0, Math.floor((worldY - pad) / TILE)),
    maxTy: Math.min(tileH - 1, Math.floor((worldY + worldH + pad) / TILE)),
  };
}

/**
 * World-space AABB of the pixels currently on screen.
 * `Camera.visibleWorldRect()` is the camera-origin rectangle and misses most of
 * the 2.5D viewport (the visible region is a parallelogram).
 */
export function visibleWorldAabb(
  cam: CameraView,
  viewW: number,
  viewH: number,
): { x: number; y: number; w: number; h: number } {
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

/** Horizontal runs of fogged tiles inside `bounds` (inclusive). */
export function collectFogRuns(
  isFogged: (tileIdx: number) => boolean,
  w: number,
  h: number,
  bounds: TileBounds,
): FogRun[] {
  const runs: FogRun[] = [];
  const x0 = Math.max(0, bounds.minTx);
  const x1 = Math.min(w - 1, bounds.maxTx);
  const y0 = Math.max(0, bounds.minTy);
  const y1 = Math.min(h - 1, bounds.maxTy);
  if (x1 < x0 || y1 < y0) return runs;

  for (let ty = y0; ty <= y1; ty++) {
    const row = ty * w;
    let tx = x0;
    while (tx <= x1) {
      if (!isFogged(row + tx)) {
        tx++;
        continue;
      }
      const start = tx;
      tx++;
      while (tx <= x1 && isFogged(row + tx)) tx++;
      runs.push({ tx: start, ty, tw: tx - start });
    }
  }
  return runs;
}

/**
 * Projected parallelogram covering the tile-AABB for `tw` tiles on one row.
 * Matches the linear oblique projection of the sim tile square (no diamond gaps).
 */
export function fogRunProjectedCorners(tx: number, ty: number, tw: number, lift = 0): number[] {
  const x0 = tx * TILE;
  const y0 = ty * TILE - lift;
  const x1 = (tx + tw) * TILE;
  const y1 = (ty + 1) * TILE - lift;
  const tl = projectGround({ x: x0, y: y0 });
  const tr = projectGround({ x: x1, y: y0 });
  const br = projectGround({ x: x1, y: y1 });
  const bl = projectGround({ x: x0, y: y1 });
  return [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y];
}

/** Cheap checksum so fog geometry can be cached until vision or the view changes. */
export function visibilityFingerprint(visible: readonly number[]): number {
  let h = visible.length | 0;
  for (let i = 0; i < visible.length; i++) {
    h = (Math.imul(h, 33) + (visible[i] ?? 0)) | 0;
  }
  return h;
}

export function fogGeometryKey(
  fingerprint: number,
  bounds: TileBounds,
  cheapFog: boolean,
): string {
  return `${fingerprint}:${bounds.minTx}:${bounds.maxTx}:${bounds.minTy}:${bounds.maxTy}:${cheapFog ? 1 : 0}`;
}
