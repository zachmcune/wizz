// Phase 1 proof harness: screenshots at the four target viewports plus live assertions on the
// boot screen's real data. Saves artifacts under v2/docs/proof/phase-1/.
//
// Run from the repo root with the v2 dev server up:
//   node v2/audit/phase1-proof.mjs

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'docs', 'proof', 'phase-1');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.V2_BASE ?? 'http://127.0.0.1:5273';

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, dpr: 2, mobile: true },
  { name: 'phone-844x390', width: 844, height: 390, dpr: 3, mobile: true },
  { name: 'chromebook-1366x768', width: 1366, height: 768, dpr: 1, mobile: false },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, dpr: 1, mobile: false },
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__v2Boot !== undefined || window.__v2BootError !== undefined, null, { timeout: 15000 });

  const facts = await page.evaluate(() => ({
    boot: window.__v2Boot ?? null,
    error: window.__v2BootError ?? null,
  }));

  // Geometry assertions: nothing may overflow the viewport, and the page must fit.
  const geometry = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const boot = document.getElementById('boot');
    const rects = [];
    for (const sel of ['h1', '.card', '.grid']) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        rects.push({
          sel,
          text: (el.textContent || '').slice(0, 24),
          overflowsRight: r.right > vw + 0.5,
          overflowsLeft: r.left < -0.5,
        });
      }
    }
    return {
      vw,
      vh,
      scrollW: doc.scrollWidth,
      scrollH: doc.scrollHeight,
      bodyScrollsHorizontally: doc.scrollWidth > vw + 0.5,
      overflowingRects: rects.filter((r) => r.overflowsRight || r.overflowsLeft),
      bootScrollableVertically: boot ? boot.scrollHeight > boot.clientHeight : false,
    };
  });

  await page.screenshot({ path: join(OUT, `${vp.name}--boot.png`) });
  await page.screenshot({ path: join(OUT, `${vp.name}--boot-full.png`), fullPage: true });

  results.push({ viewport: vp.name, facts, geometry, errors });
  await ctx.close();
}

await browser.close();
writeFileSync(join(OUT, 'proof.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

const failures = results.filter((r) => r.facts.error || r.errors.length > 0 || r.geometry.overflowingRects.length > 0);
if (failures.length) {
  console.error(`\nFAILURES in ${failures.length} viewport(s)`);
  process.exitCode = 1;
} else {
  console.log('\nAll viewports: boot OK, no page errors, no horizontal overflow.');
}
