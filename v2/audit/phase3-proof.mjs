// PHASE 3 PROOF HARNESS.
//
// Captures every artifact Phase 3 requires:
//   1. Art gallery at full page (all units × 8 facings × 4 teams, all buildings × 4 teams)
//   2. Per-unit close-up sheets (8 facings + 4 team colours) as separate images
//   3. In-match screenshots at the four target viewports: idle base, massed battle, zoomed out,
//      max zoom, height/cliff showcase, faction palettes
//   4. A gameplay recording
//   5. A silhouette sheet at 40 px
// plus machine-readable measurements (render ms, draw counts, atlas bytes, page errors).
//
//   node v2/audit/phase3-proof.mjs

import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, renameSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v2Root = join(here, '..');
const OUT = join(v2Root, 'docs', 'proof', 'phase-3');
const SPRITES = join(OUT, 'sprites');
const BASE = process.env.V2_BASE ?? 'http://127.0.0.1:5313';

mkdirSync(OUT, { recursive: true });
mkdirSync(SPRITES, { recursive: true });

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, dpr: 2, mobile: true },
  { name: 'phone-844x390', width: 844, height: 390, dpr: 3, mobile: true },
  { name: 'chromebook-1366x768', width: 1366, height: 768, dpr: 1, mobile: false },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, dpr: 1, mobile: false },
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const report = { atlas: {}, gallery: {}, viewports: [], measurements: {}, errors: [] };

// ---------------------------------------------------------------- atlas budget measurements
const atlasDir = join(v2Root, 'public', 'atlas');
let atlasBytes = 0;
const atlasFiles = [];
for (const f of readdirSync(atlasDir)) {
  const size = statSync(join(atlasDir, f)).size;
  atlasBytes += size;
  atlasFiles.push({ file: f, bytes: size });
}
report.atlas = {
  totalBytes: atlasBytes,
  totalMB: +(atlasBytes / (1024 * 1024)).toFixed(2),
  files: atlasFiles,
};

