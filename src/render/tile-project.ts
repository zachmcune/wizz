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

export interface CornerLifts {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/** Projected parallelogram of a tile (or a horizontal span) after optional inset and height lift. */
export function projectedTileCorners(tx: number, ty: number, tw = 1, inset = 0, lift = 0): number[] {
  return projectedTileCornersLifted(tx, ty, tw, inset, { tl: lift, tr: lift, br: lift, bl: lift });
}

/** Projected tile quad when each corner sits at its own visual height (ramps). */
export function projectedTileCornersLifted(
  tx: number,
  ty: number,
  tw: number,
  inset: number,
  lifts: CornerLifts,
): number[] {
  const x0 = tx * TILE + inset;
  const y0 = ty * TILE + inset;
  const x1 = (tx + tw) * TILE - inset;
  const y1 = (ty + 1) * TILE - inset;
  const tl = projectLiftedGround(x0, y0, lifts.tl);
  const tr = projectLiftedGround(x1, y0, lifts.tr);
  const br = projectLiftedGround(x1, y1, lifts.br);
  const bl = projectLiftedGround(x0, y1, lifts.bl);
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
  return dropWallQuadLifted(
    tx,
    ty,
    { tl: topHeight, tr: topHeight, br: topHeight, bl: topHeight },
    { tl: botHeight, tr: botHeight, br: botHeight, bl: botHeight },
    side,
  );
}

/**
 * Camera-facing wall between this tile's corners and the neighbor's matching edge.
 * `se` uses this tile's east edge vs the east neighbor's west edge;
 * `sw` uses this tile's south edge vs the south neighbor's north edge.
 */
export function dropWallQuadLifted(
  tx: number,
  ty: number,
  self: CornerLifts,
  neighbor: CornerLifts,
  side: DropWallSide,
): number[] {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const x1 = x0 + TILE;
  const y1 = y0 + TILE;
  if (side === 'se') {
    const topTr = projectLiftedGround(x1, y0, self.tr);
    const topBr = projectLiftedGround(x1, y1, self.br);
    const botBr = projectLiftedGround(x1, y1, neighbor.bl);
    const botTr = projectLiftedGround(x1, y0, neighbor.tl);
    return [topTr.x, topTr.y, topBr.x, topBr.y, botBr.x, botBr.y, botTr.x, botTr.y];
  }
  const topBl = projectLiftedGround(x0, y1, self.bl);
  const topBr = projectLiftedGround(x1, y1, self.br);
  const botBr = projectLiftedGround(x1, y1, neighbor.tr);
  const botBl = projectLiftedGround(x0, y1, neighbor.tl);
  return [topBl.x, topBl.y, topBr.x, topBr.y, botBr.x, botBr.y, botBl.x, botBl.y];
}
