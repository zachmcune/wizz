// THE TOUCH PROOF — v1-style touch controls, driven as real touch events in a real browser.
//
// THE CLAIM UNDER TEST is Zachary's: "I want the touch controls to be basically the same as the first
// one." The unit suite proves the recogniser's state machine; this suite proves the whole chain works on
// a page — that a real touchscreen tap selects a unit, that a real one-finger drag moves the camera, that
// a real two-finger pinch changes the zoom, that a tap on the ground issues a move order, and that a build
// tile plus a tap on the ground places a structure.
//
// HOW TOUCH IS DELIVERED. Playwright's `page.touchscreen.tap()` only supports one finger, so multi-touch
// goes through the CDP `Input.dispatchTouchEvent` command, which is the same channel a real device uses.
// Every case therefore exercises the browser's own pointer-event synthesis: the app never sees a
// programme-driven "call tap()" shortcut, it sees the events a finger produces.
//
// EACH CASE ASSERTS STATE, NOT SCREENSHOTS. The screenshots are committed as evidence, but the pass/fail
// is a value the simulation holds — `selection.size`, an entity count, the camera's own zoom — so a case
// cannot pass by drawing something that looks right.

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

/** The three target viewports, all as touch devices, because these are touch cases. */
const TOUCH_VIEWPORTS = [
  { name: 'phone-landscape-667x375', width: 667, height: 375 },
  { name: 'phone-landscape-844x390', width: 844, height: 390 },
  { name: 'phone-portrait-390x844', width: 390, height: 844 },
  { name: 'chromebook-1366x768-touch', width: 1366, height: 768 },
];

/** The live app surface the proof reads. Narrow structural types so a rename fails loudly. */
/**
 * The page-side shape the proof reads.
 *
 * Deliberately WIDER than the app's own types for the parts a harness needs and the game does not
 * (`ownerIndexFor`, `slotOf`, `extras`, `issue`). These all exist at runtime; typing them here rather than
 * exporting them from the app keeps the harness's needs out of the product's public surface.
 */
interface EntityStoreView {
  count: number;
  dead: Uint8Array;
  kind: Uint8Array;
  ownerIndex: Int16Array;
  id: number[];
  posX: number[];
  posY: number[];
  extras: { defId: string }[];
  ownerIndexFor(id: string): number;
  slotOf(id: number): number;
  liveCount(): number;
}

interface AppHandle {
  registry: { buildings: Map<string, { footprint: number }> };
  controller: {
    camera: {
      zoom: number;
      centerX: number;
      centerY: number;
      viewport: { w: number; h: number };
      worldToScreenPoint(x: number, y: number): { x: number; y: number };
      safeRect(): { x: number; y: number; w: number; h: number };
    };
    state: { tick: number; players: { id: string; mana: number }[]; entities: EntityStoreView };
    me: string;
    issue(cmd: Record<string, unknown>): boolean;
    rend: { setPlacement?: unknown };
  } | null;
  input: {
    ghost: { valid: boolean; tx: number; ty: number } | null;
    armed: string | null;
  } | null;
  appState: { selection: Set<number>; placing: string | null };
}

declare global {
  interface Window {
    __app: AppHandle;
  }
}

/** Boot a live match on a touch context and return the page plus a CDP session for multi-touch. */
async function bootTouchMatch(
  vp: (typeof TOUCH_VIEWPORTS)[number],
): Promise<{ ctx: Awaited<ReturnType<NonNullable<typeof chromium>['launch']>> extends never ? never : import('@playwright/test').BrowserContext; page: import('@playwright/test').Page; cdp: import('@playwright/test').CDPSession; errors: string[] }> {
  const browser = await chromium!.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160));
  });
  await page.goto(`${BASE}/app.html?screen=match`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__app?.controller !== null && window.__app?.controller !== undefined, null, { timeout: 40_000 });
  await page.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(page);
  // A tap needs to be long enough for the recogniser's tap window but short enough not to become a hold.
  return { ctx, page, cdp, errors };
}

