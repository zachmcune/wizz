// Phase-0 audit harness: captures baseline screenshots at target viewports and
// measures frame timings for the CURRENT (v1) game. Throwaway tooling; not shipped.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:5173';
const OUT = resolve('v2/docs/baseline-screenshots');

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, dpr: 2, mobile: true },
  { name: 'phone-844x390', width: 844, height: 390, dpr: 3, mobile: true },
  { name: 'chromebook-1366x768', width: 1366, height: 768, dpr: 1, mobile: false },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, dpr: 1, mobile: false },
];

mkdirSync(OUT, { recursive: true });

const results = [];

async function startMatch(page) {
  await page.getByTestId('menu-custom-game').click();
  await page.getByTestId('lobby-template').selectOption('skirmish_1v1');
  await page.getByTestId('lobby-start').click();
  await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function measureFrames(page, ms = 4000) {
  return page.evaluate((duration) => {
    return new Promise((resolve) => {
      const frames = [];
      let last = performance.now();
      const start = last;
      function tick(now) {
        frames.push(now - last);
        last = now;
        if (now - start < duration) requestAnimationFrame(tick);
        else {
          const sorted = frames.slice(1).sort((a, b) => a - b);
          const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
          const total = sorted.reduce((s, v) => s + v, 0);
          resolve({
            count: sorted.length,
            avgMs: total / Math.max(1, sorted.length),
            p50Ms: at(0.5),
            p95Ms: at(0.95),
            p99Ms: at(0.99),
            worstMs: sorted[sorted.length - 1] ?? 0,
            fps: 1000 / (total / Math.max(1, sorted.length)),
          });
        }
      }
      requestAnimationFrame(tick);
    });
  }, ms);
}

// Long-task / jank sampling via PerformanceObserver is not available after the fact,
// so measure main-thread blocking with a setInterval drift probe instead.
async function measureEventLoopLag(page, ms = 3000) {
  return page.evaluate((duration) => {
    return new Promise((resolve) => {
      const lags = [];
      let expected = performance.now() + 16;
      const start = performance.now();
      const id = setInterval(() => {
        const now = performance.now();
        lags.push(Math.max(0, now - expected));
        expected = now + 16;
        if (now - start >= duration) {
          clearInterval(id);
          const sorted = [...lags].sort((a, b) => a - b);
          resolve({
            samples: sorted.length,
            p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
            p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
            max: sorted[sorted.length - 1] ?? 0,
          });
        }
      }, 16);
    });
  }, ms);
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.mobile
      ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
      : vp.name.startsWith('chromebook')
        ? 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
        : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${vp.name}--01-main-menu.png` });

  const perf = {};
  try {
    await startMatch(page);
    await page.screenshot({ path: `${OUT}/${vp.name}--02-match-start.png` });

    perf.idle = await measureFrames(page, 4000);
    perf.lagIdle = await measureEventLoopLag(page, 2500);

    // Select HQ to open the build panel.
    const canvas = page.locator('[data-testid="game-canvas-host"] canvas');
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${vp.name}--03-hud-selection.png` });

    // Zoom out to max for worst-case draw distance.
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 120);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${vp.name}--04-zoomed-out.png` });
    perf.zoomOut = await measureFrames(page, 3000);

    // Pan across the map for a few seconds to exercise streaming/culling.
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down({ button: 'middle' });
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(
        box.x + box.width * (0.5 - i * 0.008),
        box.y + box.height * (0.5 - i * 0.004),
      );
      await page.waitForTimeout(25);
    }
    await page.mouse.up({ button: 'middle' });
    perf.panning = await measureFrames(page, 3000);
    await page.screenshot({ path: `${OUT}/${vp.name}--05-after-pan.png` });

    // Run the match for a while so armies exist, then measure.
    await page.waitForTimeout(20000);
    perf.midMatch = await measureFrames(page, 4000);
    perf.lagMid = await measureEventLoopLag(page, 2500);
    await page.screenshot({ path: `${OUT}/${vp.name}--06-mid-match.png` });

    const debug = await page.evaluate(() => {
      const el = document.querySelector('.debug-overlay');
      return el ? el.textContent : null;
    });
    perf.debugOverlay = debug;
  } catch (err) {
    perf.error = String(err);
  }

  // Settings screen + gallery.
  try {
    await page.keyboard.press('Escape');
    const settingsBtn = page.locator('.menu-btn', { hasText: 'Settings' }).first();
    if (await settingsBtn.count()) {
      await settingsBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${vp.name}--07-settings.png` });
      await page.keyboard.press('Escape');
      await page.locator('.settings-screen .btn.big', { hasText: 'Resume' }).first().click().catch(() => {});
    }
  } catch (err) {
    perf.settingsError = String(err);
  }

  try {
    await page.goto(`${BASE}/?gallery=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.art-gallery-card', { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${vp.name}--08-entity-designs.png` });
    await page.screenshot({ path: `${OUT}/${vp.name}--09-entity-designs-full.png`, fullPage: true });
  } catch (err) {
    perf.galleryError = String(err);
  }

  results.push({ viewport: vp.name, perf, pageErrors: errors });
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/../baseline-perf.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
