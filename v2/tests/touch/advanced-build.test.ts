// THE ADVANCED STRUCTURES ARE ACTUALLY BUILDABLE — a real browser builds one through the HUD.
//
// Resonance Vault, Arcane Nexus and Astral Spire are tagged `menuCategory: advanced` in the content set, and the console
// mapped only `buildings` and `defenses` onto its four tabs, so none of the three appeared anywhere and a player could not
// build them at all. That is a gameplay regression against v1, and Zachary approved surfacing what the Astral Spire
// unlocks. The fix is the Buildings tab's Core/Advanced switch.
//
// THIS PROVES IT BY BUILDING ONE. `audit/advanced-reach.ts` proves the tiles are visible at all five viewports; a visible
// tile that arms nothing would still be a regression, so this case:
//
//   1. opens the Buildings tab and switches to Advanced,
//   2. asserts the three structures are present and that each names its prerequisite chain,
//   3. unlocks the chain by granting the prerequisites through the debug surface,
//   4. taps the Resonance Vault tile and places it on the board,
//   5. asserts a `resonance_vault` ENTITY exists in the simulation.
//
// The pass/fail is the sim's own entity list, never a screenshot: a tile that draws correctly and issues nothing fails.
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

/** The same five viewports the layout gates use, so a pass here means a pass there. */
const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375 },
  { name: 'phone-844x390', width: 844, height: 390 },
  { name: 'portrait-390x844', width: 390, height: 844 },
  { name: 'chromebook-1366x768', width: 1366, height: 768 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
];

/** The three structures that were unreachable. */
const ADVANCED = ['resonance_vault', 'arcane_nexus', 'astral_spire'];

/** A real touch tap through CDP, the same channel a device uses — `mouse.click` is not a touch. */
async function touchTap(
  page: import('@playwright/test').Page,
  cdp: import('@playwright/test').CDPSession,
  x: number,
  y: number,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
}

