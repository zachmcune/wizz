// ATLAS BUILDER.
//
// Bakes every sprite in the game into WebP atlas pages plus a frame manifest the renderer loads.
//
// What gets baked:
//   • 14 units × 8 yaw facings × 4 team colours
//   • 21 buildings × 1 facing × 4 team colours
//   • plus a single-frame "neutral" variant per sprite for the gallery and neutral entities
//
// Why 4 team colours baked rather than tinted at runtime: mask-based tinting needs a per-pixel mask
// pass, which Pixi can do but costs fill rate on exactly the devices this game targets. Baking is a
// build-time cost paid once, and the atlas stays small because the team-tinted regions are tiny.
//
//   node v2/art/build-atlas.ts        (or: npm run art:build)

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { rasterise } from './raster';
import { projectedBounds, type Assembly } from './mesh';
import { TEAM_RAMP } from './palette';
import { UNIT_ART } from './units';
import { BUILDING_ART } from './buildings';

/**
 * Output goes to `public/atlas/` so Vite serves it at `/atlas/...` in dev and copies it into the
 * production build. (`dist/` would be wiped by `vite build` and is gitignored.)
 *
 * NOTE: this file is bundled with esbuild before running, so `import.meta.url` points at the bundle.
 * The path is therefore resolved from `process.cwd()` — the package root — which is stable because
 * the build script is always invoked from `v2/`.
 */
const OUT = join(process.cwd(), 'public', 'atlas');
mkdirSync(OUT, { recursive: true });

/** Unit frames are square and small; buildings need more room. */
const UNIT_FRAME = 128;
const BUILDING_FRAME = 256;
const UNIT_FACINGS = 8;
/** Dimetric pitch matching the game camera's feel. */
const PITCH = 0.52;

export interface FrameRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pivot as a fraction of the frame: where the sprite's ground origin sits. */
  pivotX: number;
  pivotY: number;
}

export interface AtlasManifest {
  pages: { file: string; width: number; height: number }[];
  frames: Record<string, FrameRect>;
}

/**
 * Render one sprite. Returns RGBA plus the ground-origin pivot, expressed as a fraction of the frame,
 * so the renderer can put the sprite's feet exactly on the world position.
 */
function renderSprite(
  asm: Assembly,
  frame: number,
  yaw: number,
  teamColor: [number, number, number],
  detail: number,
): { rgba: Uint8ClampedArray; pivotX: number; pivotY: number } {
  const b = projectedBounds(asm, yaw, PITCH);
  const spanX = b.maxX - b.minX;
  const spanY = b.maxY - b.minY;
  const scale = (frame * 0.86) / Math.max(1, Math.max(spanX, spanY));
  // Centre the projected bounding box in the frame, then express the assembly origin's position
  // relative to that box so the pivot is correct for every sprite regardless of its proportions.
  const midX = ((b.minX + b.maxX) / 2) * scale;
  const midY = ((b.minY + b.maxY) / 2) * scale;
  const img = rasterise(asm, {
    width: frame,
    height: frame,
    yaw,
    pitch: PITCH,
    scale,
    offsetX: -midX,
    offsetY: -midY,
    teamColor,
    detail,
    exposure: 1.06,
    shadow: true,
    ss: 3,
    outline: true,
  });
  return {
    rgba: img.rgba,
    pivotX: (frame / 2 - midX) / frame,
    pivotY: (frame / 2 - midY) / frame,
  };
}

/** Pack frames into pages, simple shelf packing with a max width. */
interface Packed {
  page: number;
  x: number;
  y: number;
  rgba: Uint8ClampedArray;
  frame: number;
}
interface PageState {
  width: number;
  height: number;
  used: number;
  shelfY: number;
  shelfH: number;
  data: Float32Array;
}
function packIntoPages(items: Packed[], maxWidth = 4096): { pages: PageState[]; rects: Map<Packed, FrameRect> } {
  const pages: PageState[] = [];
  const rects = new Map<Packed, FrameRect>();
  const newPage = (): PageState => ({
    width: maxWidth,
    height: 0,
    used: 0,
    shelfY: 0,
    shelfH: 0,
    // Allocate the page as maxWidth x maxWidth and trim on write; 4096 is the safe WebGL2 floor
    // for texture size on the Chromebooks and phones this targets.
    data: new Float32Array(maxWidth * maxWidth * 4),
  });
  let page = newPage();
  pages.push(page);
  let pageIndex = 0;

  for (const item of items) {
    const f = item.frame;
    if (page.used + f > page.width) {
      page.shelfY += page.shelfH;
      page.used = 0;
      page.shelfH = 0;
    }
    // Start a new page if this shelf would overflow vertically.
    if (page.shelfY + f > maxWidth) {
      page = newPage();
      pages.push(page);
      pageIndex++;
    }
    const x = page.used;
    const y = page.shelfY;
    // Blit into the page buffer.
    for (let py = 0; py < f; py++) {
      for (let px = 0; px < f; px++) {
        const si = (py * f + px) * 4;
        const di = ((y + py) * page.width + (x + px)) * 4;
        page.data[di] = item.rgba[si]!;
        page.data[di + 1] = item.rgba[si + 1]!;
        page.data[di + 2] = item.rgba[si + 2]!;
        page.data[di + 3] = item.rgba[si + 3]!;
      }
    }
    page.used += f;
    page.shelfH = Math.max(page.shelfH, f);
    page.height = Math.max(page.height, page.shelfY + f);
    rects.set(item, { page: pageIndex, x, y, w: f, h: f, pivotX: 0, pivotY: 0 });
  }
  return { pages, rects };
}

