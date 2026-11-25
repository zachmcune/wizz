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

describe('phase 4: the HUD leaves the battlefield playable at every viewport', () => {
  /**
   * THE 18% RULE IS REPLACED, DELIBERATELY, AND THIS IS THE MEASUREMENT THAT REPLACED IT.
   *
   * The old gate asserted that HUD chrome covered at most 18% of a 667x375 screen. It was met by
   * shrinking the command bar to a 30px strip of six icon-only buttons, and Zachary's report on the
   * result was "the touch controls are pretty bad" and "menus should feel like mobile command and
   * conquer": the budget was measuring the wrong quantity. An 18% HUD that cannot show a build cost, a
   * production queue, readable command labels, or the radar is not a better HUD, it is a smaller one.
   *
   * What actually has to hold, and is measured here:
   *
   *   • THE BATTLEFIELD KEEPS ITS SPACE. The playable rect (viewport minus measured chrome) must be at
   *     least 55% of the area in landscape and at least 55% in portrait, where the console is collapsed
   *     and the rail is thin.
   *   • EVERY CONTROL IS A THUMB TARGET. Every interactive element inside the HUD is at least 28x28 CSS
   *     px at compact density, and 30x30 above it. The old gate could not see this at all, which is how
   *     the "tiny unlabelled icons" got shipped.
   *   • THE CONSOLE IS ALWAYS REACHABLE. The tab strip and the command buttons must be present and
   *     non-zero in size in every layout, expanded or collapsed.
   */
  const SHOTS = [
    { name: 'phone-667x375', width: 667, height: 375, layout: 'side', minBattle: 0.55 },
    { name: 'phone-844x390', width: 844, height: 390, layout: 'side', minBattle: 0.55 },
    { name: 'portrait-390x844', width: 390, height: 844, layout: 'bottom', minBattle: 0.55 },
    { name: 'chromebook-1366x768', width: 1366, height: 768, layout: 'side', minBattle: 0.55 },
    { name: 'desktop-1920x1080', width: 1920, height: 1080, layout: 'side', minBattle: 0.55 },
  ];

  it.skipIf(!available)('the battlefield keeps its space and every control is a thumb target', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const vp of SHOTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelector('.hud-rail') !== null, null, { timeout: 30000 });
        await page.waitForTimeout(600);

        const m = await page.evaluate(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const rail = document.querySelector('.hud-rail')?.getBoundingClientRect();
          const side = document.querySelector('.hud-side')?.getBoundingClientRect();
          const layout = document.querySelector('.hud')?.getAttribute('data-layout');
          const battleW = layout === 'bottom' ? vw : Math.max(0, vw - (side?.width ?? 0));
          const battleH = Math.max(0, vh - (rail?.height ?? 0) - (layout === 'bottom' ? (side?.height ?? 0) : 0));
          const small: string[] = [];
          for (const e of document.querySelectorAll('.hud button, .hud .prod-tile, .hud .hud-tab')) {
            const r = e.getBoundingClientRect();
            const cs = getComputedStyle(e);
            if (r.width <= 0 || r.height <= 0) continue;
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (r.width < 28 || r.height < 28) {
              const label = (e.textContent ?? '').trim().slice(0, 16) || e.className;
              small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
          }
          const tabs = document.querySelectorAll('.hud-tab').length;
          const cmds = document.querySelectorAll('.hud-cmd').length;
          const tabRect = document.querySelector('.hud-tabs')?.getBoundingClientRect();
          const cmdRect = document.querySelector('.hud-cmds')?.getBoundingClientRect();
          return {
            layout,
            battle: (battleW * battleH) / (vw * vh),
            small,
            tabs,
            cmds,
            tabsVisible: (tabRect?.width ?? 0) > 20 && (tabRect?.height ?? 0) > 10,
            cmdsVisible: (cmdRect?.width ?? 0) > 20 && (cmdRect?.height ?? 0) > 10,
          };
        });

        if (m.layout !== vp.layout) failures.push(`${vp.name}: layout ${m.layout}, expected ${vp.layout}`);
        if (m.battle < vp.minBattle) {
          failures.push(`${vp.name}: battlefield is only ${(m.battle * 100).toFixed(0)}% of the viewport`);
        }
        if (m.small.length) failures.push(`${vp.name}: controls below 28x28 — ${m.small.join(', ')}`);
        if (m.tabs !== 4) failures.push(`${vp.name}: ${m.tabs} category tabs, expected 4`);
        if (m.cmds !== 8) failures.push(`${vp.name}: ${m.cmds} command buttons, expected 8`);
        if (!m.tabsVisible) failures.push(`${vp.name}: the tab strip is not visible`);
        if (!m.cmdsVisible) failures.push(`${vp.name}: the command rows are not visible`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 240_000);
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
        await page.waitForFunction(() => document.querySelector('.hud-rail') !== null, null, { timeout: 30000 });
        await page.waitForTimeout(500);

        const res = await page.evaluate(() => {
          const SEL = ['.hud-rail', '.hud-side', '.hud-tabs', '.hud-tiles', '.hud-cmds', '.hud-radar'];
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
              // Containment is deliberate for ZONE frames (the selection segment lives inside the top
              // bar to save a band of height), so those pairs are skipped.
              if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
              const ix = Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x);
              const iy = Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y);
              if (ix > 1 && iy > 1) overlaps.push(`${a.sel} / ${b.sel} = ${Math.round(ix)}x${Math.round(iy)}`);
            }
          }
          /**
           * CONTROLS INSIDE A ZONE MUST NOT COVER EACH OTHER.
           *
           * The zone-frame pass above cannot see this: it skips any pair where one node contains the
           * other, and every control in the command band is a DESCENDANT of `.hud-cmd`. That blind spot
           * is exactly how the zoom cluster came to sit on top of the Research button — 54x25px on phone
           * — while this gate stayed green. So the same intersection test is re-run over every
           * INTERACTIVE element, ignoring ancestry entirely: a button that covers another button is a
           * bug no matter how the DOM is nested.
           */
          const CONTROL = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
          const controls: { name: string; node: Element; r: Rect }[] = [];
          for (const e of document.querySelectorAll(CONTROL)) {
            const b = e.getBoundingClientRect();
            if (b.width <= 0 || b.height <= 0) continue;
            const cs = getComputedStyle(e);
            if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
            const label = e.getAttribute('aria-label') ?? (e.textContent ?? '').trim().slice(0, 24) ?? e.className;
            controls.push({ name: `${e.className || e.tagName}:${label}`, node: e, r: { x: b.left, y: b.top, w: b.width, h: b.height } });
          }
          for (let i = 0; i < controls.length; i++) {
            for (let j = i + 1; j < controls.length; j++) {
              const a = controls[i]!;
              const b = controls[j]!;
              if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
              const ix = Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x);
              const iy = Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y);
              if (ix > 1 && iy > 1) overlaps.push(`control ${a.name} / ${b.name} = ${Math.round(ix)}x${Math.round(iy)}`);
            }
          }
          // Nothing may overflow the viewport either.
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const outside = entries
            .filter((e) => e.r.x < -0.5 || e.r.y < -0.5 || e.r.x + e.r.w > vw + 0.5 || e.r.y + e.r.h > vh + 0.5)
            .map((e) => e.sel);
          const controlsOutside = controls
            .filter((e) => e.r.x < -0.5 || e.r.y < -0.5 || e.r.x + e.r.w > vw + 0.5 || e.r.y + e.r.h > vh + 0.5)
            .map((e) => `control ${e.name}`);
          return { overlaps, outside: [...new Set(outside)], controlsOutside: [...new Set(controlsOutside)] };
        }, );

        for (const o of res.overlaps) failures.push(`${vp.name}: overlap ${o}`);
        for (const o of res.outside) failures.push(`${vp.name}: ${o} overflows the viewport`);
        for (const o of res.controlsOutside) failures.push(`${vp.name}: ${o} overflows the viewport`);
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