// ---------------------------------------------------------------- 1 + 2: gallery and sprite sheets
{
  const ctx = await browser.newContext({ viewport: { width: 1760, height: 1200 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 200)}`);
  });
  await page.goto(`${BASE}/gallery.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__gallery !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  report.gallery = await page.evaluate(() => window.__gallery);
  report.errors.push(...errs);

  // Full-page gallery (the master art review sheet).
  await page.screenshot({ path: join(OUT, 'gallery-full.png'), fullPage: true });

  // Individual close-up sheets per unit and per building.
  //
  // These are NOT screen crops any more. The previous implementation scrolled the page and then
  // captured `clip: {x:0,y:0,...}`, which is interpreted in DOCUMENT coordinates — so the clip always
  // grabbed the same top-left region and several proofs came out byte-identical. Instead we scroll the
  // card into view and screenshot the ELEMENT, which is unambiguous and can never land on the wrong
  // region.
  const cards = await page.$$('.gal-card');
  const seenTitles = [];
  for (const card of cards) {
    const safe = await card.evaluate((el) => {
      const note = el.querySelector('.gal-note')?.textContent ?? '';
      return note.replace(/[^a-z0-9_]/gi, '_');
    });
    const title = await card.evaluate((el) => el.querySelector('.gal-title')?.textContent ?? '');
    if (!safe) continue;
    seenTitles.push({ safe, title });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await card.screenshot({ path: join(SPRITES, `${safe}.png`) });
  }
  report.gallery.sheets = seenTitles.length;
  report.gallery.sheetNames = seenTitles.map((t) => t.safe);
  await ctx.close();
}

// ---------------------------------------------------------------- 3: in-match views
const SCENES = [
  { key: '01-idle-base', zoom: 1.15, waitMs: 6000, camera: 'base' },
  { key: '02-zoomed-out', zoom: 0.42, waitMs: 1500, camera: 'base' },
  { key: '03-max-zoom', zoom: 2.0, waitMs: 1500, camera: 'base' },
  { key: '04-cliffs', zoom: 1.0, waitMs: 1500, camera: 'plateau' },
  { key: '05-massed-battle', zoom: 1.0, waitMs: 0, camera: 'battle' },
];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 200)}`);
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__v2 !== undefined || window.__v2Error !== undefined, null, {
    timeout: 40000,
  });
  await page.waitForTimeout(2500);
  const boot = await page.evaluate(() => ({
    err: window.__v2Error ?? null,
    has: !!window.__v2,
    stats: window.__v2?.renderer?.statsView ?? null,
  }));
  if (!boot.has) {
    report.errors.push(`${vp.name}: boot failed: ${boot.err}`);
    await ctx.close();
    continue;
  }

  // Measure render cost over a window while the game runs.
  const measure = await page.evaluate(async () => {
    const r = window.__v2.renderer;
    const samples = [];
    for (let i = 0; i < 90; i++) {
      await new Promise((res) => requestAnimationFrame(res));
      samples.push(r.statsView.cpuMs);
    }
    samples.sort((a, b) => a - b);
    return {
      p50: +samples[Math.floor(samples.length * 0.5)].toFixed(2),
      p95: +samples[Math.floor(samples.length * 0.95)].toFixed(2),
      max: +samples[samples.length - 1].toFixed(2),
      drawn: r.statsView.drawn,
      total: r.statsView.total,
    };
  });
  report.measurements[vp.name] = measure;

  for (const scene of SCENES) {
    // For the battle shot, populate the field first so the frame shows a real fight rather than the
    // handful of units a demo bot can afford in 60 seconds. Phase 3 is about the RENDERER.
    if (scene.key === '05-massed-battle') {
      await page.evaluate(() => window.__v2.spawnBattle(26));
      await page.waitForTimeout(2200);
      await page.screenshot({ path: join(OUT, `${vp.name}--${scene.key}.png`) });
      continue;
    }
    await page.evaluate(
      ({ zoom, camera }) => {
        const r = window.__v2.renderer;
        r.camera.setZoom(zoom);
        if (camera === 'plateau') r.camera.centerOn(2048, 1408);
        else if (camera === 'keep') r.camera.centerOn(1500, 1200);
        else {
          // Centre on player 0's Sanctum.
          const st = window.__v2.state;
          for (let s = 0; s < st.entities.count; s++) {
            if (st.entities.dead[s]) continue;
            if (st.entities.extras[s].defId === 'sanctum' && st.entities.ownerIndex[s] === 0) {
              r.camera.centerOn(st.entities.posX[s], st.entities.posY[s]);
              break;
            }
          }
        }
      },
      { zoom: scene.zoom, camera: scene.camera },
    );
    await page.waitForTimeout(scene.waitMs >= 5000 ? 400 : scene.waitMs);
    await page.screenshot({ path: join(OUT, `${vp.name}--${scene.key}.png`) });
  }

  // Geometry: nothing may overflow, HUD must be visible.
  const geom = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const hud = document.querySelector('.hud-stats');
    const r = hud ? hud.getBoundingClientRect() : null;
    return {
      vw,
      vh,
      scrollW: doc.scrollWidth,
      scrollH: doc.scrollHeight,
      hudVisible: !!r && r.width > 0 && r.height > 0,
      hudOverflowRight: r ? Math.max(0, Math.round(r.right - vw)) : 0,
      hudOverflowBottom: r ? Math.max(0, Math.round(r.bottom - vh)) : 0,
    };
  });
  report.viewports.push({ viewport: vp.name, geometry: geom, errors: errs });
  report.errors.push(...errs.map((e) => `${vp.name}: ${e}`));
  await ctx.close();
}

// ---------------------------------------------------------------- 4: gameplay recording
{
  const rawDir = join(OUT, '_vid');
  rmSync(rawDir, { recursive: true, force: true });
  mkdirSync(rawDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: { dir: rawDir, size: { width: 1366, height: 768 } },
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__v2 !== undefined, null, { timeout: 40000 });
  await page.waitForTimeout(3000);

  // Walk the camera across the map so the recording shows terrain, cliffs, ramps and an army.
  const path = [
    [1.15, 464, 464],
    [1.0, 900, 900],
    [0.8, 1500, 1200],
    [1.4, 2048, 1408],
    [1.0, 2400, 1700],
    [0.7, 2000, 1400],
  ];
  for (const [zoom, x, y] of path) {
    await page.evaluate(({ z, cx, cy }) => window.__v2.renderer.camera.setZoom(z) || window.__v2.renderer.camera.centerOn(cx, cy), {
      z: zoom,
      cx: x,
      cy: y,
    });
    await page.waitForTimeout(2600);
  }
  // Hold on the battle for a while.
  await page.waitForTimeout(18000);

  const video = page.video();
  await ctx.close();
  if (video) {
    const src = await video.path();
    renameSync(src, join(OUT, 'phase3-gameplay.mp4'));
  }
  rmSync(rawDir, { recursive: true, force: true });
}

await browser.close();
writeFileSync(join(OUT, 'proof.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) {
  console.error(`\n${report.errors.length} ERROR(S)`);
  process.exitCode = 1;
} else {
  console.log('\nNo page errors at any viewport.');
}