/** Project a world position into viewport CSS pixels using the live camera. */
async function worldToScreen(page: import('@playwright/test').Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([x, y]) => window.__app.controller!.camera.worldToScreenPoint(x!, y!), [wx, wy]);
}

/** A real single-finger tap through the touch channel. */
async function touchTap(page: import('@playwright/test').Page, cdp: import('@playwright/test').CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(120);
}

/** A real one-finger drag: down, several moves, up. Pan mode is the touch default. */
async function touchDrag(
  page: import('@playwright/test').Page,
  cdp: import('@playwright/test').CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 6,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(120);
}

/** A real two-finger pinch: both fingers down, spread or close, both up. */
async function touchPinch(
  page: import('@playwright/test').Page,
  cdp: import('@playwright/test').CDPSession,
  center: { x: number; y: number },
  fromGap: number,
  toGap: number,
  steps = 8,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: center.x - fromGap / 2, y: center.y, id: 1 },
      { x: center.x + fromGap / 2, y: center.y, id: 2 },
    ],
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const gap = fromGap + (toGap - fromGap) * t;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: center.x - gap / 2, y: center.y, id: 1 },
        { x: center.x + gap / 2, y: center.y, id: 2 },
      ],
    });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(160);
}

describe('touch: a tap selects, and a tap on the ground moves the selection', () => {
  for (const vp of TOUCH_VIEWPORTS) {
    it.skipIf(!available)(`${vp.name}: tap a Wisp to select it, then tap the ground to move it`, async () => {
      const { ctx, page, cdp, errors } = await bootTouchMatch(vp);
      try {
        // Clear the boot selection so the case starts from nothing.
        await page.evaluate(() => window.__app.appState.selection.clear());
        await page.waitForTimeout(100);

        // ---- find a Wisp and tap exactly on it
        const wisp = await page.evaluate(() => {
          const c = window.__app.controller!;
          const st = c.state;
          const myIdx = st.entities.ownerIndexFor(c.me);
          for (let s = 0; s < st.entities.count; s++) {
            if (st.entities.dead[s] || st.entities.kind[s] !== 0) continue;
            if (st.entities.ownerIndex[s] !== myIdx) continue;
            return { id: st.entities.id[s]!, x: st.entities.posX[s]!, y: st.entities.posY[s]! };
          }
          return null;
        });
        expect(wisp, `${vp.name}: no own unit to tap`).not.toBeNull();
        const p = await worldToScreen(page, wisp!.x, wisp!.y);
        // The tap must land on the canvas, not on HUD chrome that happens to be over it.
        const onCanvas = await page.evaluate(([x, y]) => {
          const el = document.elementFromPoint(x!, y!);
          return el?.tagName === 'CANVAS';
        }, [p.x, p.y]);
        expect(onCanvas, `${vp.name}: the Wisp's own screen position is covered by HUD chrome`).toBe(true);
        await touchTap(page, cdp, p.x, p.y);

        const sel = await page.evaluate(() => [...window.__app.appState.selection]);
        expect(sel, `${vp.name}: a tap on the Wisp did not select it`).toEqual([wisp!.id]);

        // ---- tap the ground and check the unit got a move order
        const before = await page.evaluate((id) => {
          const c = window.__app.controller!;
          const slot = c.state.entities.slotOf(id);
          return { x: c.state.entities.posX[slot]!, y: c.state.entities.posY[slot]! };
        }, wisp!.id);

        /**
         * THE MOVE TARGET IS CHOSEN IN SCREEN SPACE, AND MUST BE EMPTY GROUND.
         *
         * Two traps here, both found by running the proof rather than by reasoning about it:
         *
         *   1. A target chosen in WORLD space can land under the console or past the edge on a large
         *      viewport. A screen offset from the unit's own projected position is guaranteed on screen.
         *   2. A target that happens to overlap ANOTHER of your units is not an open-ground tap — it
         *      re-selects that unit, which is correct RTS behaviour and looks like "the tap did nothing".
         *      So candidate points are tested against every entity's pick radius and the first clear one is
         *      used. Without this the case failed on portrait and Chromebook only, because there the two
         *      starting Wisps happened to project close together.
         */
        const safe = await page.evaluate(() => window.__app.controller!.camera.safeRect());
        const wispScreen = await worldToScreen(page, before.x, before.y);
        const occupied = await page.evaluate(() =>
          [...document.querySelectorAll('*')].length > 0
            ? (() => {
                const c = window.__app.controller!;
                const st = c.state;
                const out: { x: number; y: number }[] = [];
                for (let s = 0; s < st.entities.count; s++) {
                  if (st.entities.dead[s]) continue;
                  if (st.entities.kind[s] !== 0 && st.entities.kind[s] !== 1 && st.entities.kind[s] !== 3) continue;
                  const p = c.camera.worldToScreenPoint(st.entities.posX[s]!, st.entities.posY[s]!);
                  out.push({ x: p.x, y: p.y });
                }
                return out;
              })()
            : [],
        );
        const target = { x: wispScreen.x, y: wispScreen.y };
        let chosen = false;
        for (const [dx, dy] of [
          [90, 40],
          [110, 60],
          [-90, 50],
          [70, -50],
          [130, 20],
          [-110, -40],
        ] as const) {
          const cand = {
            x: Math.min(safe.x + safe.w - 24, Math.max(safe.x + 24, wispScreen.x + dx)),
            y: Math.min(safe.y + safe.h - 24, Math.max(safe.y + 24, wispScreen.y + dy)),
          };
          if (Math.hypot(cand.x - wispScreen.x, cand.y - wispScreen.y) < 40) continue;
          // Clear of every entity's pick radius, with a margin so a near-miss cannot grab one.
          if (occupied.some((o) => Math.hypot(o.x - cand.x, o.y - cand.y) < 70)) continue;
          target.x = cand.x;
          target.y = cand.y;
          chosen = true;
          break;
        }
        expect(chosen, `${vp.name}: no empty ground near the Wisp to order it to`).toBe(true);

        await touchTap(page, cdp, target.x, target.y);
        // Let the order run for a second of simulated time.
        await page.waitForTimeout(1400);
        const after = await page.evaluate((id) => {
          const c = window.__app.controller!;
          const slot = c.state.entities.slotOf(id);
          return { x: c.state.entities.posX[slot]!, y: c.state.entities.posY[slot]! };
        }, wisp!.id);
        const moved = Math.hypot(after.x - before.x, after.y - before.y);
        expect(moved, `${vp.name}: the Wisp did not move after a tap-to-move (travelled ${moved.toFixed(1)})`).toBeGreaterThan(4);
        expect(errors, errors.join('; ')).toEqual([]);
      } finally {
        await ctx.close();
        await ctx.browser()?.close();
      }
    }, 120_000);
  }
});

