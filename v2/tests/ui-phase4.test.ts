// PHASE 4 GATES — assertions on the live, rendered UI.
//
// Every test here runs the REAL app in a REAL browser against a REAL WebGL renderer, then measures real
// layout boxes. That is deliberate: every defect Zachary found in the Phase 3 style proofs was a layout
// bug that source inspection could not catch — a panel that covered half a phone screen, and a hint that
// sat on top of a button.
//
// The suite needs a dev server. `PROOF_BASE` overrides the URL; the default matches the one the audit
// scripts use. When no server is reachable the tests SKIP with a clear message rather than failing, so
// `npm test` stays runnable without a browser — but CI runs them, because the CI v2 job starts Vite.
import { describe, expect, it } from 'vitest';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lazy-import Playwright so the suite still collects when it is not installed. */
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

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, density: 'compact' },
  { name: 'phone-844x390', width: 844, height: 390, density: 'compact' },
  { name: 'chromebook-1366x768', width: 1366, height: 768, density: 'regular' },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, density: 'roomy' },
];

/** Screens the app must be able to show. `match` and `sandbox` boot a real simulation. */
const SCREENS = ['menu', 'lobby', 'settings', 'gallery', 'results'] as const;

/**
 * Availability is resolved ONCE at module load, not in `beforeAll`.
 *
 * `it.skipIf(cond)` is evaluated while the suite is being COLLECTED, which happens before any
 * `beforeAll` runs — so a condition set in `beforeAll` is always false at that moment and every test
 * silently skips. That is how this suite first appeared to "pass" without running anything.
 */
let chromium: typeof import('@playwright/test').chromium | null = null;
let available = false;

const ready = (async (): Promise<void> => {
  chromium = await getChromium();
  if (!chromium) return;
  available = await serverUp();
})();
await ready;

describe('phase 4: every screen renders at every viewport with zero errors', () => {
  it.skipIf(!available)('loads each screen cleanly', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const vp of VIEWPORTS) {
        for (const screen of SCREENS) {
          const page = await browser.newPage({
            viewport: { width: vp.width, height: vp.height },
            deviceScaleFactor: 1,
          });
          const errs: string[] = [];
          page.on('pageerror', (e) => errs.push(e.message));
          page.on('console', (m) => {
            if (m.type() === 'error') errs.push(m.text().slice(0, 160));
          });
          await page.goto(`${BASE}/app.html?screen=${screen}`, { waitUntil: 'networkidle' });
          await page.waitForFunction(() => (window as unknown as { __app?: unknown }).__app !== undefined, null, {
            timeout: 30000,
          });
          await page.waitForTimeout(700);
          const info = await page.evaluate(() => ({
            err: (window as unknown as { __appError?: string }).__appError ?? null,
            nodes: document.querySelectorAll('.screen *').length,
            density: document.documentElement.getAttribute('data-density'),
          }));
          if (info.err) failures.push(`${vp.name}/${screen}: ${info.err}`);
          if (errs.length) failures.push(`${vp.name}/${screen}: ${errs[0]}`);
          if (info.nodes < 10) failures.push(`${vp.name}/${screen}: only ${info.nodes} nodes rendered`);
          if (info.density !== vp.density) {
            failures.push(`${vp.name}/${screen}: density ${info.density}, expected ${vp.density}`);
          }
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 180_000);
});

describe('phase 4: HUD occupies at most 18% of a 667x375 screen', () => {
  it.skipIf(!available)('measures the real HUD area at the phone viewport', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelector('.hud-select') !== null, null, { timeout: 30000 });
      await page.waitForTimeout(600);

      const m = await page.evaluate(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const SEL = ['.hud-top', '.hud-select', '.hud-cmd', '.hud-minimap', '.hud-zoom', '.hud-hint'];
        const rects: Rect[] = [];
        for (const sel of SEL) {
          for (const e of document.querySelectorAll(sel)) {
            const r = e.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
          }
        }
        // Union area (not sum): overlapping chrome must not be double-counted.
        const cov = new Uint8Array(Math.ceil(vw) * Math.ceil(vh));
        for (const r of rects) {
          const x0 = Math.max(0, Math.floor(r.x));
          const y0 = Math.max(0, Math.floor(r.y));
          const x1 = Math.min(vw, Math.ceil(r.x + r.w));
          const y1 = Math.min(vh, Math.ceil(r.y + r.h));
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cov[y * Math.ceil(vw) + x] = 1;
        }
        let n = 0;
        for (let i = 0; i < cov.length; i++) n += cov[i]!;
        return { fraction: n / (vw * vh), elements: rects.length };
      });

      expect(m.elements, 'no HUD elements measured').toBeGreaterThan(2);
      expect(m.fraction, `HUD covers ${(m.fraction * 100).toFixed(1)}% of 667x375`).toBeLessThanOrEqual(0.18);
      await page.close();
    } finally {
      await browser.close();
    }
  }, 120_000);
});

