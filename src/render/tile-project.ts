// Shared projected tile quads for terrain, fog, and the build-zone overlay.
import { TILE } from '../core/constants';
import { projectGround, type Vec2 } from '../core/coords';

/** World-Y lift used by fog/terrain/placement so ground overlays share one plane. */
export function tileHeightLift(visualHeight: number): number {
  return visualHeight * 6;
}

export function projectLiftedGround(worldX: number, worldY: number, lift = 0): Vec2 {
  return projectGround({ x: worldX, y: worldY - lift });
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