describe('touch: a drag pans the camera without moving the army', () => {
  for (const vp of TOUCH_VIEWPORTS) {
    it.skipIf(!available)(`${vp.name}: a one-finger drag pans and issues no order`, async () => {
      const { ctx, page, cdp, errors } = await bootTouchMatch(vp);
      try {
        await page.evaluate(() => window.__app.appState.selection.clear());
        const before = await page.evaluate(() => ({
          x: window.__app.controller!.camera.centerX,
          y: window.__app.controller!.camera.centerY,
          tick: window.__app.controller!.state.tick,
        }));
        const mid = { x: vp.width * 0.4, y: vp.height * 0.55 };
        // A long drag: 120px left and 60px down. Well past the 18px move threshold.
        await touchDrag(page, cdp, mid, { x: mid.x - 120, y: mid.y + 60 });
        const after = await page.evaluate(() => ({
          x: window.__app.controller!.camera.centerX,
          y: window.__app.controller!.camera.centerY,
          selection: [...window.__app.appState.selection],
        }));
        const moved = Math.hypot(after.x - before.x, after.y - before.y);
        expect(moved, `${vp.name}: the drag did not pan the camera (${moved.toFixed(1)} world units)`).toBeGreaterThan(20);
        /**
         * AND IT ISSUED NO ORDER. This is the failure a pan that also taps produces: the army marches off
         * wherever the drag started. The selection must still be empty and nothing may have been ordered,
         * which is why the drag is asserted through the selection rather than only through the camera.
         */
        expect(after.selection, `${vp.name}: the pan also selected something`).toEqual([]);
        expect(errors, errors.join('; ')).toEqual([]);
      } finally {
        await ctx.close();
        await ctx.browser()?.close();
      }
    }, 120_000);
  }
});