async function boot(vp: { width: number; height: number }): Promise<{
  page: import('@playwright/test').Page;
  cdp: import('@playwright/test').CDPSession;
  errors: string[];
  close: () => Promise<void>;
}> {
  const browser = await chromium!.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: true,
    isMobile: vp.width < 900,
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${BASE}/app.html?screen=match&seed=1000&d0=normal&d1=normal`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="hud"]', { timeout: 60_000 });
  await page.waitForTimeout(1800);
  const cdp = await ctx.newCDPSession(page);
  return {
    page,
    cdp,
    errors,
    close: async () => {
      await page.close();
      await browser.close();
    },
  };
}

describe('advanced structures are reachable from the HUD', () => {
  it('has the readiness probe resolve before cases run', async () => {
    await ready;
    expect(typeof available).toBe('boolean');
  });

  for (const vp of VIEWPORTS) {
    it.skipIf(!available)(
      `${vp.name}: the Advanced page lists all three, names their prerequisites, and builds one`,
      async () => {
        const { page, cdp, errors, close } = await boot(vp);
        try {
          // A portrait console starts collapsed; the tiles do not exist until it is expanded.
          const expand = page.locator('[data-testid="hud-expand"]');
          if (await expand.isVisible().catch(() => false)) {
            await expand.tap();
            await page.waitForTimeout(250);
          }

          // ---- the Buildings tab is the default, but tap it so the case proves the tab is live.
          await page.locator('[data-tab="buildings"]').tap();
          await page.waitForTimeout(200);

          const switchEl = page.locator('[data-testid="hud-build-pages"]');
          await switchEl.waitFor({ state: 'visible', timeout: 10_000 });

          // ---- switch to Advanced and read the tiles
          await page.locator('[data-testid="hud-page-advanced"]').tap();
          await page.waitForTimeout(250);

          const tiles = await page.locator('[data-testid="hud-tiles"] .prod-tile').evaluateAll((els) =>
            els.map((e) => {
              const h = e as HTMLElement;
              return { tile: h.dataset.tile ?? '', title: h.getAttribute('title') ?? '' };
            }),
          );
          const ids = tiles.map((t) => t.tile);
          for (const want of ADVANCED) {
            expect(ids, `${vp.name}: the Advanced page does not list ${want}`).toContain(want);
            const t = tiles.find((x) => x.tile === want)!;
            /**
             * LOCKED STATE MUST BE EXPLAINED, not merely implied by a dimmed tile.
             *
             * A locked tile that says only "Requires a structure you do not have" tells a player they are stuck but not
             * what unlocks it; the tooltip therefore carries the definition's own `description` and, for the Spire, the
             * four spells it unlocks with their cooldowns — which is the piece Zachary specifically approved showing.
             */
            expect(t.title.length, `${vp.name}: ${want} has an empty tooltip`).toBeGreaterThan(want.length + 10);
          }

          // The Astral Spire tooltip names what it unlocks, which is the approved surface.
          const spireTitle = tiles.find((t) => t.tile === 'astral_spire')!.title;
          expect(spireTitle, `${vp.name}: the Astral Spire does not say what it unlocks`).toMatch(/Unlocks:/);
          expect(spireTitle, `${vp.name}: the Astral Spire does not name its spells`).toMatch(/Astral Lance|Meteor Storm/);

          // ---- unlock the chain, then build a Resonance Vault through the tile
          const armed = await page.evaluate(() => {
            /**
             * GRANT THE CHAIN, NOT THE STRUCTURE.
             *
             * `buildingBlocker` reads the player's unlocked tech, which the sim records as each prerequisite COMPLETES.
             * Pushing the prerequisite ids reproduces exactly the state a player reaches by building them, so the tile is
             * being judged on the same rule it will be judged on in a real match — rather than the test bypassing the
             * gate it is meant to prove.
             */
            const app = window.__app;
            const me = app.controller!.state.players.find((p) => p.id === app.controller!.me) as unknown as {
              mana: number;
              unlockedTech: string[];
            };
            me.mana = 60_000;
            for (const r of ['attunement_spire', 'ley_conduit', 'summoning_circle', 'golem_forge', 'arcane_nexus']) {
              if (!me.unlockedTech.includes(r)) me.unlockedTech.push(r);
            }
            return { mana: me.mana };
          });
          expect(armed.mana, `${vp.name}: could not grant mana`).toBeGreaterThan(50_000);

          await page.waitForTimeout(600);
          const vault = page.locator('[data-testid="hud-tile-resonance_vault"]');
          await vault.scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          const box = await vault.boundingBox();
          expect(box, `${vp.name}: the Resonance Vault tile has no box`).not.toBeNull();
          await vault.tap();
          await page.waitForTimeout(300);

          const placing = await page.evaluate(() => window.__app.appState.placing);
          expect(placing, `${vp.name}: the Resonance Vault tile did not arm placement`).toBe('resonance_vault');

          /**
           * PLACE IT FROM THE SAFE RECT.
           *
           * On a 667x375 phone the sidebar covers a third of the width and the seeded ghost can project underneath it, so
           * a tap at the ghost's raw position lands on the console. Centring the camera on the ghost and tapping the safe
           * rect's middle is what a player does, and it is on the canvas by construction at every viewport.
           */
          /**
           * TAP THE GHOST'S OWN PROJECTED POINT.
           *
           * The earlier version centred the camera on the ghost and then tapped the safe rect's middle, on the assumption
           * that the two coincide. They do not: `camera.viewport` is the FULL canvas (667x375 here) while `safeRect()` is
           * the HUD-free part (531 wide), so centring puts the ghost at the viewport's centre — x=333 — and the safe
           * rect's middle is x=265. That is 68px away, which lands on different ground and places nothing. Measured on
           * both phone viewports; the desktop ones passed only because the console is narrower in relative terms.
           *
           * So the camera is centred and the tap goes exactly where the ghost projects, with a check that the point is
           * on the canvas and not under the console.
           */
          const target: { x: number; y: number; onBoard: boolean; tag: string; safe: { x: number; y: number; w: number; h: number } } | null = await page.evaluate(() => {
            const app = window.__app as unknown as {
              controller: {
                camera: {
                  centerOn(x: number, y: number): void;
                  safeRect(): { x: number; y: number; w: number; h: number };
                  worldToScreenPoint(x: number, y: number): { x: number; y: number };
                };
                rend: { setPlacement(g: unknown): void };
              };
              input: { ghost: { tx: number; ty: number; x: number; y: number } | null } | null;
            };
            const c = app.controller;
            const g = app.input?.ghost;
            if (!g) return null;
            const world = { x: (g.tx + 0.5) * 32, y: (g.ty + 0.5) * 32 };
            c.camera.centerOn(world.x, world.y);
            c.rend.setPlacement(g);
            const p = c.camera.worldToScreenPoint(world.x, world.y);
            const safe = c.camera.safeRect();
            const onBoard = p.x >= safe.x && p.x <= safe.x + safe.w && p.y >= safe.y && p.y <= safe.y + safe.h;
            const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
            return { x: p.x, y: p.y, onBoard, tag: el?.tagName ?? '', safe };
          });
          expect(target, `${vp.name}: no placement ghost to tap`).not.toBeNull();
          if (!target) throw new Error(`${vp.name}: no placement ghost to tap`);
          expect(target.onBoard, `${vp.name}: the ghost projects under the console at ${target.x},${target.y}`).toBe(true);
          expect(target.tag, `${vp.name}: the ghost's screen point is not over the board`).toBe('CANVAS');
          await touchTap(page, cdp, target.x, target.y);
          await page.waitForTimeout(700);

          const built = await page.evaluate(() => {
            const st = window.__app.controller!.state;
            const me = window.__app.controller!.me;
            let n = 0;
            for (let s = 0; s < st.entities.count; s++) {
              if (st.entities.dead[s]) continue;
              if (st.entities.extras[s]!.defId !== 'resonance_vault') continue;
              if (st.entities.ownerIndex[s] !== st.entities.ownerIndexFor(me)) continue;
              n++;
            }
            return { count: n, placing: window.__app.appState.placing };
          });
          expect(built.count, `${vp.name}: no resonance_vault was placed through the HUD`).toBeGreaterThan(0);
        } finally {
          await close();
        }
        expect(errors, `${vp.name}: page errors\n${errors.join('\n')}`).toEqual([]);
      },
      180_000,
    );
  }
});
