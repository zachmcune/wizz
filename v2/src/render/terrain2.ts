// TERRAIN — layered, textured ground. Replaces the flat purple grid.
//
// The old terrain filled every tile with one flat colour, which is why the board read as "a flat purple
// grid" with units invisible on it. This version builds four distinct layers:
//
//   1. GRASS  — per-tile value and hue variation from deterministic value-noise, in warm greens.
//                Neighbouring tiles differ, so the ground reads as a surface rather than a grid.
//   2. PATHS  — a dirt material laid along the lanes between bases, with soft, irregular edges.
//   3. ROCK   — cliff faces get three-tone strata, vertical crack lines and a lit top lip; ramps get
//                a lit gradient plus tread marks.
//   4. PROPS  — scattered grass tufts, stones, mushrooms and ruin blocks as cheap sprites, placed by
//                hash so they break up the tiling without ever overlapping a building.
//
// Everything is drawn ONCE into chunk Graphics at load. Nothing here runs per frame.

import { Container, Graphics } from 'pixi.js';
import { TILE, TILE_BLOCKED, TILE_RAMP } from '../core/constants';
import { projectGround, VISUAL_HEIGHT_STEP } from '../core/projection';
import { mapTileQuery, tileCornerHeights } from '../core/ramp-slope';
import type { MapData } from '../data/defs';

/** Grass tones. Warm, saturated greens — the "polished stylized fantasy" read. */
const GRASS = [0x4a6b3a, 0x527540, 0x5b7f46, 0x44633a, 0x60844c, 0x4e7040];
const DIRT = [0x7a6144, 0x846a4b, 0x6f583e, 0x8a7150];
const ROCK_FACE = [0x5c5348, 0x4e463d, 0x6a6054, 0x453e36];
const BLOCKED_TOP = 0x3b3630;