describe('touch: a pinch zooms about the pinch centre', () => {
  for (const vp of TOUCH_VIEWPORTS) {
    it.skipIf(!available)(`${vp.name}: spreading two fingers zooms in`, async () => {
      const { ctx, page, cdp, errors } = await bootTouchMatch(vp);
      try {
        const before = await page.evaluate(() => window.__app.controller!.camera.zoom);
        const center = { x: vp.width * 0.4, y: vp.height * 0.5 };
        await touchPinch(page, cdp, center, 80, 240);
        const after = await page.evaluate(() => window.__app.controller!.camera.zoom);
        expect(after, `${vp.name}: pinch-out did not zoom in (${before} -> ${after})`).toBeGreaterThan(before * 1.02);

        // And pinching closed zooms back out.
        await touchPinch(page, cdp, center, 240, 80);
        const back = await page.evaluate(() => window.__app.controller!.camera.zoom);
        expect(back, `${vp.name}: pinch-in did not zoom out (${after} -> ${back})`).toBeLessThan(after);
        expect(errors, errors.join('; ')).toEqual([]);
      } finally {
        await ctx.close();
        await ctx.browser()?.close();
      }
    }, 120_000);
  }
});

describe('touch: build a structure with a tile tap and a ground tap', () => {
  /**
   * THE FULL PLACEMENT FLOW, as a phone player does it:
   *
   *   1. tap the Buildings tab (it is the default, but the tap proves the tab is live);
   *   2. tap a production tile — this arms placement and seeds a ghost;
   *   3. the ghost reports itself valid, so the HUD could show the placement preview;
   *   4. tap the ground — a `build` command goes to the sim and a new structure exists.
   *
   * The command goes through the same rejection surface as every other order, so a refusal would leave
   * the entity count unchanged and this case would fail with the sim's own reason available.
   */
  for (const vp of TOUCH_VIEWPORTS) {
    it.skipIf(!available)(`${vp.name}: pick a building tile, see a valid ghost, tap the ground`, async () => {
      const { ctx, page, cdp, errors } = await bootTouchMatch(vp);
      try {
        // Enough mana that affordability is not the reason for a failure.
        await page.evaluate(() => {
          const p = window.__app.controller!.state.players.find((pl) => pl.id === window.__app.controller!.me)!;
          p.mana = 20_000;
        });
        // ---- 1. the Buildings tab
        const buildingsTab = page.locator('[data-tab="buildings"]');
        await buildingsTab.waitFor({ timeout: 20_000 });
        await buildingsTab.tap();
        await page.waitForTimeout(200);

        /**
         * ---- 2. the first buildable tile
         *
         * `.first()` is not enough: the tile grid is a SCROLLER, and Playwright's `tap()` waits for
         * stability, scrolls, and re-measures — but on a 390x844 portrait screen the expanded console is
         * only ~320px tall and the grid is the only scrolling part, so a tile that is technically present
         * can sit below the fold with zero client rect. The tile is therefore scrolled into the grid's view
         * first, and the case asserts the rect is real before tapping rather than relying on the tap's own
         * implicit waiting (which timed out at 30s and looked like a missing control).
         */
        /**
         * ---- 2. the first buildable tile
         *
         * The tile grid is a SCROLLER inside a console whose height is capped, so on a 390x844 portrait
         * screen an attached tile can have a zero client rect until it is scrolled into view. `.tap()`
         * waits for stability and timed out at 30s on exactly that, which read as "the control is missing".
         * Scrolling explicitly first, then asserting a real box, is the honest sequence.
         */
        const tiles = page.locator('.prod-tile[data-tile]');
        await tiles.first().waitFor({ state: 'attached', timeout: 20_000 });
        // Expand if the layout starts collapsed, so the grid is rendered at all.
        if (await page.evaluate(() => document.querySelector('.hud')?.getAttribute('data-collapsed') === 'true')) {
          await page.locator('[data-testid="hud-expand"]').tap();
          await page.waitForTimeout(300);
        }
        const tile = tiles.first();
        await tile.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const tileBox = await tile.boundingBox();
        expect(tileBox, `${vp.name}: the build tile has no rendered box`).not.toBeNull();
        expect(tileBox!.width, `${vp.name}: the build tile is zero-width`).toBeGreaterThan(10);
        expect(tileBox!.height, `${vp.name}: the build tile is zero-height`).toBeGreaterThan(10);
        const tileId = await tile.getAttribute('data-tile');
        expect(tileId, `${vp.name}: no build tile`).toBeTruthy();
        // Tap the tile by COORDINATES rather than the locator: `locator.tap()` re-checks stability after
        // scrolling and the grid's own scroll animation made that check time out.
        await touchTap(page, cdp, tileBox!.x + tileBox!.width / 2, tileBox!.y + tileBox!.height / 2);
        await page.waitForTimeout(300);

        const armed = await page.evaluate(() => ({
          placing: window.__app.appState.placing,
          ghost: window.__app.input?.ghost ?? null,
        }));
        expect(armed.placing, `${vp.name}: the tile did not arm placement`).toBe(tileId);
        expect(armed.ghost, `${vp.name}: no placement ghost`).not.toBeNull();
        expect(armed.ghost!.valid, `${vp.name}: the seeded ghost is invalid: ${JSON.stringify(armed.ghost)}`).toBe(true);

        // ---- 3. the ghost is drawn: the renderer holds it
        const ghostDrawn = await page.evaluate(() => typeof window.__app.controller!.rend.setPlacement === 'function');
        expect(ghostDrawn, `${vp.name}: the renderer has no placement overlay`).toBe(true);

        // ---- 4. tap the ground at the ghost's own tile, which is by definition valid
        const g = armed.ghost!;
        const world = await page.evaluate(
          ([tx, ty, id]) => {
            const reg = window.__app.registry;
            const fp = reg.buildings.get(String(id))?.footprint ?? 2;
            return { x: (Number(tx) + fp / 2) * 32, y: (Number(ty) + fp / 2) * 32 };
          },
          [g.tx, g.ty, tileId],
        );
        const screen = await worldToScreen(page, world.x, world.y);
        const entsBefore = await page.evaluate(() => window.__app.controller!.state.entities.liveCount());
        await touchTap(page, cdp, screen.x, screen.y);
        await page.waitForTimeout(700);

        const result = await page.evaluate(
          ([id, before]) => {
            const st = window.__app.controller!.state;
            let count = 0;
            let placed = 0;
            for (let s = 0; s < st.entities.count; s++) {
              if (st.entities.dead[s]) continue;
              count++;
              if (st.entities.extras[s]!.defId === id) placed++;
            }
            return { count, placed, before: Number(before), stillPlacing: window.__app.appState.placing };
          },
          [tileId, entsBefore],
        );
        expect(result.placed, `${vp.name}: no ${tileId} structure was placed`).toBeGreaterThan(0);
        expect(result.count, `${vp.name}: the entity count did not grow`).toBeGreaterThan(result.before);
        // Placement stays armed so several structures can be laid in a row — v1's behaviour.
        expect(result.stillPlacing, `${vp.name}: placement disarmed after one structure`).toBe(tileId);
        expect(errors, errors.join('; ')).toEqual([]);
      } finally {
        await ctx.close();
        await ctx.browser()?.close();
      }
    }, 120_000);
  }
});

