// WHERE DOES THE PHONE CONSOLE'S HEIGHT GO? — every row of .hud-side measured at the phone viewports.
//
// A tile label is being clipped by `.hud-tiles` on 667x375 and 844x390 when a Core/Advanced page switch is added to the
// Buildings tab. The switch is inside the radar header, so the cause is not obvious from the CSS: something above the
// grid is taller than it was, or the radar's own height changed. This measures every child of the console, so the row
// that grew is named rather than inferred.
//
//   PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/hud-rows.ts

import { chromium } from 'playwright';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375 },
  { name: 'phone-844x390', width: 844, height: 390 },
  { name: 'chromebook-1366x768', width: 1366, height: 768 },
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(`${BASE}/app.html?screen=match&seed=1000&d0=normal&d1=normal`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="hud"]', { timeout: 60_000 });
  await page.waitForTimeout(2500);
  const rows = await page.evaluate(() => {
    const hud = document.querySelector('[data-testid="hud"]') as HTMLElement | null;
    const side = document.querySelector('.hud-side') as HTMLElement | null;
    if (!hud || !side) return null;
    const sideBox = side.getBoundingClientRect();
    const kids = [...side.children].map((c) => {
      const el = c as HTMLElement;
      const r = el.getBoundingClientRect();
      return {
        cls: el.className || el.tagName,
        h: Math.round(r.height),
        w: Math.round(r.width),
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        hidden: el.hidden,
      };
    });
    const tiles = document.querySelector('.hud-tiles') as HTMLElement | null;
    return {
      sideH: Math.round(sideBox.height),
      sideW: Math.round(sideBox.width),
      tilesH: tiles ? Math.round(tiles.getBoundingClientRect().height) : -1,
      tilesScroll: tiles ? tiles.scrollHeight : -1,
      kids,
    };
  });
  console.log(`\n${vp.name} (${vp.width}x${vp.height})`);
  if (!rows) {
    console.log('  hud not found');
  } else {
    console.log(`  .hud-side ${rows.sideW}x${rows.sideH}  .hud-tiles h=${rows.tilesH} scrollH=${rows.tilesScroll}`);
    for (const k of rows.kids) {
      console.log(`    ${String(k.h).padStart(4)}px  ${k.cls}${k.hidden ? '  [hidden]' : ''}`);
    }
  }
  await page.close();
}
await browser.close();
