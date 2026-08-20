// Oblique terrain drawing helpers (render-only). Used by Renderer.buildTerrain.
import { Graphics } from 'pixi.js';
import { TILE, TILE_BLOCKED, TILE_RAMP } from '../core/constants';
import type { MapData } from '../data/defs';
import { worldToTileX, worldToTileY } from '../core/coords';
import { visualCornerHeights, visualHeightAtTile } from './visual-height';
import { fogRunProjectedCorners, type FogRun } from './fog-draw';
import {
  dropWallQuadLifted,
  projectLiftedGround,
  projectedTileCorners,
  projectedTileCornersLifted,
  tileHeightLift,
  type CornerLifts,
} from './tile-project';

/** Impassable rock / map-border blocks sit one extra level above walkable high ground. */
const CLIFF_VISUAL_HEIGHT = 2;

const WALL_SE = 0x6b5340;
const WALL_SW = 0x3d3228;
const CLIFF_TOP = 0x3a3448;
const RIM_LIGHT = 0xd4e2f4;
const RIM_SHADE = 0x8a9bb4;
const RAMP_FILL = 0x7a5e48;
const RAMP_HATCH = 0xe0c09a;

export function terrainTopFill(tx: number, ty: number, height: number, ramp: boolean): number {
  if (ramp) return RAMP_FILL;
  if (height <= 0) return (tx + ty) % 2 === 0 ? 0x1a1826 : 0x1d1b2a;
  const even = (tx + ty) % 2 === 0;
  if (height === 1) return even ? 0x5a6a88 : 0x667694;
  return even ? 0x6d7c96 : 0x7a8aa4;
}

function uniformCorners(h: number): CornerLifts {
  return { tl: h, tr: h, br: h, bl: h };
}

function tileDrawCorners(map: MapData, tx: number, ty: number): CornerLifts {
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return uniformCorners(0);
  if (map.tiles[ty * map.tileW + tx] === TILE_BLOCKED) return uniformCorners(CLIFF_VISUAL_HEIGHT);
  const corners = visualCornerHeights(map, tx, ty);
  return {
    tl: tileHeightLift(corners.tl),
    tr: tileHeightLift(corners.tr),
    br: tileHeightLift(corners.br),
    bl: tileHeightLift(corners.bl),
  };
}

function drawGroundTile(g: Graphics, tx: number, ty: number, lift: number, fill: number): void {
  g.poly(projectedTileCorners(tx, ty, 1, 0, lift)).fill(fill);
}

function drawSlopedGroundTile(g: Graphics, tx: number, ty: number, lifts: CornerLifts, fill: number): void {
  g.poly(projectedTileCornersLifted(tx, ty, 1, 0, lifts)).fill(fill);
}

function edgeDrops(selfA: number, selfB: number, neighborA: number, neighborB: number): boolean {
  return selfA > neighborA + 0.001 || selfB > neighborB + 0.001;
}

function drawDropWalls(g: Graphics, map: MapData, tx: number, ty: number, self: CornerLifts): void {
  const se = tileDrawCorners(map, tx + 1, ty);
  const sw = tileDrawCorners(map, tx, ty + 1);
  if (edgeDrops(self.tr, self.br, se.tl, se.bl)) {
    g.poly(dropWallQuadLifted(tx, ty, self, se, 'se')).fill(WALL_SE);
  }
  if (edgeDrops(self.bl, self.br, sw.tl, sw.tr)) {
    g.poly(dropWallQuadLifted(tx, ty, self, sw, 'sw')).fill(WALL_SW);
  }
}

function strokeTileEdge(
  g: Graphics,
  tx: number,
  ty: number,
  edge: 'n' | 'e' | 's' | 'w',
  lift: number,
  color: number,
  width: number,
  alpha: number,
): void {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const x1 = x0 + TILE;
  const y1 = y0 + TILE;
  let ax = x0;
  let ay = y0;
  let bx = x1;
  let by = y0;
  if (edge === 'e') {
    ax = x1;
    ay = y0;
    bx = x1;
    by = y1;
  } else if (edge === 's') {
    ax = x0;
    ay = y1;
    bx = x1;
    by = y1;
  } else if (edge === 'w') {
    ax = x0;
    ay = y0;
    bx = x0;
    by = y1;
  }
  const a = projectLiftedGround(ax, ay, lift);
  const b = projectLiftedGround(bx, by, lift);
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, alpha, cap: 'round' });
}

function maxCorner(c: CornerLifts): number {
  return Math.max(c.tl, c.tr, c.br, c.bl);
}

function drawRaisedRim(g: Graphics, map: MapData, tx: number, ty: number, self: CornerLifts): void {
  const h = maxCorner(self);
  if (h <= 0) return;
  if (maxCorner(tileDrawCorners(map, tx, ty - 1)) < h) strokeTileEdge(g, tx, ty, 'n', self.tl, RIM_LIGHT, 1.8, 0.95);
  if (maxCorner(tileDrawCorners(map, tx - 1, ty)) < h) strokeTileEdge(g, tx, ty, 'w', self.tl, RIM_LIGHT, 1.5, 0.72);
  if (maxCorner(tileDrawCorners(map, tx + 1, ty)) < h) strokeTileEdge(g, tx, ty, 'e', self.tr, RIM_SHADE, 1.4, 0.7);
  if (maxCorner(tileDrawCorners(map, tx, ty + 1)) < h) strokeTileEdge(g, tx, ty, 's', self.bl, RIM_SHADE, 1.6, 0.85);
}

