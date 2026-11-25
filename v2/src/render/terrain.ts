// Terrain rendering: pre-rendered, chunked, with real height strata.
//
// Approach: the map's static geometry never changes, so it is drawn ONCE into a Graphics object per
// 16x16-tile chunk that is only repositioned with the camera. That is the single biggest render win
// over v1, which rebuilt fog geometry every frame and issued per-tile draw commands.
//
// Visual design:
//   • Each height level gets its own ground tone, so elevation is readable at a glance without
//     having to study the cliff faces.
//   • Cliff faces are drawn as vertical quads with banded strata, darkening toward the base, so they
//     read as rock rather than a flat extrusion.
//   • Ramps are drawn as a lit sloped quad using the real interpolated corner heights.
//   • Walkable ground carries a sparse arcane diamond motif instead of v1's hard grid lines.

import { Container, Graphics } from 'pixi.js';
import { TILE, TILE_BLOCKED, TILE_RAMP } from '../core/constants';
import { projectGround, VISUAL_HEIGHT_STEP } from '../core/projection';
import { mapTileQuery, rampSpanAt, tileCornerHeights } from '../core/ramp-slope';
import type { MapData } from '../data/defs';

/** Ground tones per elevation level. Each step lifts and cools slightly. */
const LEVEL_TONES = [
  { top: 0x4a4270, edge: 0x352e56 },
  { top: 0x5b5187, edge: 0x413863 },
  { top: 0x6c60a0, edge: 0x4d4374 },
  { top: 0x7d70b8, edge: 0x5a4f88 },
];

const BLOCKED_TONE = { top: 0x241d33, edge: 0x1a1426 };

/** Rock strata tones, alternating vertically down a cliff. */
const STRATA = [0x453c62, 0x3a3254, 0x4f4570, 0x342c4a];

export interface TerrainRender {
  container: Container;
  destroy(): void;
}

function levelTone(level: number): { top: number; edge: number } {
  return LEVEL_TONES[Math.min(LEVEL_TONES.length - 1, Math.max(0, level))] ?? LEVEL_TONES[0]!;
}

/** Project a world point at an elevation, returning screen coordinates. */
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

  // ---- pass 1: cliff faces first, so a tile top always covers the face behind it.
  for (let ty = ty0; ty < tyEnd; ty++) {
    for (let tx = tx0; tx < txEnd; tx++) {
      const i = ty * map.tileW + tx;
      if (map.tiles[i] === TILE_RAMP) continue;
      const blocked = map.tiles[i] === TILE_BLOCKED;
      const h = map.heights[i] ?? 0;
      const hRight = tx + 1 < map.tileW ? (map.heights[ty * map.tileW + tx + 1] ?? 0) : h;
      const hDown = ty + 1 < map.tileH ? (map.heights[(ty + 1) * map.tileW + tx] ?? 0) : h;
      const dropRight = h - hRight;
      const dropDown = h - hDown;
      if (dropRight > 0) drawCliffFace(g, tx, ty, 'right', h, dropRight, blocked);
      if (dropDown > 0) drawCliffFace(g, tx, ty, 'down', h, dropDown, blocked);
    }
  }

  // ---- pass 2: tile tops (ramps get their own sloped quad).
  for (let ty = ty0; ty < tyEnd; ty++) {
    for (let tx = tx0; tx < txEnd; tx++) {
      const i = ty * map.tileW + tx;
      if (map.tiles[i] === TILE_RAMP) {
        drawRamp(g, q, tx, ty);
        continue;
      }
      const blocked = map.tiles[i] === TILE_BLOCKED;
      const level = map.heights[i] ?? 0;
      const tone = blocked ? BLOCKED_TONE : levelTone(level);
      const a = at(tx * TILE, ty * TILE, level);
      const b = at((tx + 1) * TILE, ty * TILE, level);
      const c = at((tx + 1) * TILE, (ty + 1) * TILE, level);
      const d = at(tx * TILE, (ty + 1) * TILE, level);
      g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
      g.fill({ color: tone.top });
      if (!blocked) {
        g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
        g.stroke({ width: 0.6, color: tone.edge, alpha: 0.75 });
      }
    }
  }

  // ---- pass 3: sparse motif on walkable ground.
  for (let ty = ty0; ty < tyEnd; ty++) {
    for (let tx = tx0; tx < txEnd; tx++) {
      const i = ty * map.tileW + tx;
      if (map.tiles[i] !== 0) continue;
      if ((tx * 7 + ty * 13) % 11 !== 0) continue;
      const level = map.heights[i] ?? 0;
      const c = at(tx * TILE + TILE / 2, ty * TILE + TILE / 2, level);
      const r = 3.5;
      g.poly([c.x, c.y - r, c.x + r, c.y, c.x, c.y + r, c.x - r, c.y]);
      g.fill({ color: 0xb0a4f0, alpha: 0.20 });
    }
  }
}

