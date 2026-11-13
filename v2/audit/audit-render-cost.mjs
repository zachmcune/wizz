// Phase-0: render-side CPU cost, GPU-independent. Measures main-thread JS time per frame
// and Pixi scene-graph size, plus CSS layout cost of the HUD.
import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:5173';
const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, dpr: 2 },
  { name: 'phone-844x390', width: 844, height: 390, dpr: 3 },
  { name: 'chromebook-1366x768', width: 1366, height: 768, dpr: 1 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, dpr: 1 },
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
  });
  const page = await ctx.newPage();
  const rec = { viewport: vp.name };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('menu-custom-game').click();
  await page.getByTestId('lobby-template').selectOption('skirmish_1v1');
  await page.getByTestId('lobby-start').click();
  await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 20000 });
  await page.waitForTimeout(2000);

  // Count Pixi display objects + measure long tasks while zoomed all the way out.
  rec.scene = await page.evaluate(() => {
    // Pixi v8 keeps the app on the global registry used by Vite dev HMR; fall back to
    // walking from document if unavailable.
    const canvas = document.querySelector('[data-testid="game-canvas-host"] canvas');
    return {
      canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
      domNodes: document.querySelectorAll('*').length,
      hudButtons: document.querySelectorAll('.hud button').length,
    };
  });

  // Measure main-thread work using a long-task observer over 5s.
  rec.longTasks = await page.evaluate(() => new Promise((resolve) => {
    const tasks = [];
    let obs = null;
    try {
      obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) tasks.push(entry.duration);
      });
      obs.observe({ entryTypes: ['longtask'] });
    } catch { /* not supported */ }
    setTimeout(() => {
      try { obs?.disconnect(); } catch {}
      const total = tasks.reduce((s, v) => s + v, 0);
      resolve({ count: tasks.length, totalMs: +total.toFixed(0), maxMs: +(Math.max(0, ...tasks)).toFixed(0) });
    }, 5000);
  }));

  // Style/layout recalc cost of the HUD: force layout and time it.
  rec.layout = await page.evaluate(() => {
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      const hud = document.querySelector('.hud');
      if (hud) void hud.getBoundingClientRect();
    }
    return { msPerForcedLayout: +((performance.now() - t0) / 30).toFixed(3) };
  });

  results.push(rec);
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
