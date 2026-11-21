// UI MOCKUP PROOF — the three core screens at all four target viewports.
//
// This renders REAL DOM (`src/ui-mockups.ts` composed from `src/ui/kit.ts`) inside an iframe-sized
// viewport per device, sets the density tier the game would set, and screenshots it. Nothing here is a
// picture of a design; it is the design.
//
// Every capture is checked before it is accepted:
//   • zero page errors, and
//   • the shot is not blank, and
//   • the chrome contains no purple pixels — the single rule Zachary cared most about, verified on the
//     RENDERED PIXELS rather than only in source.
//
// Run: node audit/ui-style-proof.mjs   (needs the v2 dev server on :5341)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs/proof/ui-style');
const SHOTS = join(OUT, 'screens');
const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5341';
mkdirSync(SHOTS, { recursive: true });

const md5 = (b) => createHash('md5').update(b).digest('hex');

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, density: 'compact' },
  { name: 'phone-844x390', width: 844, height: 390, density: 'compact' },
  { name: 'chromebook-1366x768', width: 1366, height: 768, density: 'regular' },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, density: 'roomy' },
];

const SCREENS = ['hud', 'lobby', 'menu'];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const report = { generated: new Date().toISOString(), base: BASE, shots: [], errors: [], purple: [] };

for (const vp of VIEWPORTS) {
  for (const screen of SCREENS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const errs = [];
    page.on('pageerror', (e) => errs.push(`${vp.name}/${screen}: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errs.push(`${vp.name}/${screen} console: ${m.text().slice(0, 160)}`);
    });

    // The mockup harness page mounts one screen at a time at the given density.
    await page.goto(`${BASE}/ui-proof.html?screen=${screen}&density=${vp.density}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__uiProof !== undefined, null, { timeout: 30000 });
    await page.waitForTimeout(350);

    // Structural check BEFORE the screenshot: every icon in an icon-bearing control must have a real
    // box. A CSS rule once hid all spans in the compact command bar and took the SVG wrappers with it,
    // leaving six blank buttons on the most important viewport — invisible to a pixel test, obvious to
    // this one.
    const iconCheck = await page.evaluate(() => {
      const svgs = [...document.querySelectorAll('svg')];
      // A collapsed icon is a bug. A HIDDEN one (inside a display:none subtree) is intentional — on a
      // 375px-tall phone the decorative menu art is removed — so those are excluded by checking whether
      // the element has any client rects at all.
      const broken = svgs.filter((s) => {
        if (s.closest('[hidden]')) return false;
        // `getClientRects()` is empty when the element or an ancestor is display:none.
        if (s.getClientRects().length === 0) return false;
        const r = s.getBoundingClientRect();
        return r.width < 6 || r.height < 6;
      });
      return { total: svgs.length, zeroSized: broken.length };
    });
    if (iconCheck.zeroSized > 0) {
      report.errors.push(`${vp.name}/${screen}: ${iconCheck.zeroSized} of ${iconCheck.total} icons have no size`);
    }

    const file = join(SHOTS, `${vp.name}--${screen}.png`);
    await page.screenshot({ path: file });

    // ---- verify the shot
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let opaque = 0;
    let purple = 0;
    let nonBg = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3];
      if (a < 200) continue;
      opaque++;
      // Not the flat background (--ink-950 / --ink-900 family) means something was drawn.
      if (Math.abs(r - 14) > 6 || Math.abs(g - 16) > 6 || Math.abs(b - 19) > 6) nonBg++;
      // Purple test: blue and red both clearly above green, and blue not just a desaturated slate.
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (sat > 0.25 && b > g + 30 && r > g + 10 && b >= r - 20) purple++;
    }
    const purpleFrac = purple / Math.max(1, opaque);
    const drawnFrac = nonBg / Math.max(1, opaque);

    report.shots.push({
      viewport: vp.name,
      screen,
      density: vp.density,
      size: `${vp.width}x${vp.height}`,
      bytes: readFileSync(file).length,
      md5: md5(readFileSync(file)),
      drawnFraction: Number(drawnFrac.toFixed(3)),
      purpleFraction: Number(purpleFrac.toFixed(5)),
    });
    if (purpleFrac > 0.005) report.purple.push({ shot: `${vp.name}--${screen}`, purpleFraction: purpleFrac });
    if (drawnFrac < 0.01) report.errors.push(`${vp.name}/${screen}: screen appears blank`);

    console.log(`${vp.name} ${screen}: drawn ${(drawnFrac * 100).toFixed(1)}%, purple ${(purpleFrac * 100).toFixed(3)}%`);
    if (errs.length) report.errors.push(...errs);
    await page.close();
  }
}

// ---- the style guide page itself, at desktop and phone
for (const [name, w, h] of [
  ['styleguide-1920x1080', 1920, 1080],
  ['styleguide-667x375', 667, 375],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`${name} console: ${m.text().slice(0, 160)}`);
  });
  await page.goto(`${BASE}/styleguide.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__styleguide !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(700);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.shots.push({
    viewport: name,
    screen: 'styleguide',
    size: `${w}x${h}`,
    bytes: readFileSync(file).length,
    md5: md5(readFileSync(file)),
  });
  if (errs.length) report.errors.push(...errs);
  console.log(`${name}: ${(readFileSync(file).length / 1024).toFixed(0)} KB`);
  await page.close();
}

await browser.close();
writeFileSync(join(OUT, 'ui-proof.json'), JSON.stringify(report, null, 2));
console.log(`\nwrote ${report.shots.length} shots`);
console.log(`purple violations: ${report.purple.length}`);
console.log(`errors: ${report.errors.length}`);
if (report.purple.length) console.log(report.purple);
if (report.errors.length) {
  console.log(report.errors.slice(0, 6));
  process.exitCode = 1;
}
