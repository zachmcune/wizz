// UI PROOF CAPTURE — the screenshots and measured numbers the reports cite.
//
// This is a HARNESS, not a gate: it drives a real browser through every screen and every interaction the
// brief names, saves a PNG for each, and writes a JSON index with the measurements taken at the same
// moment. `tests/ui-proof.test.ts` then checks the committed pack — that each file exists, is unique, is
// not blank, has no purple, and that the recorded numbers still describe the current build.
//
// Why a separate harness rather than assertions in the spec: a capture run is slow (five viewports x
// eight screens plus the interaction states), while the review gate has to be fast enough to run on every
// push. Splitting them means the expensive evidence can be regenerated deliberately and the cheap checks
// still guard it.
//
//   PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-ui-proof.ts
//
// Every capture is taken after the interaction it is named for, and the measurement recorded alongside it
// is read from the same live page — so a screenshot cannot be paired with numbers from a different moment.

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
const OUT = join(ROOT, 'docs', 'proof', 'phase-7', 'ui');
const SHOTS = join(OUT, 'screens');

/**
 * The three devices the brief names, plus two more that the density tiers cover.
 *
 * `touch` is set on the phone contexts because several captures are of TOUCH states — an open build
 * panel, a placement preview reached by tapping a tile. On a non-touch context those arrive by mouse and
 * the capture would show a layout the phone never produces.
 */
const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, touch: true },
  { name: 'phone-844x390', width: 844, height: 390, touch: true },
  { name: 'phone-portrait-390x844', width: 390, height: 844, touch: true },
  { name: 'chromebook-1366x768', width: 1366, height: 768, touch: false },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, touch: false },
];

/** The screens, in the order a player meets them. */
const SCREENS = [
  { id: 'menu', label: 'Main menu' },
  { id: 'lobby', label: 'Skirmish lobby' },
  { id: 'multiplayer', label: 'Multiplayer lobby' },
  { id: 'settings', label: 'Settings' },
  { id: 'match', label: 'In-match HUD' },
  { id: 'pause', label: 'Pause' },
  { id: 'results', label: 'Results' },
  { id: 'gallery', label: 'Entity designs' },
];

interface Capture {
  file: string;
  viewport: string;
  screen: string;
  state: string;
  width: number;
  height: number;
  bytes: number;
  md5: string;
  /** Distinct 5-bit colour buckets. A blank or single-tone capture collapses to a handful. */
  buckets: number;
  /** Share of opaque pixels in the banned violet band. Must stay under 0.5%. */
  purpleFraction: number;
  /** Screen-specific measurements, read from the live page at capture time. */
  measured: Record<string, number | string | boolean>;
}

const captures: Capture[] = [];
const errors: string[] = [];

/** Sample a PNG for colour variety and purple content. */
async function analyse(buf: Buffer): Promise<{ buckets: number; purpleFraction: number }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Set<number>();
  let opaque = 0;
  let purple = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    const a = data[i * 4 + 3]!;
    buckets.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    if (a < 200) continue;
    opaque++;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    // Violet/indigo: blue dominant, red present, green suppressed, actually saturated.
    if (sat > 0.3 && b > g + 40 && r > g + 15) purple++;
  }
  return { buckets: buckets.size, purpleFraction: purple / Math.max(1, opaque) };
}

async function shot(page: Page, vp: string, screen: string, state: string, measured: Capture['measured']): Promise<void> {
  const name = `${vp}--${screen}${state ? `--${state}` : ''}.png`;
  const file = join(SHOTS, name);
  const buf = await page.screenshot({ path: file });
  const { buckets, purpleFraction } = await analyse(buf);
  captures.push({
    file: join('screens', name),
    viewport: vp,
    screen,
    state,
    width: page.viewportSize()?.width ?? 0,
    height: page.viewportSize()?.height ?? 0,
    bytes: buf.byteLength,
    md5: createHash('md5').update(buf).digest('hex'),
    buckets,
    purpleFraction,
    measured,
  });
  console.log(`  captured ${name} (${buckets} buckets, ${(purpleFraction * 100).toFixed(2)}% purple)`);
}

/** Boot a screen and wait for the app to be live. */
async function openScreen(page: Page, screen: string): Promise<void> {
  await page.goto(`${BASE}/app.html?screen=${screen}`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as unknown as { __app?: unknown }).__app !== undefined, null, { timeout: 45_000 }).catch(() => {
    errors.push(`${screen}: app never booted`);
  });
  // Long enough for the menu's live scene and a match's atlas to settle; a capture of a half-drawn frame
  // is not evidence.
  await page.waitForTimeout(screen === 'match' ? 1_800 : 900);
}

