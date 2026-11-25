// Phase 1 screen recording: a short capture of the boot screen loading real content, plus an
// interaction that re-triggers rendering (resize across viewports) so the recording shows the
// layout responding rather than a single static frame.
//
// Run from the repo root with the v2 dev server up:
//   node v2/audit/phase1-video.mjs

import { chromium } from '@playwright/test';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'docs', 'proof', 'phase-1');
const RAW = join(OUT, '_video');
mkdirSync(OUT, { recursive: true });
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const BASE = process.env.V2_BASE ?? 'http://127.0.0.1:5273';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

// Record at a Chromebook-ish size; the point is to show the live data, not a specific device.
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  recordVideo: { dir: RAW, size: { width: 1366, height: 768 } },
});
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__v2Boot !== undefined, null, { timeout: 15000 });

// Hold on the populated screen so the numbers are readable.
await page.waitForTimeout(2600);

// Scroll through the sections so the recording shows the whole report.
for (let i = 0; i < 3; i++) {
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(700);
}
await page.mouse.wheel(0, -900);
await page.waitForTimeout(900);

// Resize to a phone-landscape width and back, proving the layout is responsive.
await page.setViewportSize({ width: 667, height: 375 });
await page.waitForTimeout(1500);
await page.setViewportSize({ width: 1366, height: 768 });
await page.waitForTimeout(1200);

const video = page.video();
await ctx.close();
await browser.close();

if (!video) throw new Error('no video was captured');
const src = await video.path();
const dest = join(OUT, 'phase-1-boot.mp4');
renameSync(src, dest);
rmSync(RAW, { recursive: true, force: true });
console.log(`wrote ${dest}`);
