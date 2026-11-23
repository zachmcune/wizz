// THE BROWSER CAMERA AND HUD GATES — the same framing properties as `tests/touch/camera.test.ts`, but
// measured on a REAL page with the REAL HUD's measured insets.
//
// The arithmetic suite proves the camera does what it is told. It cannot prove that the app tells it the
// right thing: that `frameOnMyBase` actually runs after the HUD is mounted, that the insets it uses are
// the HUD's real rendered boxes rather than a guess, or that the finished frame contains the player's
// Sanctum where a player expects to see it. Those are the failures Zachary reported, and they only exist
// at the seam between the camera and the app.
//
// So each case here boots `app.html?screen=match`, waits for the live match, and reads the SAME values a
// player would see:
//
//   • where the Sanctum lands, as a fraction of the playable rect (the safe rect, not the window);
//   • what share of the playable rect is map rather than backdrop;
//   • whether the HUD is docked on the edge its layout claims.
//
// It then asserts the reported symptom cannot come back: the base is not in a corner, not under the
// console, and not low with an empty band above it.

import { describe, expect, it } from 'vitest';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';

async function getChromium(): Promise<typeof import('@playwright/test').chromium | null> {
  try {
    const pw = await import('@playwright/test');
    return pw.chromium;
  } catch {
    return null;
  }
}

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/app.html`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

let chromium: typeof import('@playwright/test').chromium | null = null;
let available = false;
const ready = (async (): Promise<void> => {
  chromium = await getChromium();
  if (!chromium) return;
  available = await serverUp();
})();
await ready;

/**
 * The three viewports the brief names, plus desktop and the 844-wide phone. `touch` is set on the phone
 * contexts because the gestures under test are touch gestures; without it Playwright's pointer events
 * report `pointerType: 'mouse'` and the app picks the desktop drag mode.
 */
const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, touch: true, layout: 'side' },
  { name: 'phone-844x390', width: 844, height: 390, touch: true, layout: 'side' },
  { name: 'phone-portrait-390x844', width: 390, height: 844, touch: true, layout: 'bottom' },
  { name: 'chromebook-1366x768', width: 1366, height: 768, touch: false, layout: 'side' },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, touch: false, layout: 'side' },
];

interface Frame {
  layout: string | null;
  sanctum: { x: number; y: number } | null;
  safe: { x: number; y: number; w: number; h: number };
  coverage: number;
  zoom: number;
  tiles: number;
  cmds: number;
  tabs: number;
  /** Share of the playable rect whose pixel is the obsidian backdrop rather than map. */
  backdropFraction: number;
}

describe('camera: the starting frame puts the player Sanctum in the battlefield', () => {
  for (const vp of VIEWPORTS) {
    it.skipIf(!available)(`${vp.name}: Sanctum is centred in the playable rect, on map`, async () => {
      const browser = await chromium!.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      try {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
          hasTouch: vp.touch,
          isMobile: vp.touch,
        });
        const page = await ctx.newPage();
        const errs: string[] = [];
        page.on('pageerror', (e) => errs.push(e.message));
        page.on('console', (m) => {
          if (m.type() === 'error') errs.push(m.text().slice(0, 160));
        });
        await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelector('.hud-side') !== null, null, { timeout: 40_000 });
        await page.waitForTimeout(1400);

        const frame = await page.evaluate(() => {
          const app = (window as unknown as {
            __app: {
              controller: {
                camera: {
                  safeRect(): { x: number; y: number; w: number; h: number };
                  safeMapCoverage(): number;
                  worldToScreenPoint(x: number, y: number): { x: number; y: number };
                  zoom: number;
                };
                state: {
                  players: { id: string }[];
                  entities: { count: number; dead: Uint8Array; kind: Uint8Array; ownerIndex: Int16Array; posX: number[]; posY: number[]; id: number[] };
                };
                me: string;
              };
            };
          }).__app;
          const c = app.controller;
          const st = c.state;
          const myIndex = st.players.findIndex((p) => p.id === c.me);
          let sanctum: { x: number; y: number } | null = null;
          for (let s = 0; s < st.entities.count; s++) {
            if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
            if (st.entities.ownerIndex[s] !== myIndex) continue;
            sanctum = c.camera.worldToScreenPoint(st.entities.posX[s]!, st.entities.posY[s]!);
            break;
          }
          return {
            layout: document.querySelector('.hud')?.getAttribute('data-layout') ?? null,
            sanctum,
            safe: c.camera.safeRect(),
            coverage: c.camera.safeMapCoverage(),
            zoom: c.camera.zoom,
            tiles: document.querySelectorAll('.prod-tile').length,
            cmds: document.querySelectorAll('.hud-cmd').length,
            tabs: document.querySelectorAll('.hud-tab').length,
            backdropFraction: 0,
          } as Frame;
        });

        expect(errs, errs.join('; ')).toEqual([]);
        expect(frame.layout, `${vp.name} used layout ${frame.layout}`).toBe(vp.layout);
        expect(frame.sanctum, `${vp.name} has no Sanctum on screen`).not.toBeNull();

        const s = frame.sanctum!;
        const fx = (s.x - frame.safe.x) / frame.safe.w;
        const fy = (s.y - frame.safe.y) / frame.safe.h;

        /**
         * The reported bug was a base sitting LOW with a band of black above it. These bounds are the
         * machine-checkable form of "framed like a game, not like a camera bug": the base is inside the
         * middle 60% of the playable rect in both axes.
         */
        expect(Math.abs(fx - 0.5), `${vp.name}: Sanctum at ${(fx * 100).toFixed(0)}% across`).toBeLessThan(0.04);
        expect(Math.abs(fy - 0.5), `${vp.name}: Sanctum at ${(fy * 100).toFixed(0)}% down`).toBeLessThan(0.12);

        // The playable rect is map, not backdrop. Measured: 0.923 / 0.869 / 1.000 / 0.917 / 0.804.
        const floor = vp.width > 1500 ? 0.75 : 0.82;
        expect(frame.coverage, `${vp.name}: only ${(frame.coverage * 100).toFixed(0)}% of the playable rect is map`).toBeGreaterThan(floor);

        // And the console is actually populated, so this is a real match and not a boot screen.
        expect(frame.tabs, `${vp.name}: ${frame.tabs} tabs`).toBe(4);
        expect(frame.cmds, `${vp.name}: ${frame.cmds} command buttons`).toBe(8);
        expect(frame.tiles, `${vp.name}: ${frame.tiles} production tiles on the Buildings tab`).toBeGreaterThan(0);

        await ctx.close();
      } finally {
        await browser.close();
      }
    }, 120_000);
  }
});

describe('camera: the rendered frame around the base is terrain, not backdrop', () => {
  /**
   * A PIXEL CHECK, because the arithmetic above cannot see what the renderer actually drew.
   *
   * The report was visual: "a huge empty black void above the map". Measuring the whole top third of the
   * screen is the wrong instrument — the board is a DIAMOND, so on a wide window its own geometry leaves
   * corners outside it, and a fix that maximised whole-rect coverage produced a zoomed-out camera showing
   * empty ground (the failure this test caught on its first run). What the player is actually looking at
   * is the area AROUND THEIR BASE, so that is what is sampled: a box one third of the playable rect wide
   * and tall, centred on the Sanctum.
   *
   * The backdrop is `#101318` with a `#1b2027` grid; terrain greens are nowhere near either, so a tight
   * colour band separates them without ambiguity.
   */
  it.skipIf(!available)('the ground around the Sanctum is terrain, not the obsidian backdrop', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const sharp = (await import('sharp')).default;
    const failures: string[] = [];
    try {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
          hasTouch: vp.touch,
          isMobile: vp.touch,
        });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelector('.hud-side') !== null, null, { timeout: 40_000 });
        // Let the renderer settle: the first frames draw before the atlas textures are bound.
        await page.waitForTimeout(1700);

        const probe = await page.evaluate(() => {
          const c = (window as unknown as {
            __app: {
              controller: {
                me: string;
                state: { players: { id: string }[]; entities: { count: number; dead: Uint8Array; kind: Uint8Array; ownerIndex: Int16Array; posX: number[]; posY: number[] } };
                camera: { safeRect(): { x: number; y: number; w: number; h: number }; worldToScreenPoint(x: number, y: number): { x: number; y: number } };
              };
            };
          }).__app.controller;
          const st = c.state;
          const myIndex = st.players.findIndex((p) => p.id === c.me);
          let sanctum: { x: number; y: number } | null = null;
          for (let s = 0; s < st.entities.count; s++) {
            if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
            if (st.entities.ownerIndex[s] !== myIndex) continue;
            sanctum = c.camera.worldToScreenPoint(st.entities.posX[s]!, st.entities.posY[s]!);
            break;
          }
          return { sanctum, safe: c.camera.safeRect() };
        });

        if (!probe.sanctum) {
          failures.push(`${vp.name}: no Sanctum to sample around`);
          await ctx.close();
          continue;
        }
        const shot = await page.screenshot();
        const { data, info } = await sharp(shot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        // A square box a third of the playable rect across, centred on the base.
        const half = Math.min(probe.safe.w, probe.safe.h) / 6;
        const x0 = Math.max(0, Math.round(probe.sanctum.x - half));
        const x1 = Math.min(info.width, Math.round(probe.sanctum.x + half));
        const y0 = Math.max(0, Math.round(probe.sanctum.y - half));
        const y1 = Math.min(info.height, Math.round(probe.sanctum.y + half));
        let backdrop = 0;
        let total = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * info.width + x) * info.channels;
            const r = data[i]!;
            const g = data[i + 1]!;
            const b = data[i + 2]!;
            total++;
            // #101318 backdrop and its #1b2027 grid: a tight, blue-biased band. Terrain greens are far
            // brighter and green-dominant, so they cannot fall inside it.
            if (r >= 12 && r <= 34 && g >= 14 && g <= 40 && b >= 18 && b <= 48 && b > r + 2) backdrop++;
          }
        }
        const frac = total === 0 ? 0 : backdrop / total;
        /**
         * Under 15%: the base's own footprint, its shadow and the rock faces of the plateau are all dark,
         * and at 667x375 the half-box reaches the edge of the raised plateau. A void band around the base
         * measures well above this — the broken build measured 60% of the top third on desktop.
         */
        if (frac > 0.15) failures.push(`${vp.name}: ${(frac * 100).toFixed(1)}% of the area around the base is backdrop`);
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('; ')).toEqual([]);
  }, 300_000);
});
