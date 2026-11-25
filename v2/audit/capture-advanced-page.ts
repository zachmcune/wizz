// PROOF CAPTURES FOR THE ADVANCED-BUILDING PAGE — all five viewports, Buildings tab and Advanced page.
//
// The brief asks for captures at all five viewports showing that Resonance Vault, Arcane Nexus and Astral Spire are
// reachable. `audit/advanced-reach.ts` measures the DOM and `tests/touch/advanced-build.test.ts` builds one; this is the
// picture that goes with them.
//
// Each shot is taken AFTER the tile grid has settled, for the reason documented in the browser gate: `renderTiles`
// replaces its children whenever the tile key changes, so a screenshot taken during a rebuild catches a half-built grid.
//
//   PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-advanced-page.ts
//
// Writes docs/proof/phase-7/advanced/*.png.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
const OUT = 'docs/proof/phase-7/advanced';

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375 },
  { name: 'phone-844x390', width: 844, height: 390 },
  { name: 'portrait-390x844', width: 390, height: 844 },
  { name: 'chromebook-1366x768', width: 1366, height: 768 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/app.html?screen=match&seed=1000&d0=normal&d1=normal`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="hud"]', { timeout: 60_000 });
  await page.waitForTimeout(1800);

  // A portrait console starts collapsed; expand it so the tiles exist.
  const expand = page.locator('[data-testid="hud-expand"]');
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await page.waitForTimeout(250);
  }

  /** Wait until `.hud-tiles` stops being replaced, so the shot is of a finished grid. */
  const settle = async (): Promise<void> => {
    await page.waitForFunction(
      () => {
        const grid = document.querySelector('[data-testid="hud-tiles"]');
        if (!grid || grid.children.length === 0) return false;
        const w = window as unknown as { __grid?: Element; __n?: number };
        if (w.__grid === grid) {
          w.__n = (w.__n ?? 0) + 1;
        } else {
          w.__grid = grid;
          w.__n = 0;
        }
        return (w.__n ?? 0) >= 3;
      },
      undefined,
      { timeout: 15_000, polling: 'raf' },
    );
  };

  await page.locator('[data-tab="buildings"]').click();
  await page.waitForTimeout(250);
  await settle();
  await page.screenshot({ path: `${OUT}/${vp.name}--buildings-core.png` });

  await page.locator('[data-testid="hud-page-advanced"]').click();
  await page.waitForTimeout(250);
  await settle();
  await page.screenshot({ path: `${OUT}/${vp.name}--buildings-advanced.png` });

  const tiles = await page.locator('[data-testid="hud-tiles"] .prod-tile').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.tile ?? ''),
  );
  console.log(`${vp.name}: advanced page shows ${tiles.join(', ')}`);
  await page.close();
}

await browser.close();
console.log(`\nwrote ${VIEWPORTS.length * 2} captures to ${OUT}/`);