function drawRampHatch(g: Graphics, tx: number, ty: number, lifts: CornerLifts): void {
  const pad = 7;
  const x0 = tx * TILE + pad;
  const y0 = ty * TILE + pad;
  const x1 = (tx + 1) * TILE - pad;
  const y1 = (ty + 1) * TILE - pad;
  const slopeX = Math.abs(lifts.tr - lifts.tl) + Math.abs(lifts.br - lifts.bl);
  const slopeY = Math.abs(lifts.bl - lifts.tl) + Math.abs(lifts.br - lifts.tr);
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    if (slopeX >= slopeY) {
      const x = tx * TILE + TILE * t;
      const h0 = lifts.tl + (lifts.tr - lifts.tl) * t;
      const h1 = lifts.bl + (lifts.br - lifts.bl) * t;
      const a = projectLiftedGround(x, y0, h0);
      const b = projectLiftedGround(x, y1, h1);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.35, color: RAMP_HATCH, alpha: 0.62, cap: 'round' });
    } else {
      const y = ty * TILE + TILE * t;
      const h0 = lifts.tl + (lifts.bl - lifts.tl) * t;
      const h1 = lifts.tr + (lifts.br - lifts.tr) * t;
      const a = projectLiftedGround(x0, y, h0);
      const b = projectLiftedGround(x1, y, h1);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.35, color: RAMP_HATCH, alpha: 0.62, cap: 'round' });
    }
  }
}

function drawCliffBlock(g: Graphics, tx: number, ty: number): void {
  const topH = CLIFF_VISUAL_HEIGHT;
  const self = uniformCorners(topH);
  const ground = uniformCorners(0);
  g.poly(dropWallQuadLifted(tx, ty, self, ground, 'se')).fill(WALL_SE);
  g.poly(dropWallQuadLifted(tx, ty, self, ground, 'sw')).fill(WALL_SW);
  g.poly(projectedTileCorners(tx, ty, 1, 0, topH)).fill(CLIFF_TOP);
}

function isPassable(map: MapData, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return false;
  const code = map.tiles[ty * map.tileW + tx] ?? 0;
  return code !== TILE_BLOCKED;
}

function drawObliqueTerrain(g: Graphics, map: MapData): void {
  for (let ty = 0; ty < map.tileH; ty++) {
    for (let tx = 0; tx < map.tileW; tx++) {
      const code = map.tiles[ty * map.tileW + tx] ?? 0;
      if (code === TILE_BLOCKED) {
        const nearOpen =
          isPassable(map, tx - 1, ty) ||
          isPassable(map, tx + 1, ty) ||
          isPassable(map, tx, ty - 1) ||
          isPassable(map, tx, ty + 1);
        if (nearOpen || tx === 0 || ty === 0 || tx === map.tileW - 1 || ty === map.tileH - 1) {
          drawCliffBlock(g, tx, ty);
        } else {
          drawGroundTile(g, tx, ty, CLIFF_VISUAL_HEIGHT, CLIFF_TOP);
        }
        continue;
      }
      const h = visualHeightAtTile(map, tx, ty);
      const lifts = tileDrawCorners(map, tx, ty);
      drawDropWalls(g, map, tx, ty, lifts);
      if (code === TILE_RAMP) {
        drawSlopedGroundTile(g, tx, ty, lifts, terrainTopFill(tx, ty, h, true));
        drawRampHatch(g, tx, ty, lifts);
      } else {
        drawGroundTile(g, tx, ty, tileHeightLift(h), terrainTopFill(tx, ty, h, false));
        if (h > 0) drawRaisedRim(g, map, tx, ty, lifts);
      }
    }
  }
}

export function buildTerrainGraphics(map: MapData): Graphics {
  const g = new Graphics();
  drawObliqueTerrain(g, map);
  return g;
}

export function fogRunLift(map: MapData, run: FogRun, _cheap = false): number {
  let lift = 0;
  for (let i = 0; i < run.tw; i++) {
    const h = visualHeightAtTile(map, run.tx + i, run.ty);
    if (tileHeightLift(h) > lift) lift = tileHeightLift(h);
  }
  return lift;
}

/** Tile-AABB fog as a projected parallelogram. */
export function drawFogTile(g: Graphics, map: MapData, tx: number, ty: number): void {
  drawFogRun(g, map, { tx, ty, tw: 1 }, false);
}

/** One merged fog span. Uses the projected tile rectangle so rows share edges. */
export function drawFogRun(g: Graphics, map: MapData, run: FogRun, cheap: boolean): void {
  g.poly(fogRunProjectedCorners(run.tx, run.ty, run.tw, fogRunLift(map, run, cheap)));
}

export function tileAtWorld(worldX: number, worldY: number): { tx: number; ty: number } {
  return { tx: worldToTileX(worldX), ty: worldToTileY(worldY) };
}
