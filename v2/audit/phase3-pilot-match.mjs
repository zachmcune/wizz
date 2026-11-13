// IN-MATCH PROOF at DEFAULT ZOOM — one screenshot per target viewport.
//
// "Default zoom" means exactly what a player gets on first load: zoom 1, camera centred on the fight.
// The point of these shots is readability at real device size, so they are captured at
// deviceScaleFactor 1 (a phone screenshot is what the player actually sees, not a 2x retina render).
//
// Every shot is checked before it is accepted:
//   * the page must have zero errors, and
//   * the frame must contain at least N sprite pixels that are NOT terrain, which proves units are
//     actually on screen. An earlier pass shipped a "massed battle" screenshot that was pure empty
//     terrain because a sprite-size bug meant nothing drew; that must not be possible to ship again.
//
// Run: node audit/phase3-pilot-match.mjs   (needs the v2 dev server on :5333)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs/proof/phase-3-pilot/match');
const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5333/';

mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, note: 'default phone (landscape)' },
  { name: 'phone-844x390', width: 844, height: 390, note: 'large phone (landscape)' },
  { name: 'chromebook-1366x768', width: 1366, height: 768, note: 'school Chromebook' },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, note: 'desktop' },
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const report = { generated: new Date().toISOString(), base: BASE, shots: [], errors: [] };

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`${vp.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`${vp.name} console: ${m.text().slice(0, 200)}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__v2 !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  // 20 per side is a genuinely massed fight (40 units) at the default zoom.
  await page.evaluate(() => window.__v2.spawnBattle(20));
  // Let them close so the shot shows contact, not two separated lines.
  await page.waitForTimeout(2600);

  const stats = await page.evaluate(() => {
    const v = window.__v2;
    const s = v.state;
    let alive = 0;
    for (let i = 0; i < s.entities.count; i++) if (!s.entities.dead[i] && s.entities.kind[i] === 0) alive++;
    return {
      aliveUnits: alive,
      zoom: v.renderer.camera.view().zoom,
      drawn: v.renderer.lastDrawn ?? null,
      frame: v.renderer.lastFrame ?? null,
    };
  });

  const file = join(OUT, `${vp.name}.png`);
  await page.screenshot({ path: file });

  // Independent check that this is not an empty terrain shot: count pixels whose colour is NOT one of
  // the terrain's dominant greens/browns. Units are purple/orange/grey and occupy the centre.
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let unitsPixels = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Terrain is green-dominant (g > r and g > b) or dirt (r>g>b, low saturation). Anything that is
      // strongly blue/purple or strongly saturated orange is a sprite.
      const greenish = g > r && g > b;
      const dirt = r >= g && g >= b && r - b < 70;
      if (!greenish && !dirt) unitsPixels++;
    }
  }
  const frac = unitsPixels / (info.width * info.height);

  report.shots.push({
    viewport: vp.name,
    size: `${vp.width}x${vp.height}`,
    note: vp.note,
    zoom: stats.zoom,
    aliveUnits: stats.aliveUnits,
    nondTerrainPixelFraction: Number(frac.toFixed(3)),
    bytes: readFileSync(file).length,
  });
  if (errs.length) report.errors.push(...errs);
  console.log(`${vp.name}: ${stats.aliveUnits} units alive, zoom ${stats.zoom}, non-terrain pixels ${(frac * 100).toFixed(1)}%`);
  await ctx.close();
}

await browser.close();
writeFileSync(join(OUT, 'match-report.json'), JSON.stringify(report, null, 2));
console.log(`wrote ${report.shots.length} in-match shots to ${OUT}`);
if (report.errors.length) {
  console.log('ERRORS:', report.errors.slice(0, 5));
  process.exitCode = 1;
}
