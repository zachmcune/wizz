// PILOT ATLAS BUILDER.
//
// Bakes the pilot set (5 units x 8 facings x 4 teams, 5 buildings x 4 teams) into WebP atlases so the
// in-game renderer can be judged at real zoom. Same structure as build-atlas.ts; it exists separately
// because the pilot uses the new mesh system and is reviewed before the full roster is rebuilt.
//
//   npx esbuild art/build-atlas2.ts --bundle --platform=node --format=esm --outfile=.a2.mjs --external:sharp
//   node .a2.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { rasterise } from './raster2';
import { buildTris, type Assembly } from './mesh2';
import { TEAM_RAMP } from './palette';
import { PILOT_UNITS, PILOT_BUILDINGS } from './pilot';

const OUT = join(process.cwd(), 'public', 'atlas-pilot');
mkdirSync(OUT, { recursive: true });

/**
 * UNIT FRAME SIZE — this is the number that decides readability on a phone.
 *
 * At default zoom a 667x375 view spans ~25 tiles, so 1 world unit is ~0.82 screen px. A unit drawn at
 * 34 world units tall (2.1x its 16-unit collision diameter) is ~28 px on screen. The frame is authored
 * at 192 px so that a 28 px on-screen sprite is downscaled from 6.8x detail, which keeps edges clean.
 */
const UNIT_FRAME = 192;
const BUILDING_FRAME = 320;
const UNIT_FACINGS = 8;
const PITCH = 0.5;

interface F { page: number; x: number; y: number; w: number; h: number; pivotX: number; pivotY: number }

function renderTo(asm: Assembly, frame: number, yaw: number, team: [number, number, number]): { rgba: Uint8ClampedArray; pivotX: number; pivotY: number; w: number; h: number } {
  const tris = buildTris(asm);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  for (const t of tris) for (const p of [t.a, t.b, t.c]) {
    const x = p.x * cyw - p.y * syw;
    const y = p.x * syw + p.y * cyw;
    const sx = x, sy = y * cp - p.z * sp;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  const scale = (frame * 0.9) / Math.max(1, extent);
  const img = rasterise(asm, {
    width: frame,
    height: frame,
    yaw,
    pitch: PITCH,
    scale,
    offsetX: -(((minX + maxX) / 2) * scale),
    offsetY: -(((minY + maxY) / 2) * scale),
    teamColor: team,
    exposure: 1.0,
    ss: 4,
    outline: true,
    shadow: true,
  });
  // Pivot is where the assembly's ground origin landed, as a fraction of the frame.
  const originX = frame / 2 + (0 - ((minX + maxX) / 2)) * scale;
  const originY = frame / 2 + (0 - ((minY + maxY) / 2)) * scale;
  return { rgba: img.rgba, pivotX: originX / frame, pivotY: originY / frame, w: frame, h: frame };
}

interface Item { key: string; data: Uint8ClampedArray; size: number }

async function bake(name: string, items: Item[], maxWidth: number): Promise<void> {
  // Shelf pack.
  const placed: { item: Item; x: number; y: number; page: number }[] = [];
  const pages: { w: number; h: number; data: Float32Array }[] = [];
  let page = { w: maxWidth, h: 0, data: new Float32Array(maxWidth * maxWidth * 4) };
  pages.push(page);
  let used = 0, shelfY = 0, shelfH = 0, pageIdx = 0;
  for (const it of items) {
    const s = it.size;
    if (used + s > page.w) { shelfY += shelfH; used = 0; shelfH = 0; }
    if (shelfY + s > maxWidth) {
      page.h = Math.max(page.h, shelfY);
      page = { w: maxWidth, h: 0, data: new Float32Array(maxWidth * maxWidth * 4) };
      pages.push(page);
      pageIdx++;
      used = 0; shelfY = 0; shelfH = 0;
    }
    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const si = (py * s + px) * 4;
        const di = ((shelfY + py) * page.w + (used + px)) * 4;
        page.data[di] = it.data[si]!;
        page.data[di + 1] = it.data[si + 1]!;
        page.data[di + 2] = it.data[si + 2]!;
        page.data[di + 3] = it.data[si + 3]!;
      }
    }
    placed.push({ item: it, x: used, y: shelfY, page: pageIdx });
    used += s;
    shelfH = Math.max(shelfH, s);
    page.h = Math.max(page.h, shelfY + s);
  }

  const manifestPages: { file: string; width: number; height: number }[] = [];
  let bytes = 0;
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i]!;
    const h = Math.max(1, pg.h);
    const buf = Buffer.alloc(pg.w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < pg.w; x++) {
      const si = (y * pg.w + x) * 4;
      buf[si] = clamp(pg.data[si]!);
      buf[si + 1] = clamp(pg.data[si + 1]!);
      buf[si + 2] = clamp(pg.data[si + 2]!);
      buf[si + 3] = clamp(pg.data[si + 3]!);
    }
    const file = `${name}-${i}.webp`;
    const out = await sharp(buf, { raw: { width: pg.w, height: h, channels: 4 } })
      .webp({ quality: 94, alphaQuality: 100, effort: 6 })
      .toBuffer();
    writeFileSync(join(OUT, file), out);
    bytes += out.length;
    manifestPages.push({ file, width: pg.w, height: h });
  }

  const frames: Record<string, F> = {};
  for (const p of placed) {
    frames[p.item.key] = { page: p.page, x: p.x, y: p.y, w: p.item.size, h: p.item.size, pivotX: 0.5, pivotY: 0.85 };
  }
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ pages: manifestPages, frames }));
  console.log(`${name}: ${items.length} frames, ${pages.length} pages, ${(bytes / 1048576).toFixed(2)} MB`);
}

function clamp(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v; }

async function main(): Promise<void> {
  const unitItems: Item[] = [];
  const pivots: Record<string, { x: number; y: number }> = {};
  for (const [id, asm] of Object.entries(PILOT_UNITS)) {
    for (const team of TEAM_RAMP) {
      for (let f = 0; f < UNIT_FACINGS; f++) {
        const yaw = (f / UNIT_FACINGS) * Math.PI * 2;
        const r = renderTo(asm, UNIT_FRAME, yaw, team.color);
        const key = `unit/${id}/${team.id}/${f}`;
        unitItems.push({ key, data: r.rgba, size: UNIT_FRAME });
        pivots[key] = { x: r.pivotX, y: r.pivotY };
      }
    }
  }
  await bake('units', unitItems, 2048);

  const bItems: Item[] = [];
  for (const [id, asm] of Object.entries(PILOT_BUILDINGS)) {
    for (const team of TEAM_RAMP) {
      const r = renderTo(asm, BUILDING_FRAME, 0.62, team.color);
      const key = `building/${id}/${team.id}/0`;
      bItems.push({ key, data: r.rgba, size: BUILDING_FRAME });
      pivots[key] = { x: r.pivotX, y: r.pivotY };
    }
  }
  await bake('buildings', bItems, 2048);

  writeFileSync(join(OUT, 'pivots.json'), JSON.stringify(pivots));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