describe('phase 4: no HUD elements overlap at any viewport', () => {
  it.skipIf(!available)('checks every pair of sibling HUD zones', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelector('.hud-select') !== null, null, { timeout: 30000 });
        await page.waitForTimeout(500);

        const res = await page.evaluate(() => {
          const SEL = ['.hud-top', '.hud-select', '.hud-cmd', '.hud-minimap', '.hud-zoom', '.hud-hint'];
          const entries: { sel: string; node: Element; r: Rect }[] = [];
          for (const sel of SEL) {
            for (const e of document.querySelectorAll(sel)) {
              const b = e.getBoundingClientRect();
              if (b.width <= 0 || b.height <= 0) continue;
              entries.push({ sel, node: e, r: { x: b.left, y: b.top, w: b.width, h: b.height } });
            }
          }
          const overlaps: string[] = [];
          for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
              const a = entries[i]!;
              const b = entries[j]!;
              // Containment is deliberate in this layout (the selection segment lives inside the top
              // bar to save a whole band of height), so only unrelated zones count as collisions.
              if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
              const ix = Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x);
              const iy = Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y);
              if (ix > 1 && iy > 1) overlaps.push(`${a.sel} / ${b.sel} = ${Math.round(ix)}x${Math.round(iy)}`);
            }
          }
          // Nothing may overflow the viewport either.
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const outside = entries
            .filter((e) => e.r.x < -0.5 || e.r.y < -0.5 || e.r.x + e.r.w > vw + 0.5 || e.r.y + e.r.h > vh + 0.5)
            .map((e) => e.sel);
          return { overlaps, outside: [...new Set(outside)] };
        }, );

        for (const o of res.overlaps) failures.push(`${vp.name}: overlap ${o}`);
        for (const o of res.outside) failures.push(`${vp.name}: ${o} overflows the viewport`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 180_000);
});