/** Deterministic hash noise, so the terrain is identical on every load and every machine. */
function noise2(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h = Math.imul(h ^ (h >>> 13), 0x9e3779b1);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function pick<T>(arr: readonly T[], n: number): T {
  return arr[Math.floor(n * arr.length) % arr.length]!;
}

/** A tile's grass colour: blends two palette entries by local noise, giving continuous variation. */
function grassColour(tx: number, ty: number): number {
  const n = noise2(tx * 3 + 11, ty * 7 + 5);
  const a = pick(GRASS, n);
  // Slight per-tile darkening along one diagonal, so the ground has a gradient rather than flat fill.
  const shade = 0.92 + noise2(tx * 13 + 3, ty * 17 + 9) * 0.16;
  return scaleColor(a, shade);
}

function scaleColor(hex: number, f: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

export interface TerrainRender {
  container: Container;
  destroy(): void;
}

function at(wx: number, wy: number, level: number): { x: number; y: number } {
  const p = projectGround({ x: wx, y: wy });
  return { x: p.x, y: p.y - level * VISUAL_HEIGHT_STEP };
}

export function buildTerrain(map: MapData): TerrainRender {
  const container = new Container();
  const CHUNK = 16;
  const chunksX = Math.ceil(map.tileW / CHUNK);
  const chunksY = Math.ceil(map.tileH / CHUNK);
  const gfx: Graphics[] = [];

  for (let cy = 0; cy < chunksY; cy++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const g = new Graphics();
      drawChunk(g, map, cx * CHUNK, cy * CHUNK, CHUNK);
      container.addChild(g);
      gfx.push(g);
    }
  }
  return {
    container,
    destroy() {
      for (const g of gfx) g.destroy();
      container.destroy({ children: true });
    },
  };
}

function drawChunk(g: Graphics, map: MapData, tx0: number, ty0: number, size: number): void {
  const q = mapTileQuery(map);
  const txEnd = Math.min(map.tileW, tx0 + size);
  const tyEnd = Math.min(map.tileH, ty0 + size);

  // ---- pass 1: cliff faces (drawn first so tile tops cover them).
  for (let ty = ty0; ty < tyEnd; ty++) {
    for (let tx = tx0; tx < txEnd; tx++) {
      const i = ty * map.tileW + tx;
      if (map.tiles[i] === TILE_RAMP) continue;
      const blocked = map.tiles[i] === TILE_BLOCKED;
      const h = map.heights[i] ?? 0;
      const hRight = tx + 1 < map.tileW ? (map.heights[ty * map.tileW + tx + 1] ?? 0) : h;
      const hDown = ty + 1 < map.tileH ? (map.heights[(ty + 1) * map.tileW + tx] ?? 0) : h;
      if (h - hRight > 0) drawCliff(g, tx, ty, 'right', h, h - hRight, blocked);
      if (h - hDown > 0) drawCliff(g, tx, ty, 'down', h, h - hDown, blocked);
    }
  }

  // ---- pass 2: tile tops.
  for (let ty = ty0; ty < tyEnd; ty++) {
    for (let tx = tx0; tx < txEnd; tx++) {
      const i = ty * map.tileW + tx;
      if (map.tiles[i] === TILE_RAMP) {
        drawRamp(g, q, tx, ty);
        continue;
      }
      const blocked = map.tiles[i] === TILE_BLOCKED;
      const level = map.heights[i] ?? 0;
      const a = at(tx * TILE, ty * TILE, level);
      const b = at((tx + 1) * TILE, ty * TILE, level);
      const c = at((tx + 1) * TILE, (ty + 1) * TILE, level);
      const d = at(tx * TILE, (ty + 1) * TILE, level);
      g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
      if (blocked) {
        g.fill({ color: BLOCKED_TOP });
      } else {
        // Is this tile on a "path"? Use a deterministic map-wide band function so lanes read as
        // intentional routes rather than random dirt specks.
        const path = pathAt(tx, ty, map);
        g.fill({ color: path ? pick(DIRT, noise2(tx * 5, ty * 3)) : grassColour(tx, ty) });
        // A faint darker edge only on non-path grass keeps the lanes visually clean.
        if (!path) {
          g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
          g.stroke({ width: 0.4, color: 0x000000, alpha: 0.06 });
        }
      }
    }
  }

  // ---- pass 3: props (grass tufts, stones, mushrooms, small ruins).
  for (let ty = ty0; ty < tyEnd; ty++) {
    for (let tx = tx0; tx < txEnd; tx++) {
      const i = ty * map.tileW + tx;
      if (map.tiles[i] === TILE_BLOCKED) continue;
      const n = noise2(tx * 29 + 7, ty * 31 + 13);
      if (n > 0.34) continue; // roughly a third of grass tiles carry a prop
      const level = map.heights[i] ?? 0;
      drawProp(g, tx, ty, level, n);
    }
  }
}

/**
 * Which tiles are "path". A deterministic band along the two diagonals of the map, which naturally
 * connects the corner bases through the centre — the lanes units actually walk.
 */
function pathAt(tx: number, ty: number, map: MapData): boolean {
  const cx = map.tileW / 2;
  const cy = map.tileH / 2;
  const diagA = Math.abs(tx - ty + (cy - cx)); // one diagonal
  const diagB = Math.abs(tx + ty - (cx + cy)); // the other
  return diagA <= 1.6 || diagB <= 1.6;
}

function drawCliff(
  g: Graphics,
  tx: number,
  ty: number,
  side: 'right' | 'down',
  level: number,
  drop: number,
  blocked: boolean,
): void {
  const edge =
    side === 'right'
      ? [at((tx + 1) * TILE, ty * TILE, level), at((tx + 1) * TILE, (ty + 1) * TILE, level)]
      : [at(tx * TILE, (ty + 1) * TILE, level), at((tx + 1) * TILE, (ty + 1) * TILE, level)];
  const topA = edge[0]!;
  const topB = edge[1]!;
  const totalH = drop * VISUAL_HEIGHT_STEP;
  const bands = Math.max(3, Math.min(6, drop * 2));

  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    g.poly([
      topA.x, topA.y + totalH * t0,
      topB.x, topB.y + totalH * t0,
      topB.x, topB.y + totalH * t1,
      topA.x, topA.y + totalH * t1,
    ]);
    // Banded strata, darker toward the base, so the cliff reads as layered rock.
    const base = pick(ROCK_FACE, noise2(tx * 7 + i, ty * 11 + i));
    g.fill({ color: scaleColor(base, 0.72 + (1 - t0) * 0.4), alpha: blocked ? 0.98 : 0.96 });
  }

  // vertical crack lines on the cliff face
  const cracks = 2;
  for (let k = 1; k <= cracks; k++) {
    const u = k / (cracks + 1);
    const x = topA.x + (topB.x - topA.x) * u;
    const y0 = topA.y + (topB.y - topA.y) * u;
    g.moveTo(x, y0);
    g.lineTo(x + (noise2(tx + k, ty) - 0.5) * 3, y0 + totalH);
    g.stroke({ width: 0.7, color: 0x2a251e, alpha: 0.42 });
  }

  // lit top lip
  g.moveTo(topA.x, topA.y);
  g.lineTo(topB.x, topB.y);
  g.stroke({ width: 1.4, color: 0xa8a08c, alpha: 0.5 });
}