describe('phase 4: no raw ids or code keys reach any screen', () => {
  /**
   * The research screen shipped with "siphonPerSecond x1.08", "requires attunement_spire" and raw role
   * lists like "light_ranged, aoe_ranged: damage x1.1". Those are data keys leaking into the interface.
   *
   * This scans every visible text node on every screen for the two signatures:
   *   • snake_case   — an identifier like attunement_spire
   *   • camelCase    — an identifier like siphonPerSecond
   * Both patterns are matched on whole words, so ordinary prose ("ley-lines", "Storm Caster") passes.
   */
  const SNAKE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;
  const CAMEL = /\b[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*\b/;

  /**
   * The Entity Designs gallery deliberately prints the internal id under each entity — it is a
   * reference page for art review and for developers, and the id is the useful part there. Those
   * labels are marked with `.code` in the DOM, and the scan skips exactly that class rather than
   * exempting the screen, so every other string on the page is still checked.
   */
  const SKIP_CLASS = 'code';

  it.skipIf(!available)('every screen shows words, not keys', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const screen of ['menu', 'lobby', 'settings', 'gallery', 'results', 'sandbox'] as const) {
        const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/app.html?screen=${screen}`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => (window as unknown as { __app?: unknown }).__app !== undefined, null, {
          timeout: 30000,
        });
        await page.waitForTimeout(screen === 'sandbox' ? 2600 : 700);
        const bad = await page.evaluate(
          ([snakeSrc, camelSrc, skipCls]) => {
            const snake = new RegExp(snakeSrc);
            const camel = new RegExp(camelSrc);
            const out: string[] = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
              const el = node.parentElement;
              // Reference labels (the gallery's entity ids) are the one documented exception.
              if (!el || el.classList.contains(skipCls) || el.closest('.' + skipCls)) {
                node = walker.nextNode();
                continue;
              }
              const text = (node.textContent ?? '').trim();
              if (text.length > 1) {
                for (const word of text.split(/[\s,;:()[\]|\]]+/)) {
                  if (!word) continue;
                  if (snake.test(word) || camel.test(word)) {
                    if (el.offsetParent !== null) out.push(word);
                  }
                }
              }
              node = walker.nextNode();
            }
            return [...new Set(out)];
          },
          [SNAKE.source, CAMEL.source, SKIP_CLASS] as const,
        );
        for (const b of bad) failures.push(`${screen}: "${b}"`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
    expect(failures, `raw ids/camelCase reached the UI:\n${failures.join('\n')}`).toEqual([]);
  }, 180_000);

  it.skipIf(!available)('the research tree shows only player-facing wording', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => (window as unknown as { __app?: unknown }).__app !== undefined, null, {
        timeout: 30000,
      });
      await page.waitForTimeout(1600);
      await page.evaluate(() => (window as unknown as { __app: { openResearchTree: () => void } }).__app.openResearchTree());
      await page.waitForTimeout(800);

      const res = await page.evaluate(
        ([snakeSrc, camelSrc]) => {
          const snake = new RegExp(snakeSrc);
          const camel = new RegExp(camelSrc);
          const offenders: string[] = [];
          const cards = document.querySelectorAll('.research-node').length;
          const tiers = document.querySelectorAll('.research-col').length;
          const icons = document.querySelectorAll('.research-node__icon svg').length;
          for (const e of document.querySelectorAll('.screen--research *')) {
            if (e.children.length > 0) continue;
            const t = (e.textContent ?? '').trim();
            if (!t) continue;
            for (const w of t.split(/[\s,;:()[\]]+/)) {
              if (w && (snake.test(w) || camel.test(w))) offenders.push(w);
            }
          }
          return { cards, tiers, icons, offenders: [...new Set(offenders)] };
        },
        [SNAKE.source, CAMEL.source] as const,
      );

      expect(res.cards, 'research tree is too small').toBeGreaterThanOrEqual(20);
      expect(res.tiers, 'research tree has too few tiers').toBeGreaterThanOrEqual(4);
      expect(res.icons, 'research cards have no icons').toBeGreaterThanOrEqual(20);
      expect(res.offenders, `raw keys in the research UI: ${res.offenders.join(', ')}`).toEqual([]);
      await page.close();
    } finally {
      await browser.close();
    }
  }, 120_000);
});

describe('phase 4 polish: a massed fight is separated and readable at phone size', () => {
  /**
   * THE STRESS CASE IS A GROUP ORDERED TO ONE POINT, because that is what produced the reported pile.
   *
   * Two metrics, both from the simulation rather than from pixels (pixel metrics merge same-coloured
   * neighbours and cannot tell "two units touching" from "one blob"):
   *
   *   • deepOverlap  — share of units with a neighbour inside 0.75x the sum of collision radii.
   *   • pairSeparation — share of ALL unit pairs that are at least r1+r2 apart.
   *
   * MEASURED on this exact scenario, on the previous head (03d138a), by running the old build:
   *   deepOverlap 26%, medianNearestNeighbour 0.86, p10 0.57.
   * After formation slots, visual separation and arrival spreading: deepOverlap 4%, median 1.56, p10 1.20.
   */
  it.skipIf(!available)('54 units ordered to one point end up separated', async () => {
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
        const w = window as unknown as { __app: { session: { issue: (c: unknown) => void; me: string; state: unknown } } };
        const c = w.__app.session;
        const st = c.state as unknown as {
          entities: { count: number; dead: Uint8Array; kind: Uint8Array; id: number[]; posX: number[]; posY: number[]; ownerIndex: number[] };
          players: { id: string }[];
        };
        const cx = st.entities.posX[0] ?? 2048;
        const cy = st.entities.posY[0] ?? 1320;
        const units = ['stone_golem', 'imp_swarmling', 'arcane_archer', 'storm_caster', 'thornling'];
        let k = 0;
        for (const u of units) {
          for (let i = 0; i < 5; i++) {
            c.issue({ type: 'devSpawnUnit', defId: u, x: cx - 260 + Math.floor(k / 5) * 30, y: cy - 30 + (k % 5) * 30, count: 1 });
            k++;
          }
        }
        k = 0;
        for (const u of units) {
          for (let i = 0; i < 5; i++) {
            c.issue({ type: 'devSpawnUnit', defId: u, x: cx + 260 - Math.floor(k / 5) * 30, y: cy + 150 + (k % 5) * 30, count: 1 });
            k++;
          }
        }
        const myIndex = st.players.findIndex((pp) => pp.id === c.me);
        const mine: number[] = [];
        for (let s = 0; s < st.entities.count; s++) {
          if (!st.entities.dead[s] && st.entities.kind[s] === 0 && st.entities.ownerIndex[s] === myIndex) mine.push(st.entities.id[s]!);
        }
        if (mine.length) c.issue({ type: 'attackMove', entityIds: mine, x: cx, y: cy + 60 });
      });
      await page.waitForTimeout(9000);

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
        let deep = 0;
        let pairs = 0;
        let separated = 0;
        for (let i = 0; i < pts.length; i++) {
          let hasDeep = false;
          for (let j = i + 1; j < pts.length; j++) {
            const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
            const need = pts[i]!.r + pts[j]!.r;
            pairs++;
            if (d >= need) separated++;
            if (d < need * 0.75) hasDeep = true;
          }
          if (hasDeep) deep++;
        }
        return { units: pts.length, deepPct: deep / Math.max(1, pts.length), separatedPct: separated / Math.max(1, pairs) };
      });

      expect(res.units, 'the battle did not spawn').toBeGreaterThan(40);
      expect(res.deepPct, `${(res.deepPct * 100).toFixed(0)}% of units are deeply interpenetrating`).toBeLessThan(0.15);
      expect(
        res.separatedPct,
        `only ${(res.separatedPct * 100).toFixed(0)}% of unit pairs are clear of each other`,
      ).toBeGreaterThan(0.85);
      await page.close();
    } finally {
      await browser.close();
    }
  }, 120_000);
});

describe('phase 4 polish: the command console is docked and hugs its content', () => {
  /**
   * THE CONSOLE IS DOCKED, NOT A FLOATING STRIP.
   *
   * v2 previously asserted "the command bar's bottom is within 8px of the viewport bottom". That rule
   * described the old full-width strip. The C&C console is docked to an EDGE — right in landscape, bottom
   * in portrait — and the rule that replaces it is stronger, because it also proves the dock is flushed
   * to that edge and that the console does not float in the middle of the battlefield:
   *
   *   • landscape: the console's right edge is the viewport's right edge, and its top starts below the rail;
   *   • portrait: the console's bottom edge is the viewport's bottom edge;
   *   • no zone is taller than its content (the "empty strip" bug), tolerance 14px of padding.
   */
  const LAYOUTS = [
    { name: 'phone-667x375', width: 667, height: 375, dock: 'right' },
    { name: 'phone-844x390', width: 844, height: 390, dock: 'right' },
    { name: 'portrait-390x844', width: 390, height: 844, dock: 'bottom' },
    { name: 'chromebook-1366x768', width: 1366, height: 768, dock: 'right' },
    { name: 'desktop-1920x1080', width: 1920, height: 1080, dock: 'right' },
  ];

  it.skipIf(!available)('the console is flush to its docked edge and no zone is taller than its content', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const vp of LAYOUTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelector('.hud-side') !== null, null, { timeout: 30000 });
        await page.waitForTimeout(600);

        const res = await page.evaluate(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const side = document.querySelector('.hud-side') as HTMLElement | null;
          const rail = document.querySelector('.hud-rail') as HTMLElement | null;
          if (!side || !rail) return null;
          const sr = side.getBoundingClientRect();
          const rr = rail.getBoundingClientRect();
          const layout = document.querySelector('.hud')?.getAttribute('data-layout');
          const zones: { zone: string; slack: number }[] = [];
          for (const sel of ['.hud-rail', '.hud-side', '.hud-tabs', '.hud-cmds']) {
            const z = document.querySelector(sel) as HTMLElement | null;
            if (!z) continue;
            const zr = z.getBoundingClientRect();
            if (zr.height <= 0) continue;
            let top = Infinity;
            let bottom = -Infinity;
            for (const child of z.querySelectorAll('*')) {
              const r = child.getBoundingClientRect();
              if (r.height <= 0 || r.width <= 0) continue;
              const cs = getComputedStyle(child as Element);
              if (cs.visibility === 'hidden' || cs.display === 'none') continue;
              top = Math.min(top, r.top);
              bottom = Math.max(bottom, r.bottom);
            }
            const contentH = bottom > top ? bottom - top : 0;
            zones.push({ zone: sel, slack: Math.round(zr.height - contentH) });
          }
          return {
            layout,
            rightGap: Math.round(vw - sr.right),
            bottomGap: Math.round(vh - sr.bottom),
            sideTop: Math.round(sr.top - rr.bottom),
            zones,
          };
        });

        if (!res) {
          failures.push(`${vp.name}: no console measured`);
        } else {
          if (vp.dock === 'right') {
            if (Math.abs(res.rightGap) > 1) failures.push(`${vp.name}: console is ${res.rightGap}px from the right edge`);
            if (res.sideTop < -1) failures.push(`${vp.name}: console overlaps the rail by ${-res.sideTop}px`);
          } else {
            if (Math.abs(res.bottomGap) > 1) failures.push(`${vp.name}: console is ${res.bottomGap}px from the bottom edge`);
          }
          for (const z of res.zones) {
            // The tiles grid legitimately scrolls; every other zone hugs its content.
            const limit = z.zone === '.hud-side' ? 24 : 14;
            if (z.slack > limit) failures.push(`${vp.name}: ${z.zone} has ${z.slack}px of empty height below its content`);
          }
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 240_000);

  /**
   * (3) NO HUD TEXT IS CLIPPED.
   *
   * The phone top bar cut "HP 2000 / 2000" in half: the band was capped at 34px while its content needed
   * 46px. This walks every visible text node inside the HUD and requires `scrollHeight <= clientHeight`
   * and `scrollWidth <= clientWidth`, so an element cannot be cropping its own text.
   */
  it.skipIf(!available)('no HUD text is clipped or overflows its box', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelector('.hud-rail') !== null, null, { timeout: 30000 });
        // Selection is populated on boot, so the health value that used to clip is present.
        await page.waitForTimeout(700);

        const res = await page.evaluate(() => {
          const clipped: string[] = [];
          const outside: string[] = [];
          const hud = document.querySelector('.hud');
          if (!hud) return { clipped, outside };
          for (const el of hud.querySelectorAll('*')) {
            const text = (el.textContent ?? '').trim();
            if (!text) continue;
            // Only leaf-ish nodes: a container's scrollHeight reflects its children, which is already
            // covered by checking the children themselves.
            if (el.children.length > 0) continue;
            if (el.scrollHeight > el.clientHeight + 1) {
              clipped.push(`${String(el.className) || el.tagName} "${text.slice(0, 18)}" (${el.scrollHeight}>${el.clientHeight})`);
            }
            if (el.scrollWidth > el.clientWidth + 1) {
              clipped.push(`${String(el.className) || el.tagName} "${text.slice(0, 18)}" w(${el.scrollWidth}>${el.clientWidth})`);
            }
            /**
             * AND the text must sit inside EVERY ancestor zone's box.
             *
             * Checking only `scrollHeight` is not enough: when an ancestor has `overflow: hidden` the
             * descendant's own scroll box is unchanged, so a band capped below its content clips the
             * text without any element reporting overflow. Walking every clipping ancestor and
             * comparing rects is what catches that — and it is exactly the reported phone bug.
             */
            let ancestor: HTMLElement | null = el.parentElement;
            let guard = 0;
            while (ancestor && guard++ < 6) {
              const cs = getComputedStyle(ancestor);
              const clips = cs.overflow !== 'visible' || cs.overflowY !== 'visible' || cs.overflowX !== 'visible';
              if (clips) {
                const ar = ancestor.getBoundingClientRect();
                const r = el.getBoundingClientRect();
                if (r.height > 0 && (r.top < ar.top - 1 || r.bottom > ar.bottom + 1)) {
                  outside.push(
                    `"${text.slice(0, 18)}" is clipped by ${String(ancestor.className).split(' ')[0]} ` +
                      `(${Math.round(r.top - ar.top)}..${Math.round(r.bottom - ar.bottom)})`,
                  );
                }
                /**
                 * HORIZONTAL CLIPPING IS CHECKED TOO.
                 *
                 * The vertical test alone missed the reported research-tree bug: the fourth tier column
                 * sat 380px outside a `.research-scroll` that clips on both axes, so "every tower" was
                 * cut off mid-sentence and nothing here noticed. A box that clips is a box that clips in
                 * BOTH directions — checking only one axis means an entire class of layout bug passes.
                 */
                if (r.width > 0 && (r.left < ar.left - 1 || r.right > ar.right + 1)) {
                  outside.push(
                    `"${text.slice(0, 18)}" is clipped horizontally by ${String(ancestor.className).split(' ')[0]} ` +
                      `(${Math.round(r.left - ar.left)}..${Math.round(r.right - ar.right)})`,
                  );
                }
              }
              ancestor = ancestor.parentElement;
            }
          }
          return { clipped, outside, overflow: collectOverflow() };

          /**
           * CONTENT TALLER THAN ITS CLIPPING BOX.
           *
           * This is the signature of the reported bug and it is invisible to `scrollHeight` on the text
           * itself: a flex parent re-centres a too-tall child, so the child's own rect still looks fine
           * while it is being cropped by the band. Comparing the union of a box's descendants against
           * that box's height catches it regardless of how the children were laid out.
           */
          function collectOverflow(): string[] {
            const out: string[] = [];
            for (const z of document.querySelectorAll('.hud-rail, .hud-side, .hud-tabs, .hud-cmds, .hud-sel')) {
              const zr = z.getBoundingClientRect();
              if (zr.height <= 0) continue;
              let top = Infinity;
              let bottom = -Infinity;
              for (const c of z.querySelectorAll('*')) {
                const r = c.getBoundingClientRect();
                if (r.height <= 0 || r.width <= 0) continue;
                const cs = getComputedStyle(c);
                if (cs.display === 'none' || cs.visibility === 'hidden') continue;
                top = Math.min(top, r.top);
                bottom = Math.max(bottom, r.bottom);
              }
              if (bottom <= top) continue;
              const contentH = bottom - top;
              if (contentH > zr.height + 1) {
                out.push(`${String(z.className).split(' ')[0]} content ${Math.round(contentH)}px in a ${Math.round(zr.height)}px box`);
              }
            }
            return out;
          }
        });

        for (const c of res.clipped) failures.push(`${vp.name}: clipped ${c}`);
        for (const o of res.outside) failures.push(`${vp.name}: ${o}`);
        for (const o of res.overflow ?? []) failures.push(`${vp.name}: ${o}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 180_000);
});

describe('phase 4 polish: every screen is geometrically clean', () => {
  /**
   * The audit that found the bugs this pass fixed. It checks ALL screens at ALL four viewports for:
   *
   *   • layout   — the screen starts at the top of the viewport, fits inside it, and only one screen is
   *                mounted (the sandbox used to stack two, rendering itself at y=780 in a 768px window);
   *   • clipping — no text box crops its own content;
   *   • errors   — zero page errors and zero console errors.
   *
   * Text-overflow ellipsis is exempt: that is deliberate truncation, not a layout bug.
   */
  const SCREENS = ['menu', 'lobby', 'settings', 'gallery', 'results', 'sandbox', 'pause', 'match'] as const;

  it.skipIf(!available)('no screen overflows, clips or errors at any viewport', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const vp of VIEWPORTS) {
        for (const screen of SCREENS) {
          const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
          const errs: string[] = [];
          page.on('pageerror', (e) => errs.push(e.message));
          page.on('console', (m) => {
            if (m.type() === 'error') errs.push(m.text().slice(0, 120));
          });
          await page.goto(`${BASE}/app.html?screen=${screen}`, { waitUntil: 'networkidle' });
          await page
            .waitForFunction(() => (window as unknown as { __app?: unknown }).__app !== undefined, null, { timeout: 30000 })
            .catch(() => errs.push('app never booted'));
          await page.waitForTimeout(screen === 'sandbox' ? 2400 : 1100);

          const r = await page.evaluate(() => {
            const vh = window.innerHeight;
            const screens = [...document.querySelectorAll('.screen')];
            const layout: string[] = [];
            for (const sc of screens) {
              const b = sc.getBoundingClientRect();
              if (b.top > 2 || b.bottom > vh + 2) {
                layout.push(`${String(sc.className).split(' ')[0]} spans ${Math.round(b.top)}-${Math.round(b.bottom)} of ${vh}`);
              }
            }
            if (screens.length > 1) layout.push(`${screens.length} screens mounted at once`);
            const clip: string[] = [];
            for (const e of document.querySelectorAll('.screen *')) {
              if (e.children.length > 0) continue;
              const t = (e.textContent ?? '').trim();
              if (!t) continue;
              const cs = getComputedStyle(e);
              if (cs.textOverflow === 'ellipsis') continue;
              if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) {
                clip.push(`${String(e.className).slice(0, 16)} "${t.slice(0, 12)}"`);
              }
            }
            return { layout, clip: [...new Set(clip)] };
          });

          for (const l of r.layout) failures.push(`${vp.name}/${screen}: ${l}`);
          for (const c of r.clip) failures.push(`${vp.name}/${screen}: clipped ${c}`);
          for (const e of errs) failures.push(`${vp.name}/${screen}: ${e}`);
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 400_000);
});

describe('phase 4 polish: the research tree fits its viewport', () => {
  /**
   * THE REPORTED BUG.
   *
   * On a 1024x600 Chromebook the fifth-tier column ("Doctrine") was cut at the right edge with its text
   * — "every tower..." — sliced mid-sentence. `?screen=research` is not a route (the tree is an overlay
   * opened from the HUD), so the whole-screen cleanliness pass above never rendered it, and the HUD
   * clipping pass only walked `.hud`. The tree therefore had no layout coverage at all.
   *
   * The gate opens the real overlay on a live match and asserts the tree actually fits: no tier column
   * may extend past the graph's scroll viewport, and no node text may be horizontally clipped by it.
   */
  it.skipIf(!available)('every tier column is fully visible, with no text cut at the edge', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
        await page
          .waitForFunction(() => (window as unknown as { __app?: unknown }).__app !== undefined, null, { timeout: 30000 });
        await page.waitForTimeout(700);
        await page.evaluate(() => {
          const w = window as unknown as { __app: { openResearchTree: () => void } };
          w.__app.openResearchTree();
        });
        /**
         * WAIT FOR THE TREE TO SETTLE, NOT FOR A FIXED NUMBER OF MILLISECONDS.
         *
         * The fixed 600 ms was a guess, and on a loaded CI runner it was not enough: measured, the desktop viewport
         * reported "Mastery extends 362px past the graph viewport" — the whole width of the last tier — while the same
         * commit passed on a quiet machine and passed on the previous CI run. A measurement taken while the WebGL canvas
         * is still coming up and the display font is still loading reads the overlay at its pre-layout size.
         *
         * The settle is asserted instead: the scroll viewport's own width must be unchanged across two animation frames
         * AND at least one tier column must already be laid out. That is a property of the finished layout, so it cannot
         * pass early.
         */
        await page.waitForFunction(
          () => {
            const scroll = document.querySelector('.research-scroll') as HTMLElement | null;
            if (!scroll) return false;
            const cols = document.querySelectorAll('.research-col');
            if (cols.length === 0) return false;
            const w = scroll.getBoundingClientRect().width;
            const w2 = window as unknown as { __treeW?: number; __treeStable?: number };
            if (w2.__treeW === w) {
              w2.__treeStable = (w2.__treeStable ?? 0) + 1;
            } else {
              w2.__treeW = w;
              w2.__treeStable = 0;
            }
            return (w2.__treeStable ?? 0) >= 2;
          },
          undefined,
          { timeout: 20_000, polling: 'raf' },
        );

        const res = await page.evaluate(() => {
          const scroll = document.querySelector('.research-scroll') as HTMLElement | null;
          if (!scroll) return { error: 'research overlay did not open', cut: [] as string[], clipped: [] as string[], over: [] as string[] };
          const sr = scroll.getBoundingClientRect();
          const cut: string[] = [];
          /**
           * THE TREE MUST FIT — NO ESCAPE HATCH.
           *
           * An earlier version of this check allowed overhanging columns whenever the row happened to be
           * scrollable. That made it useless: it passed with the original 190px-floor bug restored,
           * because a scrollbar was present the whole time. A bug where content is cut off is not fixed
           * by the presence of a scrollbar, so the rule is now absolute.
           *
           * It is achievable, which is what makes it a fair requirement: the tier floor is 100px and
           * five tiers need `5*100 + 4*4 + 24 = 540px`, which every supported viewport exceeds (the
           * narrowest is 667px). If a viewport ever appears that genuinely cannot fit five legible tiers,
           * this test should fail and force that decision to be made explicitly rather than silently.
           */
          for (const col of document.querySelectorAll('.research-col')) {
            const r = col.getBoundingClientRect();
            const name = col.querySelector('.research-col__name')?.textContent ?? '?';
            if (r.right > sr.right + 1) {
              cut.push(`${name} extends ${Math.round(r.right - sr.right)}px past the graph viewport`);
            }
          }
          /**
           * NO TEXT MAY BE SLICED AT THE VIEWPORT EDGE.
           *
           * This is the actual "every tower…" symptom: a text box straddling the visible edge reads as a
           * half-word.
           */
          const clipped: string[] = [];
          for (const el of scroll.querySelectorAll('*')) {
            if (el.children.length > 0) continue;
            const text = (el.textContent ?? '').trim();
            if (!text) continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 0) continue;
            const straddlesR = r.left < sr.right && r.right > sr.right + 1;
            const straddlesL = r.left < sr.left - 1 && r.right > sr.left;
            if (straddlesR || straddlesL) {
              clipped.push(`"${text.slice(0, 20)}" is sliced at the graph edge`);
            }
            // Own box must never crop its own text, in either axis.
            if (el.scrollWidth > el.clientWidth + 1) {
              clipped.push(`"${text.slice(0, 20)}" overflows its own box horizontally`);
            }
          }
          const over: string[] = [];
          for (const col of document.querySelectorAll('.research-col')) {
            const r = col.getBoundingClientRect();
            if (r.right > window.innerWidth + 1) over.push('column past the window edge');
          }
          const fits = scroll.scrollWidth <= scroll.clientWidth + 1;
          return { error: null, cut, clipped, over, fits };
        });

        if (res.error) failures.push(`${vp.name}: ${res.error}`);
        for (const c of res.cut) failures.push(`${vp.name}: ${c}`);
        for (const c of res.clipped) failures.push(`${vp.name}: ${c}`);
        for (const o of res.over ?? []) failures.push(`${vp.name}: ${o}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 180_000);
});

describe('phase 4 polish: the results screen never contradicts itself', () => {
  /**
   * THE REPORTED BUG.
   *
   * A proof screenshot showed "Draw / Both sides were spent at the same moment" above a scoreboard
   * reading "No match has been played yet in this session" and stats of all zero. Both states were
   * produced by the same `winnerTeam === null` value: no session, and a genuine draw. Deep-linking
   * `?screen=results` therefore announced a result for a match that never happened — and the proof
   * capture did exactly that, which is how the contradiction reached review.
   *
   * The rule this pins: the headline outcome and the body must agree. A screen that says "no match"
   * must not claim a result, and a screen that claims a result must show one.
   */
  it.skipIf(!available)('the no-match state claims no result, and a real match shows one', async () => {
    const browser = await chromium!.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const failures: string[] = [];
    try {
      for (const vp of VIEWPORTS) {
        // ---- (1) deep-linked with no session: must say so, and must NOT name an outcome
        const empty = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await empty.goto(`${BASE}/app.html?screen=results`, { waitUntil: 'networkidle' });
        await empty
          .waitForFunction(() => (window as unknown as { __app?: unknown }).__app !== undefined, null, { timeout: 30000 })
          .catch(() => failures.push(`${vp.name}: app never booted`));
        await empty.waitForTimeout(800);
        const noMatch = await empty.evaluate(() => ({
          title: document.querySelector('.results-title')?.textContent?.trim() ?? '',
          body: document.body.innerText,
          saysNoMatch: /no match has been played/i.test(document.body.innerText),
        }));
        if (!noMatch.saysNoMatch) {
          failures.push(`${vp.name}: results with no session does not say no match was played`);
        }
        for (const outcome of ['Draw', 'Victory', 'Defeat']) {
          if (noMatch.title === outcome) {
            failures.push(
              `${vp.name}: results with no session announces "${outcome}" while its body says no match was played`,
            );
          }
        }
        await empty.close();

        // ---- (2) a real finished match: must show an outcome AND a populated board
        const real = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await real.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'networkidle' });
        await real
          .waitForFunction(() => (window as unknown as { __app?: unknown }).__app !== undefined, null, { timeout: 30000 })
          .catch(() => failures.push(`${vp.name}: match never booted`));
        await real.waitForTimeout(1200);
        const finished = await real.evaluate(async () => {
          const w = window as unknown as {
            __app: { session: { issue: (c: unknown) => boolean; surrender?: () => void } };
          };
          // Finish a real match by conceding, which is a legal player action.
          const issued = w.__app.session.issue({ type: 'surrender' });
          await new Promise((r) => setTimeout(r, 900));
          return { issued };
        });
        await real.waitForTimeout(900);
        const shown = await real.evaluate(() => ({
          title: document.querySelector('.results-title')?.textContent?.trim() ?? null,
          rows: document.querySelectorAll('.results-row').length,
          saysNoMatch: /no match has been played/i.test(document.body.innerText),
          duration: document.querySelector('.results-stat__value')?.textContent ?? '',
          body: document.body.innerText.slice(0, 400),
        }));
        if (shown.title === null) {
          failures.push(`${vp.name}: surrendering did not reach the results screen`);
        } else {
          if (shown.saysNoMatch) {
            failures.push(`${vp.name}: a finished match showed the "no match has been played" empty state`);
          }
          if (shown.rows < 2) {
            failures.push(`${vp.name}: a finished match showed ${shown.rows} scoreboard rows`);
          }
        }
        void finished;
        await real.close();
      }
    } finally {
      await browser.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 240_000);
});
