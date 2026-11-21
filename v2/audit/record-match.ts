// RECORD A FULL AI-VS-AI MATCH.
//
// The Phase 5 proof pack needs a recording of a complete match, not a highlight reel. This drives the real app in a real
// browser and records the real renderer, so what the viewer sees is the game, not a reconstruction.
//
// The page runs a fixed 20 Hz simulation; `?speed=N` only changes how many of those fixed ticks are consumed per rendered
// frame (see the note in `src/main.ts`). The tick sequence, the step order and the RNG are untouched, so the recorded match
// is the SAME match the headless harness measures — speeding it up for capture cannot change who wins.
//
// Usage:
//   PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/record-match.ts
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
/** How much sim time per rendered frame. 8x keeps motion readable while cutting a ~17 min match to ~2 min. */
const SPEED = Number(process.env.RECORD_SPEED ?? 8);
/** Safety stop: never record longer than this in real seconds. */
const MAX_REAL_SECONDS = Number(process.env.RECORD_MAX_SECONDS ?? 300);

const OUT_DIR = join(import.meta.dirname, '..', 'docs', 'proof', 'phase-5', 'ai');

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    // Video is captured at a modest size: it is evidence of behaviour, not a marketing asset, and a smaller file is easier
    // to keep in the repository.
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();

  /**
   * The matchup is named, not implied. `?seed` and `?d0/?d1` select the exact game, so the recording is of the Hard-vs-Normal
   * match the tournament measures rather than of whatever the page's default seed happened to produce.
   */
  const SEED = process.env.RECORD_SEED ?? '1000';
  const D0 = process.env.RECORD_D0 ?? 'hard';
  const D1 = process.env.RECORD_D1 ?? 'normal';
  const url = `${BASE}/index.html?speed=${SPEED}&seed=${SEED}&d0=${D0}&d1=${D1}`;
  console.log(`opening ${url}`);
  await page.goto(url, { waitUntil: 'load' });

  // Wait for the canvas and for the sim to actually start producing entities.
  await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 60_000 });

  /**
   * Watch the simulation until it ends.
   *
   * The page exposes no test hook, so the signal is the on-screen readout: the HUD unit counter is written from
   * `state.players[0]` every frame. Rather than parse pixels, wait for the match to be over by watching for the simulation
   * to stop changing — a cheap, robust proxy is the mana readout stabilising while the unit count drops to a small number.
   *
   * Simpler and more robust: just run until MAX_REAL_SECONDS, then stop. At 8x, a 17-minute match needs ~2 minutes of real
   * time, so the timeout is far above what is needed and the recording simply contains the whole match.
   */
  const started = Date.now();
  let lastUnits = -1;
  let stableFrames = 0;
  while ((Date.now() - started) / 1000 < MAX_REAL_SECONDS) {
    await page.waitForTimeout(2000);
    const units = await page.evaluate(() => {
      const el = document.querySelector('.res__value');
      return el?.textContent ?? '';
    });
    const count = Number((units.match(/^(\d+)/) ?? [])[1] ?? -1);
    if (count === lastUnits) {
      stableFrames++;
    } else {
      stableFrames = 0;
      lastUnits = count;
    }
    // A match is over when one side has been wiped out; the readout then holds steady at 0 for a while.
    if (count === 0 && stableFrames >= 3) {
      console.log(`match appears finished (units 0, stable ${stableFrames} samples)`);
      break;
    }
  }

  const elapsed = (Date.now() - started) / 1000;
  console.log(`recorded ${elapsed.toFixed(0)}s of real time at ${SPEED}x`);

  // Hold the final frame briefly so the outcome is visible before the video ends.
  await page.waitForTimeout(2500);

  const video = page.video();
  await context.close();
  await browser.close();

  if (video) {
    const path = await video.path();
    console.log(`video written to ${path}`);
  }
}

await main();