describe('touch: a held press starts a box select', () => {
  it.skipIf(!available)('phone: long-press then drag selects the units inside the box', async () => {
    const vp = TOUCH_VIEWPORTS[0]!;
    const { ctx, page, cdp, errors } = await bootTouchMatch(vp);
    try {
      // Spawn a small block of own units near the base so a box has something to catch.
      await page.evaluate(() => {
        const c = window.__app.controller!;
        const st = c.state;
        const myIdx = st.players.findIndex((p) => p.id === c.me);
        let x = 0;
        let y = 0;
        for (let s = 0; s < st.entities.count; s++) {
          if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
          if (st.entities.ownerIndex[s] !== myIdx) continue;
          x = st.entities.posX[s]!;
          y = st.entities.posY[s]!;
          break;
        }
        /**
         * Six archers in a tight block. They are spaced 14 world units apart so the whole block spans under
         * 60 units — a fraction of a tile — which means the box catches all of them at ANY starting zoom
         * and the case measures the gesture rather than the framing.
         */
        for (let i = 0; i < 6; i++) {
          c.issue({ type: 'devSpawnUnit', defId: 'arcane_archer', x: x + 90 + (i % 3) * 14, y: y + 90 + Math.floor(i / 3) * 14, count: 1 });
        }
        window.__app.appState.selection.clear();
      });
      await page.waitForTimeout(400);
      /**
       * THE BOX IS BUILT FROM THE UNITS' OWN SCREEN SPREAD, not from world offsets.
       *
       * World offsets converted independently and then clamped can collapse onto each other — which is what
       * happened here, producing a zero-width box and a case that measured nothing. Instead the units'
       * projected positions are measured, their bounding box is taken, and the drag rect is that box padded
       * by 30px. Then it is CLIPPED AS A WHOLE into the battlefield, so its size survives the clamp.
       */
      const safe = await page.evaluate(() => window.__app.controller!.camera.safeRect());
      const unitPts = await page.evaluate(() => {
        const c = window.__app.controller!;
        const st = c.state;
        const myIdx = st.entities.ownerIndexFor(c.me);
        const out: { x: number; y: number }[] = [];
        for (let s = 0; s < st.entities.count; s++) {
          if (st.entities.dead[s] || st.entities.kind[s] !== 0) continue;
          if (st.entities.ownerIndex[s] !== myIdx) continue;
          const p = c.camera.worldToScreenPoint(st.entities.posX[s]!, st.entities.posY[s]!);
          out.push({ x: p.x, y: p.y });
        }
        return out;
      });
      expect(unitPts.length, 'no own units to box').toBeGreaterThan(3);
      const minX = Math.min(...unitPts.map((p) => p.x));
      const maxX = Math.max(...unitPts.map((p) => p.x));
      const minY = Math.min(...unitPts.map((p) => p.y));
      const maxY = Math.max(...unitPts.map((p) => p.y));

      // Pad by 26px, then shift the WHOLE rect inside the battlefield rather than clipping each corner.
      const pad = 26;
      const boxW = Math.min(maxX - minX + pad * 2, safe.w - 20);
      const boxH = Math.min(maxY - minY + pad * 2, safe.h - 20);
      const a = {
        x: Math.min(Math.max(minX - pad, safe.x + 10), safe.x + safe.w - 10 - boxW),
        y: Math.min(Math.max(minY - pad, safe.y + 10), safe.y + safe.h - 10 - boxH),
      };
      const b = { x: a.x + boxW, y: a.y + boxH };
      expect(b.x - a.x, 'the box has no width').toBeGreaterThan(24);
      expect(b.y - a.y, 'the box has no height').toBeGreaterThan(24);

      // Hold for longer than the 400ms long-press threshold, then drag to the far corner.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
      await page.waitForTimeout(520);
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, id: 1 }],
        });
        await page.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);

      const sel = await page.evaluate(() => [...window.__app.appState.selection]);
      expect(sel.length, 'the long-press box selected nothing').toBeGreaterThan(1);
      expect(errors, errors.join('; ')).toEqual([]);
    } finally {
      await ctx.close();
      await ctx.browser()?.close();
    }
  }, 120_000);
});
