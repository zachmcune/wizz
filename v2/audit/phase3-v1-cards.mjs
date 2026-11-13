// CAPTURE THE v1 REFERENCE FRAMES used by the v1 / old-v2 / new comparison.
//
// v1 has no sprite atlas: it draws each entity procedurally at runtime (`src/render/shape-sprite.ts`),
// so the only faithful reference is what the v1 gallery actually renders. This script visits v1's own
// entity-designs page (`/?gallery=1`, gated by `shouldOpenArtGallery`) and screenshots the 2.5D preview
// FRAME ELEMENT for each entity.
//
// Why element screenshots and not page crops: the previous phase's crop tool scrolled the page and then
// captured `clip: {x:0, y:0, ...}`, which Playwright resolves in document coordinates. The clip never
// followed the scroll, so five proofs came out byte-identical. Screenshotting an element cannot land on
// the wrong region, because the element is resolved by selector.
//
// Run (needs the v1 dev server running on :5444 from the repo root):
//   npx vite --host 127.0.0.1 --port 5444 --strictPort
//   node v2/audit/phase3-v1-cards.mjs
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs/proof/phase-3-pilot/v1-source');
const BASE = process.env.V1_BASE ?? 'http://127.0.0.1:5444/?gallery=1';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
// deviceScaleFactor 2 so the v1 sprite is captured at a crisp size for the comparison sheet.
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

const cards = await page.$$('.art-gallery-card');
let captured = 0;
for (const card of cards) {
  const id = await card.evaluate((el) => el.querySelector('.art-gallery-id')?.textContent ?? '');
  if (!id) continue;
  const frame = await card.$('.art-gallery-frame-world');
  if (!frame) continue;
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  await frame.screenshot({ path: join(OUT, `${id}.png`) });
  captured++;
}

await browser.close();
console.log(`captured ${captured} v1 2.5D preview frames into ${OUT}`);
if (captured === 0) process.exitCode = 1;
