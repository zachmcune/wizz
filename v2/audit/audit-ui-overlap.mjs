// Phase-0: precisely test whether UI layers overlap / intercept clicks.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:5173';
const OUT = resolve('v2/docs/baseline-screenshots');

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

function overlap(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return Math.round(x * y);
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const rec = { viewport: vp.name };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('menu-custom-game').click();
  await page.getByTestId('lobby-template').selectOption('skirmish_1v1');
  await page.getByTestId('lobby-start').click();
  await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 20000 });
  await page.waitForTimeout(1800);

  const box = await page.locator('[data-testid="game-canvas-host"] canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 12);
  await page.waitForTimeout(500);
  await page.locator('.panel-tab', { hasText: 'Build' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.cmd-card button', { hasText: /Attunement Spire/ }).first().click();
  await page.waitForTimeout(600);

  rec.geometry = await page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        left: +r.left.toFixed(0), top: +r.top.toFixed(0), right: +r.right.toFixed(0), bottom: +r.bottom.toFixed(0),
        w: +r.width.toFixed(0), h: +r.height.toFixed(0),
        display: cs.display, position: cs.position, zIndex: cs.zIndex, pointerEvents: cs.pointerEvents,
      };
    };
    return {
      confirm: get('.build-confirm'),
      placeBtn: get('.build-confirm .btn.confirm'),
      coach: get('.coach'),
      cmdCard: get('.cmd-card'),
      minimap: get('.minimap-panel'),
      topbar: get('.topbar'),
    };
  });

  const { confirm, coach } = rec.geometry;
  rec.coachConfirmOverlapPx2 = confirm && coach ? overlap(confirm, coach) : 0;

  // Is the Place button actually hit-testable at its own centre?
  rec.placeHitTest = await page.evaluate(() => {
    const btn = document.querySelector('.build-confirm .btn.confirm');
    if (!btn) return 'missing';
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const topEl = document.elementFromPoint(cx, cy);
    if (!topEl) return 'nothing';
    const same = topEl === btn || btn.contains(topEl);
    return { same, topTag: topEl.tagName, topClass: topEl.className, topText: (topEl.textContent || '').slice(0, 40) };
  });

  // Dismiss the tutorial and re-measure.
  const gotIt = page.locator('.coach .btn', { hasText: 'Got it' });
  if (await gotIt.count()) {
    await gotIt.first().click();
    await page.waitForTimeout(500);
    rec.placeHitTestAfterDismiss = await page.evaluate(() => {
      const btn = document.querySelector('.build-confirm .btn.confirm');
      if (!btn) return 'missing';
      const r = btn.getBoundingClientRect();
      const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return topEl ? { same: topEl === btn || btn.contains(topEl), topTag: topEl.tagName, topClass: topEl.className } : 'nothing';
    });
    await page.screenshot({ path: `${OUT}/${vp.name}--17-placing-after-coach-dismiss.png` });
  }

  // Now try the actual place click.
  try {
    await page.locator('.build-confirm .btn.confirm').click({ timeout: 4000 });
    rec.placeClick = 'ok';
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${vp.name}--18-spire-placed.png` });
    rec.mana = await page.locator('.stat-mana').textContent();
  } catch (e) {
    rec.placeClick = 'failed: ' + String(e).split('\n')[0];
  }

  results.push(rec);
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