/** Measure the HUD's real boxes, which is what the layout claims are about. */
async function measureHud(page: Page): Promise<Capture['measured']> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = (sel: string): DOMRect | null => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const rail = rect('.hud-rail');
    const side = rect('.hud-side');
    const layout = document.querySelector('.hud')?.getAttribute('data-layout') ?? '';
    const collapsed = document.querySelector('.hud')?.getAttribute('data-collapsed') ?? '';
    const battleW = layout === 'bottom' ? vw : Math.max(0, vw - (side?.width ?? 0));
    const battleH = Math.max(0, vh - (rail?.height ?? 0) - (layout === 'bottom' ? (side?.height ?? 0) : 0));
    let smallest = 999;
    let controls = 0;
    for (const e of document.querySelectorAll('.hud button, .hud .prod-tile')) {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width <= 0 || r.height <= 0 || cs.display === 'none' || cs.visibility === 'hidden') continue;
      controls++;
      smallest = Math.min(smallest, Math.min(r.width, r.height));
    }
    return {
      layout,
      collapsed,
      battlefieldShare: Number(((battleW * battleH) / (vw * vh)).toFixed(3)),
      railHeight: Math.round(rail?.height ?? 0),
      sidebarWidth: Math.round(side?.width ?? 0),
      sidebarHeight: Math.round(side?.height ?? 0),
      controls,
      smallestControl: Math.round(smallest === 999 ? 0 : smallest),
      tabs: document.querySelectorAll('.hud-tab').length,
      tiles: document.querySelectorAll('.prod-tile').length,
      commands: document.querySelectorAll('.hud-cmd').length,
    };
  });
}

/** Read the live camera framing, which is the other half of the reported bug. */
async function measureCamera(page: Page): Promise<Record<string, number | string>> {
  const r = await page.evaluate(() => {
    const c = (window as unknown as {
      __app?: {
        controller?: {
          me: string;
          camera: {
            zoom: number;
            safeRect(): { x: number; y: number; w: number; h: number };
            worldToScreenPoint(x: number, y: number): { x: number; y: number };
            safeMapCoverage(): number;
          };
          state: { players: { id: string }[]; entities: { count: number; dead: Uint8Array; kind: Uint8Array; ownerIndex: Int16Array; posX: number[]; posY: number[] } };
        };
      };
    }).__app;
    const ctrl = c?.controller;
    if (!ctrl) return null;
    const st = ctrl.state;
    const myIdx = st.players.findIndex((p) => p.id === ctrl.me);
    let sanctum: { x: number; y: number } | null = null;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
      if (st.entities.ownerIndex[s] !== myIdx) continue;
      sanctum = ctrl.camera.worldToScreenPoint(st.entities.posX[s]!, st.entities.posY[s]!);
      break;
    }
    const safe = ctrl.camera.safeRect();
    return {
      zoom: Number(ctrl.camera.zoom.toFixed(2)),
      coverage: Number(ctrl.camera.safeMapCoverage().toFixed(3)),
      sanctumFx: sanctum ? Number(((sanctum.x - safe.x) / safe.w).toFixed(3)) : -1,
      sanctumFy: sanctum ? Number(((sanctum.y - safe.y) / safe.h).toFixed(3)) : -1,
    };
  });
  return r ?? { zoom: 0, coverage: 0, sanctumFx: -1, sanctumFy: -1 };
}