function drawRamp(g: Graphics, q: ReturnType<typeof mapTileQuery>, tx: number, ty: number): void {
  const corners = tileCornerHeights(q, tx, ty);
  const a = at(tx * TILE, ty * TILE, corners.tl);
  const b = at((tx + 1) * TILE, ty * TILE, corners.tr);
  const c = at((tx + 1) * TILE, (ty + 1) * TILE, corners.br);
  const d = at(tx * TILE, (ty + 1) * TILE, corners.bl);
  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
  // Ramps are packed earth, not grass: a warm dirt gradient with a lit leading edge.
  g.fill({ color: 0x8a7050 });
  // horizontal tread marks across the slope
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    const p1 = { x: a.x + (d.x - a.x) * t, y: a.y + (d.y - a.y) * t };
    const p2 = { x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t };
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.stroke({ width: 1.0, color: 0x6d5840, alpha: 0.38 });
  }
  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
  g.stroke({ width: 1.0, color: 0xb09878, alpha: 0.4 });
}

/** Small decorative props. Cheap to draw, and they break up the tile grid. */
function drawProp(g: Graphics, tx: number, ty: number, level: number, n: number): void {
  const cx = (tx + 0.35 + noise2(tx * 3, ty * 7) * 0.3) * TILE;
  const cy = (ty + 0.35 + noise2(tx * 11, ty * 5) * 0.3) * TILE;
  const p = at(cx, cy, level);
  const kind = Math.floor(n * 100) % 10;

  if (kind < 5) {
    // grass tuft: three thin blades
    for (let k = -1; k <= 1; k++) {
      g.moveTo(p.x + k * 1.6, p.y);
      g.lineTo(p.x + k * 2.6, p.y - 5 - Math.abs(k) * 1.5);
      g.stroke({ width: 1.0, color: k === 0 ? 0x76a05a : 0x5f8a48, alpha: 0.85 });
    }
  } else if (kind < 8) {
    // small stone
    g.ellipse(p.x, p.y - 1.4, 3.2, 2.0);
    g.fill({ color: 0x7c7466 });
    g.ellipse(p.x - 0.6, p.y - 2.2, 1.6, 1.0);
    g.fill({ color: 0x968c7c });
  } else if (kind < 9) {
    // mushroom cluster
    g.moveTo(p.x, p.y);
    g.lineTo(p.x, p.y - 4.0);
    g.stroke({ width: 1.4, color: 0xd8cdb4 });
    g.ellipse(p.x, p.y - 4.6, 2.8, 1.8);
    g.fill({ color: 0xb85c5c });
    g.ellipse(p.x + 3.0, p.y - 2.4, 1.8, 1.2);
    g.fill({ color: 0xb85c5c });
  } else {
    // broken ruin block
    g.poly([p.x - 3.4, p.y, p.x + 3.0, p.y - 0.8, p.x + 2.6, p.y - 3.4, p.x - 2.8, p.y - 2.8]);
    g.fill({ color: 0x8a8272 });
    g.poly([p.x - 3.4, p.y, p.x + 3.0, p.y - 0.8, p.x + 2.6, p.y - 3.4, p.x - 2.8, p.y - 2.8]);
    g.stroke({ width: 0.6, color: 0x5c5648, alpha: 0.7 });
  }
}