function drawCliffFace(
  g: Graphics,
  tx: number,
  ty: number,
  side: 'right' | 'down',
  level: number,
  drop: number,
  blocked: boolean,
): void {
  // 'right' is the +x edge (projects to screen lower-right); 'down' is the +y edge (lower-left).
  const edge =
    side === 'right'
      ? [at((tx + 1) * TILE, ty * TILE, level), at((tx + 1) * TILE, (ty + 1) * TILE, level)]
      : [at(tx * TILE, (ty + 1) * TILE, level), at((tx + 1) * TILE, (ty + 1) * TILE, level)];
  const topA = edge[0]!;
  const topB = edge[1]!;
  const totalH = drop * VISUAL_HEIGHT_STEP;
  const bands = Math.max(2, Math.min(4, Math.round(drop * 2)));

  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const yA0 = topA.y + totalH * t0;
    const yA1 = topA.y + totalH * t1;
    const yB0 = topB.y + totalH * t0;
    const yB1 = topB.y + totalH * t1;
    g.poly([topA.x, yA0, topB.x, yB0, topB.x, yB1, topA.x, yA1]);
    // The lower stratum is darker, which grounds the cliff visually.
    g.fill({ color: STRATA[i % STRATA.length]!, alpha: blocked ? 0.96 : 0.9 - t0 * 0.22 });
  }

  // A faint lip highlight along the top edge sells the corner.
  g.moveTo(topA.x, topA.y);
  g.lineTo(topB.x, topB.y);
  g.stroke({ width: 1, color: 0x8b7ec8, alpha: 0.35 });
}

function drawRamp(g: Graphics, q: ReturnType<typeof mapTileQuery>, tx: number, ty: number): void {
  // Re-derive the ramp span so the slope direction is honoured (it may run along x or y).
  const span = rampSpanAt(q, tx, ty);
  if (!span) {
    const level = q.heightAt(tx, ty);
    const a = at(tx * TILE, ty * TILE, level);
    const b = at((tx + 1) * TILE, ty * TILE, level);
    const c = at((tx + 1) * TILE, (ty + 1) * TILE, level);
    const d = at(tx * TILE, (ty + 1) * TILE, level);
    g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
    g.fill({ color: 0x4f4670 });
    return;
  }
  const corners = tileCornerHeights(q, tx, ty);
  const a = at(tx * TILE, ty * TILE, corners.tl);
  const b = at((tx + 1) * TILE, ty * TILE, corners.tr);
  const c = at((tx + 1) * TILE, (ty + 1) * TILE, corners.br);
  const d = at(tx * TILE, (ty + 1) * TILE, corners.bl);
  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
  g.fill({ color: 0x7a6ca8 });
  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
  g.stroke({ width: 1.1, color: 0xc0b4ff, alpha: 0.65 });
  // A couple of tread lines across the slope so it reads as climbable.
  for (let i = 1; i < 3; i++) {
    const t = i / 3;
    const p1 = { x: a.x + (d.x - a.x) * t, y: a.y + (d.y - a.y) * t };
    const p2 = { x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t };
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.stroke({ width: 0.8, color: 0x7d72b4, alpha: 0.3 });
  }
}
