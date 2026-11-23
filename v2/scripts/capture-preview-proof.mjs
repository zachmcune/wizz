// Proof capture for the dual-app Pages deploy: boots the DEPLOYED v2 from /v2/, starts a skirmish
// against the AI, plays for ~30 s, and saves menu + in-game screenshots at both proof viewports.
//
// Run: node v2/scripts/capture-preview-proof.mjs [base-url]
/* global document */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://cursor-rebuild-v2-5642.wizz-aw8.pages.dev';
const OUT = 'v2/docs/proof/preview';

const VIEWPORTS = [
  { name: 'chromebook-1366x768', width: 1366, height: 768 },
  { name: 'phone-390x844', width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

let failures = 0;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });

  console.log(`\n== ${vp.name} (${vp.width}x${vp.height}) ==`);
  await page.goto(`${BASE}/v2/`, { waitUntil: 'networkidle', timeout: 60_000 });

  // The menu proves v2 (not v1) is serving: the v1 build has no .menu-title element at all.
  await page.waitForSelector('.menu-title', { timeout: 30_000 });
  const menuCanvas = await page.locator('[data-testid="menu-art"] canvas').count();
  const bundle = await page.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')),
  );  console.log('menu title:', await page.locator('.menu-title').textContent());
  console.log('menu art canvases:', menuCanvas);
  console.log('scripts:', bundle);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/v2-menu-${vp.name}.png` });

  // Skirmish → lobby (2 players, human vs AI by default) → start.
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.waitForSelector('[data-testid="start-match"]', { timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/v2-lobby-${vp.name}.png` });
  await page.locator('[data-testid="start-match"]').click();

  await page.waitForSelector('.hud', { timeout: 30_000 });
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/v2-match-start-${vp.name}.png` });

  // Play: drag the map, order the opening units, wait. Long enough for real game time to pass.
  const canvas = page.locator('.match-canvas canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    // Select the starting units (rubber-band over the base) and move them out toward the field.
    await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.33);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.66, box.y + box.height * 0.67, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.4);
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(30_000);

  const clock = await page.evaluate(() => document.querySelector('.hud-top__clock .num')?.textContent ?? null);
  const stats = await page.evaluate(() => {
    const text = [...document.querySelectorAll('.hud-bar *')]
      .map((n) => n.textContent?.trim() ?? '')
      .filter(Boolean);
    return text.slice(0, 24);
  });
  console.log('match clock:', clock);
  console.log('hud readouts:', stats);
  await page.screenshot({ path: `${OUT}/v2-match-30s-${vp.name}.png` });

  console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');
  console.log('page errors:', pageErrors.length ? pageErrors : 'none');
  console.log('responses >=400:', badResponses.length ? badResponses : 'none');
  if (consoleErrors.length + pageErrors.length + badResponses.length > 0) failures++;

  await page.close();
}

await browser.close();
console.log(`\n[failures: ${failures}]`);
process.exit(failures > 0 ? 1 : 0);