describe('phase 4: the v1 regressions do not come back', () => {
  // [E16] On phones, the v1 coach card sat on top of the Place button, so placement was impossible.
  // The v2 gate: at the Place button's own centre, the topmost element must BE the Place button (or a
  // descendant of it). This is the exact test from the plan, now applied to v2's own placement control.
  it.skipIf(!available)('the Place/build control is topmost at its own centre on phones', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelector('[data-cmd="build"]') !== null, null, { timeout: 30000 });
        await page.waitForTimeout(500);

        const res = await page.evaluate(() => {
          // `[data-cmd="build"]` is the command-bar Build control: the entry point to placement.
          const btn = document.querySelector('[data-cmd="build"]') as HTMLElement | null;
          if (!btn) return { ok: false, why: 'no build control' };
          const r = btn.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return { ok: false, why: `build control is ${r.width}x${r.height}` };
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const top = document.elementFromPoint(cx, cy);
          if (!top) return { ok: false, why: 'nothing at the centre point' };
          const ok = btn.contains(top) || top === btn;
          return {
            ok,
            why: ok ? '' : `topmost at centre is <${top.tagName.toLowerCase()} class="${top.className}">`,
          };
        });

        if (!res.ok) failures.push(`${vp.name}: Place control is not topmost — ${res.why}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 180_000);

  // [E17] The v1 `.cmd-card` collapsed to 0px tall on desktop and Chromebook, hiding the whole command
  // bar. v2's equivalent is `.hud-cmd`: it must have real height at every viewport.
  it.skipIf(!available)('.hud-cmd has non-zero height at every viewport', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const measured: Record<string, number> = {};
    try {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelector('.hud-cmd') !== null, null, { timeout: 30000 });
        await page.waitForTimeout(400);
        measured[vp.name] = await page.evaluate(() => {
          const e = document.querySelector('.hud-cmd') as HTMLElement | null;
          if (!e) return 0;
          return e.getBoundingClientRect().height;
        });
        await page.close();
      }
    } finally {
      await browser.close();
    }
    for (const [vp, h] of Object.entries(measured)) {
      expect(h, `.hud-cmd is ${h}px tall at ${vp}`).toBeGreaterThan(8);
    }
  }, 180_000);
});

describe('phase 4: units stay separated in a massed phone battle', () => {
  /**
   * THE STRESS CASE IS A SHARED DESTINATION, NOT TWO LINES MEETING.
   *
   * Two formations meeting in the middle never actually overlap — measured 0% at every separation
   * multiplier — so that scenario proves nothing about separation. The case that reproduces the reported
   * "unreadable pile" is many units ordered to the SAME point: measured 79% of units interpenetrating
   * at 1.6x radius with a 1.0x separation multiplier.
   *
   * The gate below runs that scenario and requires deep interpenetration to stay low. A looser test at
   * 1.6x passed even with separation disabled, so the threshold and scenario both matter.
   */
  it.skipIf(!available)('units sharing a destination fan out instead of stacking', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => (window as unknown as { __app?: unknown }).__app !== undefined, null, {
        timeout: 30000,
      });
      await page.waitForTimeout(1200);

      await page.evaluate(() => {
        const w = window as unknown as { __app: { session: { issue: (c: unknown) => void } } };
        const c = w.__app.session;
        const st = (w.__app.session as unknown as { state: { entities: { posX: number[]; posY: number[] } } }).state;
        const cx = st.entities.posX[0] ?? 2048;
        const cy = st.entities.posY[0] ?? 1320;
        for (let i = 0; i < 24; i++) {
          c.issue({ type: 'devSpawnUnit', defId: 'stone_golem', x: cx - 60 + (i % 6) * 24, y: cy + 40 + Math.floor(i / 6) * 24, count: 1 });
        }
        // Order every unit to one point — the situation that produced the pile.
        const ids: number[] = [];
        const stFull = (w.__app.session as unknown as {
          state: { entities: { count: number; dead: Uint8Array; kind: Uint8Array; id: number[] } };
        }).state;
        for (let s = 0; s < stFull.entities.count; s++) {
          if (!stFull.entities.dead[s] && stFull.entities.kind[s] === 0) ids.push(stFull.entities.id[s]!);
        }
        c.issue({ type: 'move', entityIds: ids, x: cx, y: cy + 120 });
      });
      // 12s: measured stable at 25-29% deep overlap from 8s onward, so this waits past the settle point
      // rather than catching the crowd mid-resolution.
      await page.waitForTimeout(12000);

      const res = await page.evaluate(() => {
        const w = window as unknown as { __app: { session: { state: unknown } } };
        const st = w.__app.session.state as unknown as {
          entities: { count: number; dead: Uint8Array; kind: Uint8Array; posX: number[]; posY: number[]; radius: number[] };
        };
        const pts: { x: number; y: number; r: number }[] = [];
        for (let s = 0; s < st.entities.count; s++) {
          if (st.entities.dead[s] || st.entities.kind[s] !== 0) continue;
          pts.push({ x: st.entities.posX[s]!, y: st.entities.posY[s]!, r: st.entities.radius[s] ?? 8 });
        }
        // Two measures: deep overlap (sprites fully on top of each other) and any overlap.
        let deep = 0;
        let any = 0;
        for (let i = 0; i < pts.length; i++) {
          let hasDeep = false;
          let hasAny = false;
          for (let j = 0; j < pts.length; j++) {
            if (i === j) continue;
            const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
            const rr = pts[i]!.r + pts[j]!.r;
            if (d < rr * 0.75) hasDeep = true;
            if (d < rr * 1.6) hasAny = true;
          }
          if (hasDeep) deep++;
          if (hasAny) any++;
        }
        return { units: pts.length, deep, any };
      });

      expect(res.units, 'the crowd did not spawn').toBeGreaterThan(15);
      const deepPct = res.deep / Math.max(1, res.units);
      /**
       * Threshold is evidence-based, not guessed.
       *
       * Measured on this exact scenario after 12s of settling:
       *   with visual separation (2.6x):  29% deeply interpenetrating
       *   with separation disabled (1.0x): 54%
       *
       * 40% sits between them, so the gate passes the real build and fails the broken one. 24 Stone
       * Golems (radius 13) physically cannot fit in one spot, so some overlap is unavoidable and a
       * lower threshold would be a lie about what the layout can achieve.
       */
      expect(deepPct, `${(deepPct * 100).toFixed(0)}% of ${res.units} units are deeply interpenetrating`).toBeLessThan(0.4);
      await page.close();
    } finally {
      await browser.close();
    }
  }, 120_000);
});
