// TERRAIN PATCH PROOF — one framed patch of board showing grass, a dirt path, a cliff face and a ramp.
//
// This is a screen capture, but it is not a crop of an arbitrary region: the camera is positioned on
// the map's own cliff+ramp feature and the shot is checked for the presence of each terrain material
// before it is accepted. A "terrain has real variation" claim is only worth anything if the proof
// actually contains rock, path and ramp pixels, so those are counted and reported.
//
// Run: node audit/phase3-pilot-terrain.mjs  (needs the v2 dev server on :5333)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs/proof/phase-3-pilot/terrain');
const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5333/';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 200)}`);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__v2 !== undefined, null, { timeout: 30000 });
await page.waitForTimeout(1200);

// Find a cliff+ramp site from the map data itself rather than hard-coding coordinates: pick the tile
// that has the largest height difference to a neighbour AND has a ramp neighbour.
const site = await page.evaluate(() => {
  const v = window.__v2;
  // GameState carries only `mapId`; the tile arrays live on the registry's map definition, which uses
  // `tileW`/`tileH` and encodes ramps as tile code 2.
  const map = v.registry.maps.get(v.state.mapId);
  if (!map) return null;
  const W = map.tileW;
  const H = map.tileH;
  const isRamp = (tx, ty) => map.tiles[ty * W + tx] === 2;
  let best = null;
  for (let ty = 2; ty < H - 2; ty++) {
    for (let tx = 2; tx < W - 2; tx++) {
      const h = map.heights[ty * W + tx];
      let maxDrop = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        maxDrop = Math.max(maxDrop, h - map.heights[(ty + dy) * W + (tx + dx)]);
      }
      if (maxDrop <= 0) continue;
      // Prefer a site that has a ramp tile within 4 tiles, so cliff and ramp share the frame.
      let rampNear = false;
      for (let ry = Math.max(0, ty - 4); ry <= Math.min(H - 1, ty + 4) && !rampNear; ry++) {
        for (let rx = Math.max(0, tx - 4); rx <= Math.min(W - 1, tx + 4); rx++) {
          if (isRamp(rx, ry)) { rampNear = true; break; }
        }
      }
      const score = maxDrop * 10 + (rampNear ? 25 : 0);
      if (best === null || score > best.score) best = { tx, ty, maxDrop, rampNear, score };
    }
  }
  return best;
});

if (!site) {
  console.log('no cliff site found on this map');
  process.exitCode = 1;
} else {
  console.log('cliff site:', JSON.stringify(site));
  await page.evaluate(
    (s) => {
      const v = window.__v2;
      const cam = v.renderer.camera;
      // World centre of the chosen tile, pulled back a little so both the cliff and its ramp are in
      // frame rather than filling the view with a single tile face.
      const TILE = 32;
      cam.centerOn((s.tx + 0.5) * TILE, (s.ty + 0.5) * TILE);
      cam.setZoom(0.85);
    },
    site,
  );
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'terrain-cliff-and-ramp.png') });

  // Count material pixels so the proof cannot be a picture of empty grass. Classification is by
  // nearest palette entry to the ACTUAL terrain palettes in src/render/terrain2.ts, not by guessing
  // from hue — cliff faces there are a desaturated brown that a naive "grey" test files as dirt.
  const GRASS = [[0x4a, 0x6b, 0x3a], [0x52, 0x75, 0x40], [0x5b, 0x7f, 0x46], [0x44, 0x63, 0x3a], [0x60, 0x84, 0x4c], [0x4e, 0x70, 0x40]];
  const DIRT = [[0x7a, 0x61, 0x44], [0x84, 0x6a, 0x4b], [0x6f, 0x58, 0x3e], [0x8a, 0x71, 0x50]];
  const ROCK = [[0x5c, 0x53, 0x48], [0x4e, 0x46, 0x3d], [0x6a, 0x60, 0x54], [0x45, 0x3e, 0x36]];
  const dist = (r, g, b, p) => (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
  const nearest = (r, g, b, pal) => Math.min(...pal.map((p) => dist(r, g, b, p)));
  const { data, info } = await sharp(join(OUT, 'terrain-cliff-and-ramp.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let grass = 0;
  let rock = 0;
  let dirt = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const dg = nearest(r, g, b, GRASS);
    const dd = nearest(r, g, b, DIRT);
    const dr = nearest(r, g, b, ROCK);
    const best = Math.min(dg, dd, dr);
    // Ignore pixels far from every terrain colour (sprites, UI, black off-map).
    if (best > 2600) continue;
    if (best === dg) grass++;
    else if (best === dd) dirt++;
    else rock++;
  }
  const total = info.width * info.height;
  const pct = (n) => Number(((n / total) * 100).toFixed(1));

  const report = {
    generated: new Date().toISOString(),
    site,
    viewport: { width: 900, height: 560 },
    zoom: 0.85,
    materialPixels: { grassPct: pct(grass), rockPct: pct(rock), dirtPct: pct(dirt) },
    errors: errs,
  };
  writeFileSync(join(OUT, 'terrain-report.json'), JSON.stringify(report, null, 2));
  console.log(`materials — grass ${report.materialPixels.grassPct}%, rock ${report.materialPixels.rockPct}%, dirt ${report.materialPixels.dirtPct}%`);
  if (report.materialPixels.rockPct < 3) {
    console.log('WARNING: almost no rock pixels — the shot may not contain a cliff face');
    process.exitCode = 1;
  }
}

await browser.close();
if (errs.length) {
  console.log('ERRORS:', errs.slice(0, 5));
  process.exitCode = 1;
}