async function shootViewport(browser: Browser, vp: (typeof VIEWPORTS)[number]): Promise<void> {
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    hasTouch: vp.touch,
    isMobile: vp.touch,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vp.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${vp.name}: ${m.text().slice(0, 140)}`);
  });

  console.log(`\n${vp.name}`);

  // ---- 1. every screen, in its resting state
  for (const s of SCREENS) {
    await openScreen(page, s.id);
    const measured: Capture['measured'] = {};
    if (s.id === 'match') {
      Object.assign(measured, await measureHud(page), await measureCamera(page));
    }
    await shot(page, vp.name, s.id, '', measured);
  }

  // ---- 2. the in-match interaction states the brief asks for
  await openScreen(page, 'match');

  // 2a. a unit selected: the HUD's selection readout must be populated.
  const sel = await page.evaluate(() => {
    const c = (window as unknown as {
      __app: { controller: { me: string; state: { players: { id: string }[]; entities: { count: number; dead: Uint8Array; kind: Uint8Array; ownerIndex: Int16Array; id: number[]; posX: number[]; posY: number[] } }; camera: { worldToScreenPoint(x: number, y: number): { x: number; y: number } } } };
      appState: { selection: Set<number> };
    }).__app;
    const st = c.controller.state;
    const myIdx = st.players.findIndex((p) => p.id === c.controller.me);
    const ids: number[] = [];
    let point: { x: number; y: number } | null = null;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== 0) continue;
      if (st.entities.ownerIndex[s] !== myIdx) continue;
      ids.push(st.entities.id[s]!);
      if (!point) point = c.controller.camera.worldToScreenPoint(st.entities.posX[s]!, st.entities.posY[s]!);
    }
    c.appState.selection = new Set(ids);
    return { count: ids.length, point };
  });
  // Refresh through the HUD's own path so the readout is painted, not merely stored.
  await page.evaluate(() => {
    const hud = (window as unknown as { __app?: { hudRef?: { refresh(s: unknown): void } } }).__app?.hudRef;
    const st = (window as unknown as { __app: { controller: { state: unknown } } }).__app.controller.state;
    hud?.refresh(st);
  });
  await page.waitForTimeout(350);
  await shot(page, vp.name, 'match', 'selection', { selectedUnits: sel.count });

  // 2b. build tabs open: the Buildings tab, then Defenses and Units, so the tile grids are on record.
  for (const tab of ['buildings', 'defenses', 'units', 'tech'] as const) {
    const open = page.locator(`[data-testid="hud-tab-${tab}"]`);
    if ((await open.count()) === 0) continue;
    if (await page.evaluate(() => document.querySelector('.hud')?.getAttribute('data-collapsed') === 'true')) {
      const exp = page.locator('[data-testid="hud-expand"]');
      if ((await exp.count()) > 0) {
        const b = await exp.first().boundingBox();
        if (b) {
          if (vp.touch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
          else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
          await page.waitForTimeout(320);
        }
      }
    }
    const b = await open.first().boundingBox();
    if (!b) continue;
    if (vp.touch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(320);
    const tiles = await page.evaluate(() => document.querySelectorAll('.prod-tile').length);
    const withThumbs = await page.evaluate(() => document.querySelectorAll('.prod-tile__art[data-thumb]').length);
    await shot(page, vp.name, 'match', `tab-${tab}`, { tiles, realSpriteThumbs: withThumbs });
  }

  // 2c. placement preview: tap the first buildable tile and capture the ghost.
  await page.evaluate(() => {
    const tab = document.querySelector('[data-testid="hud-tab-buildings"]') as HTMLElement | null;
    tab?.click();
  });
  await page.waitForTimeout(250);
  const tileBox = await page.evaluate(() => {
    const t = document.querySelector('.prod-tile[data-tile]:not([data-blocked="true"])') as HTMLElement | null;
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: t.dataset.tile ?? '' };
  });
  if (tileBox) {
    if (vp.touch) await page.touchscreen.tap(tileBox.x, tileBox.y);
    else await page.mouse.click(tileBox.x, tileBox.y);
    await page.waitForTimeout(350);
    // Move the pointer over the battlefield so the ghost sits in the open rather than at the seed.
    const mid = await page.evaluate(() => {
      const cam = (window as unknown as { __app: { controller: { camera: { safeRect(): { x: number; y: number; w: number; h: number } } } } })
        .__app.controller.camera;
      const r = cam.safeRect();
      return { x: r.x + r.w * 0.55, y: r.y + r.h * 0.6 };
    });
    await page.mouse.move(mid.x, mid.y);
    await page.waitForTimeout(250);
    const ghost = await page.evaluate(() => {
      const g = (window as unknown as { __app?: { input?: { ghost?: { valid: boolean; reason: string; defId: string } | null } } }).__app?.input?.ghost;
      return g ? { valid: g.valid, reason: g.reason, defId: g.defId } : null;
    });
    await shot(page, vp.name, 'match', 'placement', {
      tile: tileBox.id,
      ghostValid: ghost?.valid ?? false,
      ghostDef: ghost?.defId ?? '',
      ghostReason: ghost?.reason ?? '',
    });
    await page.keyboard.press('Escape').catch(() => undefined);
  }

  // 2d. the collapsed console, on the layouts that start expanded, so both states are on record.
  const canCollapse = await page.evaluate(() => document.querySelectorAll('[data-testid="hud-collapse"]').length > 0);
  if (canCollapse) {
    const b = await page.locator('[data-testid="hud-collapse"]').first().boundingBox();
    if (b) {
      if (vp.touch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(350);
      await shot(page, vp.name, 'match', 'collapsed', await measureHud(page));
    }
  }

  await ctx.close();
}

async function main(): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  console.log(`[capture-ui-proof] ${BASE} -> ${OUT}`);
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    for (const vp of VIEWPORTS) await shootViewport(browser, vp);
  } finally {
    await browser.close();
  }

  const index = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    viewports: VIEWPORTS.map((v) => `${v.name}`),
    screens: SCREENS.map((s) => s.id),
    captures,
    errors,
  };
  writeFileSync(join(OUT, 'ui-proof.json'), JSON.stringify(index, null, 2));
  console.log(`\n[capture-ui-proof] ${captures.length} captures, ${errors.length} page errors`);
  if (errors.length > 0) console.log(errors.join('\n'));
}

await main();