async function main(): Promise<void> {
  const started = Date.now();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const unitItems: Packed[] = [];
  const buildingItems: Packed[] = [];

  // ---------------------------------------------------------------- units: 8 facings x 4 teams
  for (const [id, asm] of Object.entries(UNIT_ART)) {
    for (const team of TEAM_RAMP) {
      for (let facing = 0; facing < UNIT_FACINGS; facing++) {
        // yaw 0 faces screen-right; step around the circle.
        const yaw = (facing / UNIT_FACINGS) * Math.PI * 2;
        const { rgba, pivotX, pivotY } = renderSprite(asm, UNIT_FRAME, yaw, team.color, 0.72);
        const key = `unit/${id}/${team.id}/${facing}`;
        const item: Packed = { page: 0, x: 0, y: 0, rgba, frame: UNIT_FRAME };
        // Stash the pivot on the item via a side map (kept out of the Packed type for clarity).
        pivots.set(item, { x: pivotX, y: pivotY });
        keys.set(item, key);
        unitItems.push(item);
      }
    }
  }

  // -------------------------------------------------------------- buildings: 4 team colours
  for (const [id, asm] of Object.entries(BUILDING_ART)) {
    for (const team of TEAM_RAMP) {
      const { rgba, pivotX, pivotY } = renderSprite(asm, BUILDING_FRAME, 0.62, team.color, 1);
      const key = `building/${id}/${team.id}/0`;
      const item: Packed = { page: 0, x: 0, y: 0, rgba, frame: BUILDING_FRAME };
      pivots.set(item, { x: pivotX, y: pivotY });
      keys.set(item, key);
      buildingItems.push(item);
    }
  }

  // Pack units and buildings into SEPARATE atlases. Units dominate the frame count (448 of 532) and
  // are all one size, so they pack into a couple of dense pages; buildings are 256px and would
  // otherwise fragment the unit pages badly. Two atlases also means the building atlas can be
  // lazy-loaded if a map turns out to have none.
  const atlases: { name: string; items: Packed[]; maxPages: number }[] = [
    { name: 'units', items: unitItems, maxPages: 3 },
    { name: 'buildings', items: buildingItems, maxPages: 2 },
  ];

  let totalBytes = 0;
  let totalPages = 0;

  for (const atlas of atlases) {
    const { pages, rects } = packIntoPages(atlas.items, 2048);
    const pageNames: { file: string; width: number; height: number }[] = [];
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i]!;
      const h = Math.max(1, pg.height);
      const rgba = Buffer.alloc(pg.width * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < pg.width; x++) {
          const si = (y * pg.width + x) * 4;
          rgba[si] = clamp(pg.data[si]!);
          rgba[si + 1] = clamp(pg.data[si + 1]!);
          rgba[si + 2] = clamp(pg.data[si + 2]!);
          rgba[si + 3] = clamp(pg.data[si + 3]!);
        }
      }
      // Trim trailing transparent rows so the page is not stored at full square height.
      let maxRow = 0;
      for (let y = h - 1; y >= 0; y--) {
        let any = false;
        for (let x = 0; x < pg.width; x++) {
          if (rgba[(y * pg.width + x) * 4 + 3]! > 0) {
            any = true;
            break;
          }
        }
        if (any) {
          maxRow = y + 1;
          break;
        }
      }
      const trimmedH = Math.max(1, maxRow);
      const trimmed = rgba.subarray(0, pg.width * trimmedH * 4);
      const file = `${atlas.name}-${i}.webp`;
      const buf = await sharp(trimmed, { raw: { width: pg.width, height: trimmedH, channels: 4 } })
        .webp({ quality: 94, alphaQuality: 100, effort: 6 })
        .toBuffer();
      writeFileSync(join(OUT, file), buf);
      totalBytes += buf.length;
      totalPages++;
      pageNames.push({ file, width: pg.width, height: trimmedH });
    }

    const localManifest: AtlasManifest = { pages: pageNames, frames: {} };
    for (const item of atlas.items) {
      const r = rects.get(item)!;
      const pv = pivots.get(item)!;
      const key = keys.get(item)!;
      // Rebase page indices: each atlas starts at page 0.
      localManifest.frames[key] = { ...r, pivotX: pv.x, pivotY: pv.y };
    }
    writeFileSync(join(OUT, `${atlas.name}.json`), JSON.stringify(localManifest));
    console.log(`  ${atlas.name}: ${atlas.items.length} frames, ${pages.length} pages`);
    if (pages.length > atlas.maxPages) {
      console.error(`ATLAS OVER BUDGET: ${atlas.name} has ${pages.length} pages > ${atlas.maxPages}`);
      process.exitCode = 1;
    }
  }

  const ms = Date.now() - started;
  const mb = totalBytes / (1024 * 1024);
  console.log(`atlas total: ${totalPages} pages, ${mb.toFixed(2)} MB, built in ${ms} ms`);
  if (mb > 2) {
    console.error(`ATLAS OVER BUDGET: ${mb.toFixed(2)} MB > 2 MB`);
    process.exitCode = 1;
  }
}

const pivots = new Map<Packed, { x: number; y: number }>();
const keys = new Map<Packed, string>();

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
