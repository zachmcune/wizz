// MID-GAME SCREENSHOTS AT PHONE AND CHROMEBOOK SIZES.
//
// Proof for Phase 5 requires in-match captures at ~10 and ~18 minutes, at phone and Chromebook viewport sizes. The page runs a
// fixed 20 Hz simulation and `?speed=N` only changes how many fixed ticks each rendered frame consumes, so the captures land on
// real match time rather than on wall-clock guesswork.
//
// The capture waits for the on-screen simulation clock to reach each target rather than sleeping a computed duration, because
// frame rate varies with the machine and a sleep would land at an unpredictable match time.
//
// Usage:
//   PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-midgame.ts
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
const OUT = join(import.meta.dirname, '..', 'docs', 'proof', 'phase-5', 'ai');
/** Simulation minutes at which to capture. */
const TARGETS = [10, 18];
/**
 * Difficulty pair and seed for the capture, so the shots are of a NAMED matchup rather than whatever the default seed gives.
 * Hard vs Normal is the matchup the recording covers too.
 */
const SEED = process.env.CAPTURE_SEED ?? '1000';
const D0 = process.env.CAPTURE_D0 ?? 'hard';
const D1 = process.env.CAPTURE_D1 ?? 'normal';
/**
 * The HUD reports the FIRST player's units, so if player 0 is the side that gets wiped the shot shows an empty base even though a
 * full army is on the field. Setting `CAPTURE_PERSPECTIVE=1` selects... there is no perspective switch on this page, so instead
 * the caller passes the composition that keeps the SIDE WE WANT TO SHOW in slot 0. Documented here because the readout otherwise
 * looks like a bug rather than a choice.
 */
/** How much sim time to consume per rendered frame. */
const SPEED = Number(process.env.CAPTURE_SPEED ?? 14);

interface Viewport {
  name: string;
  width: number;
  height: number;
  touch: boolean;
}

const VIEWPORTS: Viewport[] = [
  { name: 'phone', width: 844, height: 390, touch: true },
  { name: 'chromebook', width: 1366, height: 768, touch: false },
];

/** Read the simulation clock the page prints in its debug line, in minutes. */
async function simMinutes(page: Page): Promise<number> {
  const text = await page.evaluate(() => [...document.querySelectorAll('.hud-stats')].map((e) => e.textContent).join(' '));
  const m = text.match(/t=([\d.]+)m/);
  return m ? Number(m[1]) : 0;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      deviceScaleFactor: 2,
      isMobile: vp.touch,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/index.html?speed=${SPEED}&seed=${SEED}&d0=${D0}&d1=${D1}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 60_000 });

    for (const target of TARGETS) {
      /**
       * Wait for the SIM clock, not for a duration.
       *
       * If the match ENDS before the target is reached the capture would otherwise hang; it also would not be an honest "10
       * minute" shot. Reaching the target is required, and the loop gives up with a clear message rather than silently saving a
       * screenshot of the wrong moment.
       */
      const deadline = Date.now() + 240_000;
      let reached = false;
      while (Date.now() < deadline) {
        if ((await simMinutes(page)) >= target) {
          reached = true;
          break;
        }
        await page.waitForTimeout(1500);
      }
      if (!reached) {
        /**
         * THE MATCH ENDED FIRST. Capture it anyway, but NAME THE FILE WITH THE ACTUAL TIME.
         *
         * A screenshot labelled "18min" that was really taken at 15.9 minutes is a false claim about the evidence, so the
         * filename records what the simulation clock actually said. Reported as unavailable rather than faked.
         */
        const at = await simMinutes(page);
        const file = join(OUT, `match-${vp.name}-${at.toFixed(0)}min-final.png`);
        await page.screenshot({ path: file });
        console.warn(`${vp.name}: match ended at ${at.toFixed(1)}m, so ${target}m was unreachable; saved ${file}`);
        break;
      }
      const file = join(OUT, `match-${vp.name}-${target}min.png`);
      await page.screenshot({ path: file });
      const readout = await page.evaluate(() => [...document.querySelectorAll('.res__value')].map((e) => e.textContent));
      console.log(`${vp.name} ${vp.width}x${vp.height} t=${target}m -> ${file}  readouts=${JSON.stringify(readout)}`);
    }

    await context.close();
  }

  await browser.close();
}

await main();
