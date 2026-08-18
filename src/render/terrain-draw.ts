// Oblique terrain drawing helpers (render-only). Used by Renderer.buildTerrain.
import { Graphics } from 'pixi.js';
import { TILE, TILE_BLOCKED, TILE_RAMP } from '../core/constants';
import type { MapData } from '../data/defs';
import { worldToTileX, worldToTileY } from '../core/coords';
import { visualHeightAtTile } from './visual-height';
import { fogRunProjectedCorners, type FogRun } from './fog-draw';
import {
  dropWallQuad,
  projectLiftedGround,
  projectedTileCorners,
  tileHeightLift,
} from './tile-project';

/** Impassable rock / map-border blocks sit one extra level above walkable high ground. */
const CLIFF_VISUAL_HEIGHT = 2;

const WALL_SE = 0x2a2438;
const WALL_SW = 0x15121c;
const CLIFF_TOP = 0x2c2838;
const RIM_LIGHT = 0xb8c6de;
const RIM_SHADE = 0x6d7c96;
const RAMP_FILL = 0x6b5340;
const RAMP_HATCH = 0xc4a07a;

export function terrainTopFill(tx: number, ty: number, height: number, ramp: boolean): number {
  if (ramp) return RAMP_FILL;
  if (height <= 0) return (tx + ty) % 2 === 0 ? 0x1a1826 : 0x1d1b2a;
  const even = (tx + ty) % 2 === 0;
  if (height === 1) return even ? 0x3c465c : 0x454f68;
  return even ? 0x4c5870 : 0x56627c;
}

function neighborDrawHeight(map: MapData, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return 0;
  if (map.tiles[ty * map.tileW + tx] === TILE_BLOCKED) return CLIFF_VISUAL_HEIGHT;
  return visualHeightAtTile(map, tx, ty);
}

function drawGroundTile(g: Graphics, tx: number, ty: number, lift: number, fill: number): void {
  g.poly(projectedTileCorners(tx, ty, 1, 0, lift)).fill(fill);
}

function drawDropWalls(g: Graphics, map: MapData, tx: number, ty: number, topH: number): void {
  if (topH <= 0) return;
  const se = neighborDrawHeight(map, tx + 1, ty);
  const sw = neighborDrawHeight(map, tx, ty + 1);
  if (topH > se) g.poly(dropWallQuad(tx, ty, topH, se, 'se')).fill(WALL_SE);
  if (topH > sw) g.poly(dropWallQuad(tx, ty, topH, sw, 'sw')).fill(WALL_SW);
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

function drawRaisedRim(g: Graphics, map: MapData, tx: number, ty: number, h: number): void {
  if (neighborDrawHeight(map, tx, ty - 1) < h) strokeTileEdge(g, tx, ty, 'n', h, RIM_LIGHT, 1.8, 0.95);
  if (neighborDrawHeight(map, tx - 1, ty) < h) strokeTileEdge(g, tx, ty, 'w', h, RIM_LIGHT, 1.5, 0.72);
  if (neighborDrawHeight(map, tx + 1, ty) < h) strokeTileEdge(g, tx, ty, 'e', h, RIM_SHADE, 1.4, 0.7);
  if (neighborDrawHeight(map, tx, ty + 1) < h) strokeTileEdge(g, tx, ty, 's', h, RIM_SHADE, 1.6, 0.85);
}

function drawRampHatch(g: Graphics, tx: number, ty: number, h: number): void {
  const pad = 7;
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const y = ty * TILE + TILE * t;
    const a = projectLiftedGround(tx * TILE + pad, y, h);
    const b = projectLiftedGround((tx + 1) * TILE - pad, y, h);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.35, color: RAMP_HATCH, alpha: 0.62, cap: 'round' });
  }
}

function drawCliffBlock(g: Graphics, tx: number, ty: number): void {
  const topH = CLIFF_VISUAL_HEIGHT;
  g.poly(dropWallQuad(tx, ty, topH, 0, 'se')).fill(WALL_SE);
  g.poly(dropWallQuad(tx, ty, topH, 0, 'sw')).fill(WALL_SW);
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
      const lift = tileHeightLift(h);
      drawDropWalls(g, map, tx, ty, lift);
      drawGroundTile(g, tx, ty, lift, terrainTopFill(tx, ty, h, code === TILE_RAMP));
      if (h > 0) drawRaisedRim(g, map, tx, ty, lift);
      if (code === TILE_RAMP) drawRampHatch(g, tx, ty, lift);
    }
  }
}

export function buildTerrainGraphics(map: MapData): Graphics {
  const g = new Graphics();
  drawObliqueTerrain(g, map);
  return g;
}

function fogRunLift(map: MapData, run: FogRun, cheap: boolean): number {
  if (cheap) return 0;
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
