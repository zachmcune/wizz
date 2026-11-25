// ARE THE ADVANCED STRUCTURES REACHABLE? — every build tile, its page, and whether its blocker names a prerequisite.
//
// Resonance Vault, Arcane Nexus and Astral Spire were tagged `menuCategory: advanced` and mapped onto NO console tab, so
// they could not be built at all. They are reachable through the Buildings tab's Core/Advanced switch now, and this proves
// it by reading the DOM at every viewport rather than by inspecting the filter.
//
// For each viewport it reports: the switch's presence and state, the Advanced page's tile list, and each tile's blocker
// text — because "reachable" means a player can see it, read why it is locked, and tap it once the prerequisite is met.
//
//   PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/advanced-reach.ts

import { chromium } from 'playwright';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375 },
  { name: 'phone-844x390', width: 844, height: 390 },
  { name: 'portrait-390x844', width: 390, height: 844 },
  { name: 'chromebook-1366x768', width: 1366, height: 768 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
];

const REQUIRED = ['resonance_vault', 'arcane_nexus', 'astral_spire'];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
let failures = 0;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(`${BASE}/app.html?screen=match&seed=1000&d0=normal&d1=normal`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="hud"]', { timeout: 60_000 });
  await page.waitForTimeout(2000);

  // The console starts collapsed in portrait; open it so the tiles exist.
  const collapsed = await page.locator('[data-testid="hud-expand"]').isVisible().catch(() => false);
  if (collapsed) await page.locator('[data-testid="hud-expand"]').click();
  await page.waitForTimeout(300);

  const switchVisible = await page.locator('[data-testid="hud-build-pages"]').isVisible();
  const coreTiles = await page.locator('[data-testid="hud-tiles"] .prod-tile').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.tile ?? ''),
  );

  await page.locator('[data-testid="hud-page-advanced"]').click();
  await page.waitForTimeout(300);

  const advTiles = await page.locator('[data-testid="hud-tiles"] .prod-tile').evaluateAll((els) =>
    els.map((e) => {
      const h = e as HTMLElement;
      return {
        tile: h.dataset.tile ?? '',
        blocked: h.dataset.blocked === 'true',
        title: h.getAttribute('title') ?? '',
        text: (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
      };
    }),
  );

  const found = advTiles.map((t) => t.tile);
  const missing = REQUIRED.filter((r) => !found.includes(r));
  if (!switchVisible) {
    console.log(`${vp.name}: FAIL — the Core/Advanced switch is not visible`);
    failures++;
  }
  if (missing.length > 0) {
    console.log(`${vp.name}: FAIL — advanced page is missing ${missing.join(', ')}`);
    failures++;
  }
  console.log(`\n${vp.name}  switch=${switchVisible ? 'yes' : 'NO'}  core tiles=${coreTiles.length}`);
  for (const t of advTiles) {
    const pr = /Requires/.test(t.title) ? 'prereq' : t.blocked ? 'blocked' : 'buildable';
    console.log(`   ${t.tile.padEnd(17)} ${pr.padEnd(9)} ${t.title.slice(0, 110)}`);
  }
  await page.close();
}

console.log(`\n${failures === 0 ? 'ALL VIEWPORTS OK' : `${failures} FAILURES`}`);
await browser.close();
if (failures > 0) process.exit(1);
