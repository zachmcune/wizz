// HUD GEOMETRY HARNESS — measures the two things Zachary reported, on the real rendered HUD.
//
// (1) On 667x375 the selected-unit panel covered about half the screen. The HUD as a whole must be at
//     most 18% of the viewport AREA at that size.
// (2) The hint text ('WASD' / '+ / -') overlapped the Move button on Chromebook. No two HUD elements
//     may overlap at any of the four target viewports.
//
// Both are measured from real layout boxes (`getBoundingClientRect`) in a real browser at the real
// viewport, because both are layout bugs that no source inspection can catch.
//
// Area is computed as the union of the HUD elements' rects clipped to the viewport, NOT the sum of the
// rects — overlapping panels must not be double-counted, or a bug could hide inside an inflated number.
//
// Run: node audit/hud-geometry.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs/proof/phase-4');
const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, density: 'compact' },
  { name: 'phone-844x390', width: 844, height: 390, density: 'compact' },
  { name: 'chromebook-1366x768', width: 1366, height: 768, density: 'regular' },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, density: 'roomy' },
];

const HUD_AREA_LIMIT = 0.18;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const report = { generated: new Date().toISOString(), base: BASE, hudAreaLimit: HUD_AREA_LIMIT, viewports: [], errors: [] };

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(`${vp.name}: ${e.message}`));

  // The match screen is where the HUD lives. It boots a real match with real DOM chrome.
  await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__app !== undefined, null, { timeout: 30000 });
  // Wait for a unit to be selected so the selection panel is populated — that is the panel that grew
  // too large, so measuring an empty panel would understate the problem.
  await page.waitForFunction(() => document.querySelector('.hud-select') !== null, null, { timeout: 15000 });
  await page.waitForTimeout(600);

  const m = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Every element that is part of the HUD chrome (not the canvas).
    const SEL = [
      '.hud-top', '.hud-select', '.hud-cmd', '.hud-minimap', '.hud-zoom', '.hud-hint',
      '.hud-research', '.hud-build', '.hud-train', '.hud-toast',
    ];
    const els = [];
    for (const sel of SEL) {
      for (const e of document.querySelectorAll(sel)) {
        const r = e.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        // The toast is a transient notification, not persistent chrome. It is only counted when shown.
        if (sel === '.hud-toast' && !e.classList.contains('is-on')) continue;
        // Hidden elements (display:none yields a zero rect) are already excluded above.
        els.push({ sel, x: r.left, y: r.top, w: r.width, h: r.height, cls: e.className, node: e });
      }
    }

    /**
     * Overlap means two SIBLING ZONES colliding, not a parent containing its child.
     *
     * `.hud-select` now lives inside `.hud-top` by design (that is what removed the extra band of
     * height), so a naive rect intersection reports the containment as an overlap. Only pairs where
     * neither element contains the other are real layout collisions.
     */
    const related = (a, b) => a.node.contains(b.node) || b.node.contains(a.node);

    // Union area of all HUD rects clipped to the viewport, via a coarse raster. 1px resolution is
    // exact enough for a percentage and avoids implementing polygon union.
    const covered = new Uint8Array(Math.ceil(vw) * Math.ceil(vh));
    for (const e of els) {
      const x0 = Math.max(0, Math.floor(e.x));
      const y0 = Math.max(0, Math.floor(e.y));
      const x1 = Math.min(vw, Math.ceil(e.x + e.w));
      const y1 = Math.min(vh, Math.ceil(e.y + e.h));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) covered[y * Math.ceil(vw) + x] = 1;
    }
    let coveredPx = 0;
    for (let i = 0; i < covered.length; i++) coveredPx += covered[i];

    // Pairwise overlaps between distinct HUD elements. Elements that merely touch (share an edge)
    // produce zero-area intersections and are not overlaps.
    const overlaps = [];
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i];
        const b = els[j];
        if (related(a, b)) continue;
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ix > 1 && iy > 1) {
          overlaps.push({
            a: `${a.sel}`,
            b: `${b.sel}`,
            overlapPx: Math.round(ix * iy),
            detail: `${Math.round(ix)}x${Math.round(iy)}`,
          });
        }
      }
    }

    // Anything spilling outside the viewport is also a layout failure.
    const outside = els
      .filter((e) => e.x < -0.5 || e.y < -0.5 || e.x + e.w > vw + 0.5 || e.y + e.h > vh + 0.5)
      .map((e) => e.sel);

    return {
      viewport: `${vw}x${vh}`,
      hudElements: els.length,
      hudAreaPx: coveredPx,
      hudAreaFraction: coveredPx / (vw * vh),
      overlaps,
      outside: [...new Set(outside)],
    };
  });

  report.viewports.push({ ...vp, ...m, errors: errs });
  if (errs.length) report.errors.push(...errs);
  console.log(
    `${vp.name.padEnd(20)} HUD ${(m.hudAreaFraction * 100).toFixed(1)}% of screen ` +
      `(${m.hudElements} elements)  overlaps: ${m.overlaps.length}  outside: ${m.outside.length}`,
  );
  for (const o of m.overlaps) console.log(`   OVERLAP ${o.a} / ${o.b} = ${o.detail}`);
  if (m.outside.length) console.log(`   OUTSIDE ${m.outside.join(', ')}`);

  await page.close();
}

await browser.close();
writeFileSync(join(OUT, 'hud-geometry.json'), JSON.stringify(report, null, 2));

const phone = report.viewports.find((v) => v.name === 'phone-667x375');
const anyOverlap = report.viewports.some((v) => v.overlaps.length > 0);
const anyOutside = report.viewports.some((v) => v.outside.length > 0);
const areaOk = phone && phone.hudAreaFraction <= HUD_AREA_LIMIT;

console.log('');
console.log(`phone HUD area ${(phone ? phone.hudAreaFraction * 100 : 0).toFixed(1)}% (limit ${HUD_AREA_LIMIT * 100}%) -> ${areaOk ? 'PASS' : 'FAIL'}`);
console.log(`overlaps anywhere -> ${anyOverlap ? 'FAIL' : 'PASS'}`);
console.log(`overflow anywhere -> ${anyOutside ? 'FAIL' : 'PASS'}`);
if (!areaOk || anyOverlap || anyOutside) process.exitCode = 1;
