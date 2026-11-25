// BACKFILL `content` BOUNDS INTO THE SHIPPED ATLAS MANIFESTS.
//
// The thumbnails need each frame's opaque bounds to crop to the sprite rather than to its padding: a unit is baked into a
// 128x128 frame but occupies about 16x23 of it, which is why a 52x40 unit tile rendered as "two tiny dots" while a
// building at 66x62 of its 128 read correctly.
//
// `art/build-atlas3.ts` now writes these bounds when it bakes, but re-baking is unnecessary here — the pixels are already
// on disk, so this reads the shipped WebP pages and writes the same field into the manifests. It is idempotent and
// byte-stable for a given atlas.
//
//   npx vite-node art/backfill-atlas-content.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT = join(import.meta.dirname, '..', 'public', 'atlas-final');

interface Rect { page: number; x: number; y: number; w: number; h: number; pivotX: number; pivotY: number; scale?: number; content?: { x: number; y: number; w: number; h: number } }
interface Manifest { pages: { file: string; width: number; height: number }[]; frames: Record<string, Rect> }

async function backfill(name: string): Promise<void> {
  const file = join(OUT, `${name}.json`);
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  // Decode every page once, as raw RGBA, so each frame is a rectangle read rather than a separate decode.
  const pages: { data: Buffer; width: number; height: number }[] = [];
  for (const p of manifest.pages) {
    const { data, info } = await sharp(join(OUT, p.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    pages.push({ data, width: info.width, height: info.height });
  }

  let changed = 0;
  let empty = 0;
  for (const r of Object.values(manifest.frames)) {
    const page = pages[r.page]!;
    let minX = r.w;
    let minY = r.h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < r.h; y++) {
      const row = (r.y + y) * page.width;
      for (let x = 0; x < r.w; x++) {
        // alpha > 24 ignores the softest shadow fringe, which would otherwise inflate every unit to its full frame.
        if (page.data[(row + r.x + x) * 4 + 3]! <= 24) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) {
      empty++;
      delete r.content;
      continue;
    }
    const content = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    r.content = content;
    changed++;
  }
  writeFileSync(file, JSON.stringify(manifest));
  console.log(`${name}: ${changed} frames with content bounds, ${empty} empty`);
}

await backfill('units');
await backfill('buildings');
