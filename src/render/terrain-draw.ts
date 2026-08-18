// Oblique terrain drawing helpers (render-only). Used by Renderer.buildTerrain.
import { Graphics } from 'pixi.js';
import { TILE_BLOCKED, TILE_RAMP } from '../core/constants';
import type { MapData } from '../data/defs';
import { worldToTileX, worldToTileY } from '../core/coords';
import { visualHeightAtTile } from './visual-height';
import { fogRunProjectedCorners, type FogRun } from './fog-draw';
import { projectedTileCorners, tileHeightLift } from './tile-project';

const CLIFF_LIFT = 14;

function groundColor(tx: number, ty: number, blocked: boolean): number {
  if (blocked) return 0x342e44;
  return (tx + ty) % 2 === 0 ? 0x1a1826 : 0x1d1b2a;
}

function drawGroundTile(g: Graphics, tx: number, ty: number, map: MapData, fill: number): void {
  const lift = tileHeightLift(visualHeightAtTile(map, tx, ty));
  g.poly(projectedTileCorners(tx, ty, 1, 0.5, lift)).fill(fill);
}

function drawCliffBlock(g: Graphics, tx: number, ty: number): void {
  const topFill = 0x24202f;
  const wallFill = 0x1a1624;
  const wallDark = 0x12101c;
  const top = projectedTileCorners(tx, ty, 1, 0, CLIFF_LIFT);
  const base = projectedTileCorners(tx, ty, 1, 0, 0);
  const trx = top[2]!;
  const try_ = top[3]!;
  const brx = top[4]!;
  const bry = top[5]!;
  const blx = top[6]!;
  const bly = top[7]!;
  const btrx = base[2]!;
  const btry = base[3]!;
  const bbrx = base[4]!;
  const bbry = base[5]!;
  const bblx = base[6]!;
  const bbly = base[7]!;

  g.poly(top).fill(topFill);
  // South-east / south-west faces (toward +screen Y in oblique).
  g.poly([trx, try_, brx, bry, bbrx, bbry, btrx, btry]).fill(wallFill);
  g.poly([brx, bry, blx, bly, bblx, bbly, bbrx, bbry]).fill(wallDark);
}

function isPassable(map: MapData, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return false;
  const code = map.tiles[ty * map.tileW + tx] ?? 0;
  return code !== TILE_BLOCKED;
}

function drawObliqueTerrain(g: Graphics, map: MapData): void {
  // Ground layer (back to front so raised tiles overlap correctly)
  for (let ty = 0; ty < map.tileH; ty++) {
    for (let tx = 0; tx < map.tileW; tx++) {
      const code = map.tiles[ty * map.tileW + tx] ?? 0;
      if (code === TILE_BLOCKED) continue;
      const fill = code === TILE_RAMP ? 0x4a3e2c : groundColor(tx, ty, false);
      drawGroundTile(g, tx, ty, map, fill);
    }
  }
  // Cliff blocks on impassable tiles adjacent to passable (or all blocked for borders)
  for (let ty = 0; ty < map.tileH; ty++) {
    for (let tx = 0; tx < map.tileW; tx++) {
      if (map.tiles[ty * map.tileW + tx] !== TILE_BLOCKED) continue;
      const nearOpen =
        isPassable(map, tx - 1, ty) ||
        isPassable(map, tx + 1, ty) ||
        isPassable(map, tx, ty - 1) ||
        isPassable(map, tx, ty + 1);
      if (nearOpen || tx === 0 || ty === 0 || tx === map.tileW - 1 || ty === map.tileH - 1) {
        drawCliffBlock(g, tx, ty);
      } else {
        drawGroundTile(g, tx, ty, map, 0x24202f);
      }
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
