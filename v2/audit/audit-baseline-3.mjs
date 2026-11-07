// Phase-0 audit: find the Sanctum via click probing, then exercise the real build flow.
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
const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const rec = { viewport: vp.name, errors: [] };
  page.on('pageerror', (e) => rec.errors.push(e.message));

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByTestId('menu-custom-game').click();
    await page.getByTestId('lobby-template').selectOption('skirmish_1v1');
    await page.getByTestId('lobby-start').click();
    await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 20000 });
    await page.waitForTimeout(1800);

    const box = await page.locator('[data-testid="game-canvas-host"] canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Probe clicks radially from the viewport centre until the Sanctum is selected.
    const probes = [[0, 0], [0, -12], [0, -24], [0, 12], [0, -36], [10, -10], [-10, -10], [0, 24]];
    let found = null;
    for (const [dx, dy] of probes) {
      await page.mouse.click(cx + dx, cy + dy);
      await page.waitForTimeout(220);
      const name = (await page.locator('.sel-name').textContent())?.trim();
      const buildVisible = await page.locator('.panel-tab', { hasText: 'Build' }).first().isVisible().catch(() => false);
      if (buildVisible) { found = { dx, dy, name }; break; }
      if (name === 'Sanctum') { found = { dx, dy, name }; break; }
    }
    rec.sanctumProbe = found;

    if (found) {
      await page.screenshot({ path: `${OUT}/${vp.name}--11-hq-build-panel.png` });
      const buildTab = page.locator('.panel-tab', { hasText: 'Build' }).first();
      if (await buildTab.isVisible()) {
        await buildTab.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}/${vp.name}--12-build-menu.png` });
        rec.buildMenuVisible = true;

        // Count build entries and try to start placing an Attunement Spire.
        const chips = page.locator('.cmd-card button');
        rec.buildButtonCount = await chips.count();
        const spire = page.locator('.cmd-card button', { hasText: /Attunement|MINE|Spire/ }).first();
        if (await spire.count()) {
          await spire.click();
          await page.waitForTimeout(600);
          await page.screenshot({ path: `${OUT}/${vp.name}--15-placing-spire.png` });
          rec.placing = (await page.locator('.build-confirm').isVisible().catch(() => false));
          // Confirm placement at the centre-ish of the map.
          const placeBtn = page.locator('.build-confirm .btn.confirm');
          if (await placeBtn.isVisible().catch(() => false)) {
            const disabled = await placeBtn.isDisabled();
            rec.placeEnabled = !disabled;
            if (!disabled) await placeBtn.click();
            await page.waitForTimeout(600);
          }
        }
      }
    } else {
      await page.screenshot({ path: `${OUT}/${vp.name}--11-hq-not-found.png` });
    }

    // HUD geometry audit.
    rec.hud = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const out = { viewport: { vw, vh }, elements: {} };
      for (const sel of ['.topbar', '.cmd-card', '.minimap-panel', '.spell-bar', '.stats', '.hud', '.zoom-slider', '.coach']) {
        const el = document.querySelector(sel);
        if (!el) { out.elements[sel] = 'missing'; continue; }
        const r = el.getBoundingClientRect();
        out.elements[sel] = {
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          overflowRightPx: Math.max(0, Math.round(r.right - vw)),
          overflowBottomPx: Math.max(0, Math.round(r.bottom - vh)),
          clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
        };
      }
      // How much of the screen does the HUD chrome cover?
      let area = 0;
      for (const sel of ['.topbar', '.cmd-card', '.minimap-panel', '.zoom-slider', '.spell-bar']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        area += r.width * r.height;
      }
      out.hudAreaPct = +((area / (vw * vh)) * 100).toFixed(1);
      return out;
    });

    // Long-run: measure CPU frame time of the render+sim loop with the debug overlay reading.
    await page.waitForTimeout(25000);
    await page.screenshot({ path: `${OUT}/${vp.name}--16-late-hud.png` });
    rec.late = await page.evaluate(() => {
      const t = document.querySelector('.debug-overlay')?.textContent ?? null;
      return t;
    });
  } catch (e) {
    rec.error = String(e).slice(0, 400);
  }
  results.push(rec);
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
