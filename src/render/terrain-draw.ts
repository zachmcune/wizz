// Oblique terrain drawing helpers (render-only). Used by Renderer.buildTerrain.
import { Graphics } from 'pixi.js';
import { TILE } from '../core/constants';
import { projectGround } from '../core/coords';
import { getProjectionMode } from '../core/projection';
import type { MapData } from '../data/defs';
import { tileToWorld, worldToTileX, worldToTileY } from '../core/coords';
import { visualHeightAtTile } from './visual-height';

const CLIFF_LIFT = 14;

function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return tileToWorld(tx, ty);
}

function groundColor(tx: number, ty: number, blocked: boolean): number {
  if (blocked) return 0x342e44;
  return (tx + ty) % 2 === 0 ? 0x1a1826 : 0x1d1b2a;
}

function drawOrthoTerrain(g: Graphics, map: MapData): void {
  for (let ty = 0; ty < map.tileH; ty++) {
    for (let tx = 0; tx < map.tileW; tx++) {
      const blocked = map.tiles[ty * map.tileW + tx] === 1;
      const base = blocked ? 0x24202f : groundColor(tx, ty, false);
      g.rect(tx * TILE, ty * TILE, TILE, TILE).fill(base);
      if (blocked) g.rect(tx * TILE + 3, ty * TILE + 3, TILE - 6, TILE - 6).fill(0x342e44);
    }
  }
}

function drawGroundDiamond(g: Graphics, tx: number, ty: number, map: MapData, fill: number): void {
  const c = tileCenter(tx, ty);
  const h = visualHeightAtTile(map, tx, ty);
  const lift = h * 6;
  const hw = TILE * 0.48;
  const hh = TILE * 0.24;
  const top = projectGround({ x: c.x, y: c.y - hh - lift });
  const right = projectGround({ x: c.x + hw, y: c.y - lift });
  const bottom = projectGround({ x: c.x, y: c.y + hh - lift });
  const left = projectGround({ x: c.x - hw, y: c.y - lift });
  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]).fill(fill);
}

function drawCliffBlock(g: Graphics, tx: number, ty: number): void {
  const c = tileCenter(tx, ty);
  const hw = TILE * 0.48;
  const hh = TILE * 0.24;
  const topFill = 0x24202f;
  const wallFill = 0x1a1624;
  const wallDark = 0x12101c;

  const top = projectGround({ x: c.x, y: c.y - hh - CLIFF_LIFT });
  const right = projectGround({ x: c.x + hw, y: c.y - CLIFF_LIFT });
  const bottom = projectGround({ x: c.x, y: c.y + hh - CLIFF_LIFT });
  const left = projectGround({ x: c.x - hw, y: c.y - CLIFF_LIFT });
  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]).fill(topFill);

  const base = projectGround({ x: c.x, y: c.y });
  const baseR = projectGround({ x: c.x + hw, y: c.y });
  const baseB = projectGround({ x: c.x, y: c.y + hh });
  const baseL = projectGround({ x: c.x - hw, y: c.y });

  // South-east facing walls (toward +screen Y in oblique)
  g.poly([right.x, right.y, bottom.x, bottom.y, baseB.x, baseB.y, baseR.x, baseR.y]).fill(wallFill);
  g.poly([bottom.x, bottom.y, left.x, left.y, baseL.x, baseL.y, baseB.x, baseB.y]).fill(wallDark);
  g.poly([left.x, left.y, baseL.x, baseL.y, base.x, base.y, bottom.x, bottom.y]).fill(wallFill);
}

function isPassable(map: MapData, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return false;
  return map.tiles[ty * map.tileW + tx] === 0;
}

function drawObliqueTerrain(g: Graphics, map: MapData): void {
  // Ground layer (back to front for overlapping diamonds)
  for (let ty = 0; ty < map.tileH; ty++) {
    for (let tx = 0; tx < map.tileW; tx++) {
      if (map.tiles[ty * map.tileW + tx] !== 0) continue;
      drawGroundDiamond(g, tx, ty, map, groundColor(tx, ty, false));
    }
  }
  // Cliff blocks on impassable tiles adjacent to passable (or all blocked for borders)
  for (let ty = 0; ty < map.tileH; ty++) {
    for (let tx = 0; tx < map.tileW; tx++) {
      if (map.tiles[ty * map.tileW + tx] !== 1) continue;
      const nearOpen =
        isPassable(map, tx - 1, ty) ||
        isPassable(map, tx + 1, ty) ||
        isPassable(map, tx, ty - 1) ||
        isPassable(map, tx, ty + 1);
      if (nearOpen || tx === 0 || ty === 0 || tx === map.tileW - 1 || ty === map.tileH - 1) {
        drawCliffBlock(g, tx, ty);
      } else {
        drawGroundDiamond(g, tx, ty, map, 0x24202f);
      }
    }
  }
}

export function buildTerrainGraphics(map: MapData): Graphics {
  const g = new Graphics();
  if (getProjectionMode() === 'ortho') drawOrthoTerrain(g, map);
  else drawObliqueTerrain(g, map);
  return g;
}

/** Diamond fog tile in oblique mode; axis rect in ortho. */
export function drawFogTile(g: Graphics, map: MapData, tx: number, ty: number): void {
  if (getProjectionMode() === 'ortho') {
    g.rect(tx * TILE, ty * TILE, TILE, TILE);
    return;
  }
  const c = tileCenter(tx, ty);
  const h = visualHeightAtTile(map, tx, ty);
  const lift = h * 6;
  const hw = TILE * 0.48;
  const hh = TILE * 0.24;
  const top = projectGround({ x: c.x, y: c.y - hh - lift });
  const right = projectGround({ x: c.x + hw, y: c.y - lift });
  const bottom = projectGround({ x: c.x, y: c.y + hh - lift });
  const left = projectGround({ x: c.x - hw, y: c.y - lift });
  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]);
}

export function tileAtWorld(worldX: number, worldY: number): { tx: number; ty: number } {
  return { tx: worldToTileX(worldX), ty: worldToTileY(worldY) };
}
