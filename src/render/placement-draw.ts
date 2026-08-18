// Ground-aligned placement overlay (projected quads). Render-only.
import { Graphics } from 'pixi.js';
import { TILE } from '../core/constants';
import type { BuildZoneTile, PlacementCell, PlacementCellKind } from '../sim/placement-preview';
import { projectLiftedGround, projectedTileCorners } from './tile-project';

const OPEN_FILL = 0x5dff8f;
const NODE_FILL = 0xffd166;
const EDGE_STROKE = 0x8cffb4;

const CELL_FILL: Record<PlacementCellKind, number> = {
  ok: 0x5dff8f,
  blocked: 0xff5d5d,
  node: 0xffd166,
  range: 0x8b6cff,
  cliff: 0xff9f43,
};

const CELL_STROKE: Record<PlacementCellKind, number> = {
  ok: 0xc8ffd8,
  blocked: 0xffc0c0,
  node: 0xffe8a8,
  range: 0xc8b8ff,
  cliff: 0xffd8a8,
};

function appendTileQuad(g: Graphics, tx: number, ty: number, inset: number, lift: number): void {
  g.poly(projectedTileCorners(tx, ty, 1, inset, lift));
}

function strokeEdge(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lift: number,
  color: number,
  alpha: number,
  width: number,
): void {
  const a = projectLiftedGround(x1, y1, lift);
  const b = projectLiftedGround(x2, y2, lift);
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, alpha, cap: 'round' });
}

export function drawBuildZoneTiles(
  g: Graphics,
  tiles: readonly BuildZoneTile[],
  inView: (tx: number, ty: number) => boolean,
  liftAt: (tx: number, ty: number) => number,
): void {
  const present = new Set<number>();
  for (const t of tiles) present.add(((t.ty + 512) << 12) | (t.tx + 512));

  for (const t of tiles) {
    if (!inView(t.tx, t.ty)) continue;
    const lift = liftAt(t.tx, t.ty);
    if (t.kind === 'open') {
      appendTileQuad(g, t.tx, t.ty, 1.5, lift);
      g.fill({ color: OPEN_FILL, alpha: 0.16 });
    } else if (t.kind === 'node') {
      appendTileQuad(g, t.tx, t.ty, 1.5, lift);
      g.fill({ color: NODE_FILL, alpha: 0.22 });
    }
  }

  for (const t of tiles) {
    if (!inView(t.tx, t.ty)) continue;
    const lift = liftAt(t.tx, t.ty);
    const x0 = t.tx * TILE;
    const y0 = t.ty * TILE;
    const x1 = x0 + TILE;
    const y1 = y0 + TILE;
    const has = (dx: number, dy: number) => present.has(((t.ty + dy + 512) << 12) | (t.tx + dx + 512));
    if (!has(0, -1)) strokeEdge(g, x0, y0, x1, y0, lift, EDGE_STROKE, 0.55, 1.5);
    if (!has(0, 1)) strokeEdge(g, x0, y1, x1, y1, lift, EDGE_STROKE, 0.55, 1.5);
    if (!has(-1, 0)) strokeEdge(g, x0, y0, x0, y1, lift, EDGE_STROKE, 0.55, 1.5);
    if (!has(1, 0)) strokeEdge(g, x1, y0, x1, y1, lift, EDGE_STROKE, 0.55, 1.5);
  }
}

export function drawPlacementCells(
  g: Graphics,
  cells: readonly PlacementCell[],
  liftAt: (tx: number, ty: number) => number,
): void {
  for (const cell of cells) {
    const lift = liftAt(cell.tx, cell.ty);
    appendTileQuad(g, cell.tx, cell.ty, 1, lift);
    g.fill({ color: CELL_FILL[cell.kind], alpha: cell.kind === 'ok' ? 0.4 : 0.46 });
    appendTileQuad(g, cell.tx, cell.ty, 1, lift);
    g.stroke({ width: 1.75, color: CELL_STROKE[cell.kind], alpha: 0.95 });
  }
}
