// Shared projected tile quads for terrain, fog, and the build-zone overlay.
import { TILE } from '../core/constants';
import { projectGround, type Vec2 } from '../core/coords';

/** Visual-height units used by fog/terrain/placement so ground overlays share one plane. */
export function tileHeightLift(visualHeight: number): number {
  return visualHeight;
}

/** Project a ground point using the same visual-height lift as units and buildings. */
export function projectLiftedGround(worldX: number, worldY: number, lift = 0): Vec2 {
  return projectGround({ x: worldX, y: worldY }, lift);
}

/** Projected parallelogram of a tile (or a horizontal span) after optional inset and height lift. */
export function projectedTileCorners(tx: number, ty: number, tw = 1, inset = 0, lift = 0): number[] {
  const x0 = tx * TILE + inset;
  const y0 = ty * TILE + inset;
  const x1 = (tx + tw) * TILE - inset;
  const y1 = (ty + 1) * TILE - inset;
  const tl = projectLiftedGround(x0, y0, lift);
  const tr = projectLiftedGround(x1, y0, lift);
  const br = projectLiftedGround(x1, y1, lift);
  const bl = projectLiftedGround(x0, y1, lift);
  return [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y];
}

export function projectedTileCenter(tx: number, ty: number, lift = 0): Vec2 {
  return projectLiftedGround(tx * TILE + TILE / 2, ty * TILE + TILE / 2, lift);
}

export type DropWallSide = 'se' | 'sw';

/**
 * Camera-facing wall between two height levels on one tile edge.
 * `se` is the +X (right) face; `sw` is the +Y (bottom) face.
 */
export function dropWallQuad(
  tx: number,
  ty: number,
  topHeight: number,
  botHeight: number,
  side: DropWallSide,
): number[] {
  const top = projectedTileCorners(tx, ty, 1, 0, topHeight);
  const bot = projectedTileCorners(tx, ty, 1, 0, botHeight);
  if (side === 'se') {
    return [top[2]!, top[3]!, top[4]!, top[5]!, bot[4]!, bot[5]!, bot[2]!, bot[3]!];
  }
  return [top[4]!, top[5]!, top[6]!, top[7]!, bot[6]!, bot[7]!, bot[4]!, bot[5]!];
}
