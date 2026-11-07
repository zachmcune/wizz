// Phase-0 audit: capture lobby, gallery live preview, HUD interaction states.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:5173';
const OUT = resolve('v2/docs/baseline-screenshots');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, dpr: 2, mobile: true },
  { name: 'phone-844x390', width: 844, height: 390, dpr: 3, mobile: true },
  { name: 'chromebook-1366x768', width: 1366, height: 768, dpr: 1, mobile: false },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, dpr: 1, mobile: false },
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const out = [];

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
  const rec = { viewport: vp.name, steps: {}, errors };

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByTestId('menu-custom-game').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${vp.name}--10-lobby.png` });
    rec.steps.lobby = 'ok';

    // Start the match, then select HQ and open the build panel.
    await page.getByTestId('lobby-template').selectOption('skirmish_1v1');
    await page.getByTestId('lobby-start').click();
    await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 20000 });
    await page.waitForTimeout(1500);

    const box = await page.locator('[data-testid="game-canvas-host"] canvas').boundingBox();
    // The sanctum is centered at match start. Click center to select it.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.52);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${vp.name}--11-hq-build-panel.png` });
    rec.steps.hqPanel = await page.locator('.cmd-card').isVisible();

    // Try opening the Build tab / build menu.
    const buildTab = page.locator('.panel-tab', { hasText: 'Build' });
    if (await buildTab.count()) {
      await buildTab.first().click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${vp.name}--12-build-menu.png` });
    }

    // Pause overlay.
    const pauseBtn = page.locator('.menu-btn', { hasText: 'Pause' });
    if (await pauseBtn.count()) {
      await pauseBtn.first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${vp.name}--13-paused.png` });
      const resume = page.locator('.pause-card .btn.big', { hasText: 'Resume' });
      if (await resume.count()) await resume.first().click();
      await page.waitForTimeout(300);
    }

    // HUD overflow measurement: does the top bar or cmd card overflow the viewport?
    rec.overflow = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const res = {};
      for (const sel of ['.topbar', '.cmd-card', '.minimap-panel', '.spell-bar', '.hud']) {
        const el = document.querySelector(sel);
        if (!el) { res[sel] = null; continue; }
        const r = el.getBoundingClientRect();
        res[sel] = {
          rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
          overflowsRight: r.right > vw + 0.5,
          overflowsBottom: r.bottom > vh + 0.5,
          scrollH: el.scrollHeight,
          clientH: el.clientHeight,
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
        };
      }
      res.viewport = { vw, vh };
      return res;
    });
  } catch (e) {
    rec.error = String(e);
  }

  // Gallery: open a live troop preview.
  try {
    await page.goto(`${BASE}/?gallery=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.art-gallery-card', { timeout: 20000 });
    await page.waitForTimeout(1000);
    const cards = page.locator('.art-gallery-card-live');
    const n = await cards.count();
    rec.liveCards = n;
    if (n > 0) {
      await cards.first().click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/${vp.name}--14-gallery-live-preview.png` });
    }
  } catch (e) {
    rec.galleryError = String(e);
  }

  out.push(rec);
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
