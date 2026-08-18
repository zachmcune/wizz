// Fog geometry helpers (no Pixi). Viewport-cull and merge consecutive fogged tiles
// so the renderer is not rebuilding 10k+ polygons every frame.
import { TILE } from '../core/constants';

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
  projectionMode: string,
): string {
  return `${fingerprint}:${bounds.minTx}:${bounds.maxTx}:${bounds.minTy}:${bounds.maxTy}:${cheapFog ? 1 : 0}:${projectionMode}`;
}
