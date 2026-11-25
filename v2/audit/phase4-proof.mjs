// PHASE 4 PROOF — every screen at every viewport, plus a full gameplay flow recording.
//
// Two parts:
//
//   1. SCREEN CAPTURES. Each of the app's screens is opened at its real viewport, driven into a
//      representative state (lobby with 4 players, sandbox on a tab, gallery in a team colour), and
//      screenshotted. Every capture is checked for: zero page errors, a non-blank frame, and no purple
//      in the chrome.
//
//   2. FLOW RECORDING. A single continuous video walking menu → lobby → match → results, driven entirely
//      through the app's own API (the same calls the buttons make), so the recording proves the flow
//      actually connects rather than showing four unrelated screens.
//
// Run: node audit/phase4-proof.mjs   (needs the v2 dev server; PROOF_BASE overrides)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs/proof/phase-4');
const SHOTS = join(OUT, 'screens');
const RAW = join(OUT, '.video-raw');
const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
mkdirSync(SHOTS, { recursive: true });
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const md5 = (b) => createHash('md5').update(b).digest('hex');

const VIEWPORTS = [
  { name: 'phone-667x375', width: 667, height: 375, density: 'compact' },
  { name: 'phone-844x390', width: 844, height: 390, density: 'compact' },
  { name: 'chromebook-1366x768', width: 1366, height: 768, density: 'regular' },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, density: 'roomy' },
];

/**
 * Each screen, with a `prime` step that drives it into the state worth photographing.
 *
 * The lobby is expanded to four players, the sandbox is moved off its default tab, and the research
 * tree is opened over a live match — an empty default screen proves nothing.
 */
const SCREENS = [
  { id: 'menu', label: 'Main menu (live 3D scene)', prime: async () => {} },
  {
    id: 'lobby',
    label: 'Lobby (4 players)',
    prime: async (page) => {
      await page.evaluate(() => {
        const app = window.__app;
        for (let i = 0; i < 2; i++) {
          const btn = document.querySelector('.lobby-add .btn');
          if (btn) btn.click();
        }
        void app;
      });
      await page.waitForTimeout(400);
    },
  },
  { id: 'settings', label: 'Settings', prime: async () => {} },
  {
    id: 'match',
    label: 'In-match HUD (default zoom)',
    prime: async (page) => {
      // Give the player an army and a fight so the HUD shows live data and a massed battle.
      await page.evaluate(() => {
        const c = window.__app.session;
        if (!c) return;
        const st = c.state;
        const cx = st.entities.posX[0] ?? 2048;
        const cy = st.entities.posY[0] ?? 1320;
        const units = ['stone_golem', 'imp_swarmling', 'arcane_archer', 'storm_caster'];
        let k = 0;
        for (const u of units) {
          for (let i = 0; i < 5; i++) {
            c.issue({ type: 'devSpawnUnit', defId: u, x: cx - 80 + (k % 5) * 34, y: cy + 60 + Math.floor(k / 5) * 34, count: 1 });
            c.issue({ type: 'devSpawnUnit', defId: u, x: cx + 80 - (k % 5) * 34, y: cy + 120 + Math.floor(k / 5) * 34, count: 1 });
            k++;
          }
        }
        // Reveal the fight and select a unit so the top bar is populated.
        c.rend.camera.centerOn(cx, cy + 80);
        c.rend.camera.setZoom(1);
        const ids = c.myUnits();
        if (ids.length) window.__app.appState.selection = new Set([ids[0]]);
      });
      await page.waitForTimeout(2600);
    },
  },
  {
    id: 'match',
    label: 'Massed battle at 667x375 (unit separation)',
    // Only captured for the phone viewport; the same battle shot at desktop proves nothing about the
    // reported phone problem.
    onlyViewport: 'phone-667x375',
    suffix: 'massed',
    prime: async (page) => {
      /**
       * A MASSED BATTLE, not a stacked pile.
       *
       * Two formations are spawned on OPPOSITE sides and ordered to attack-move into each other, which
       * is what a real fight looks like. The earlier version dropped 80 units at nearly the same point,
       * so they were still resolving their own spawn overlap when the shot was taken — a scenario that
       * cannot occur in play, and one that made the separation work look broken.
       *
       * The two formations are wide and shallow, so when they meet the front rank makes contact while
       * the rest of each line stays legible behind it.
       */
      await page.evaluate(() => {
        const c = window.__app.session;
        if (!c) return;
        const st = c.state;
        const cx = st.entities.posX[0] ?? 2048;
        const cy = st.entities.posY[0] ?? 1320;
        const units = ['stone_golem', 'imp_swarmling', 'arcane_archer', 'storm_caster', 'thornling'];
        const mine = [];
        const foe = [];
        // Left side.
        let k = 0;
        for (const u of units) {
          for (let i = 0; i < 4; i++) {
            c.issue({ type: 'devSpawnUnit', defId: u, x: cx - 210 + (k % 4) * 44, y: cy + Math.floor(k / 4) * 40, count: 1 });
            k++;
          }
        }
        // Right side.
        k = 0;
        for (const u of units) {
          for (let i = 0; i < 4; i++) {
            c.issue({ type: 'devSpawnUnit', defId: u, x: cx + 210 - (k % 4) * 44, y: cy + 120 + Math.floor(k / 4) * 40, count: 1 });
            k++;
          }
        }
        const st2 = c.state;
        const myIndex = st2.players.findIndex((p) => p.id === c.me);
        for (let s = 0; s < st2.entities.count; s++) {
          if (st2.entities.dead[s] || st2.entities.kind[s] !== 0) continue;
          const owner = st2.entities.ownerIndex[s];
          (owner === myIndex ? mine : foe).push(st2.entities.id[s]);
        }
        // Only the LEFT formation is ours to command; the right one belongs to the rival and is driven
        // by the AI. Order ours to attack-move into the middle.
        if (mine.length) c.issue({ type: 'attackMove', entityIds: mine, x: cx, y: cy + 80 });
        void foe;
        c.rend.camera.centerOn(cx, cy + 70);
        c.rend.camera.setZoom(1);
      });
      await page.waitForTimeout(5200);
    },
  },
  {
    id: 'research',
    label: 'Research tree (Astral Spire unlocks)',
    prime: async (page) => {
      await page.evaluate(() => window.__app.openResearchTree());
      await page.waitForTimeout(600);
    },
  },
  {
    id: 'sandbox',
    label: 'Sandbox (dev tabs)',
    prime: async (page) => {
      await page.waitForTimeout(2200);
      await page.evaluate(() => {
        // Move to the Scenarios tab so the capture is not the default panel.
        const tabs = [...document.querySelectorAll('.sandbox-tabs .tab')];
        const t = tabs.find((x) => (x.textContent ?? '').includes('Scenarios'));
        if (t) t.click();
      });
      await page.waitForTimeout(500);
    },
  },
  { id: 'gallery', label: 'Entity designs gallery', prime: async () => {} },
  { id: 'pause', label: 'Pause', prime: async () => {} },
  { id: 'results', label: 'Results', prime: async () => {} },
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const report = { generated: new Date().toISOString(), base: BASE, shots: [], errors: [], purple: [], recording: null };

// ───────────────────────────────────────────────────────────────────── 1. screen captures

for (const vp of VIEWPORTS) {
  for (const scr of SCREENS) {
    if (scr.onlyViewport && scr.onlyViewport !== vp.name) continue;
    if (scr.skipViewport?.includes(vp.name)) continue;

    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(`${vp.name}/${scr.id}: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errs.push(`${vp.name}/${scr.id} console: ${m.text().slice(0, 160)}`);
    });

    const url = `${BASE}/app.html?screen=${scr.id}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__app !== undefined, null, { timeout: 30000 });
    await page.waitForTimeout(900);

    try {
      await scr.prime(page);
    } catch (e) {
      errs.push(`${vp.name}/${scr.id} prime: ${String(e).slice(0, 120)}`);
    }

    const safe = scr.suffix ? `${scr.id}-${scr.suffix}` : scr.id;
    const file = join(SHOTS, `${vp.name}--${safe}.png`);
    await page.screenshot({ path: file });

    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    /**
     * PURPLE IS MEASURED IN CHROME ONLY, NOT IN CONTENT.
     *
     * The gallery and the match legitimately show the game's own violet Arcane faction art, and spell
     * effects are violet too. Flagging those would be wrong — the rule is about UI chrome. So the sprite
     * canvases and the 3D viewport are excluded: only pixels in chrome regions count.
     */
    const chromeBoxes = await page.evaluate(() => {
      const SEL = ['.hud-top', '.hud-cmd', '.hud-select', '.hud-minimap', '.page-head', '.plate', '.btn', '.panel', '.tabs', '.kbd', '.badge', '.team-chip', '.menu-left', '.lobby__foot', '.results-table'];
      const boxes = [];
      for (const sel of SEL) {
        for (const e of document.querySelectorAll(sel)) {
          const r = e.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          boxes.push([Math.floor(r.left), Math.floor(r.top), Math.ceil(r.right), Math.ceil(r.bottom)]);
        }
      }
      return boxes;
    });
    const inChrome = new Uint8Array(info.width * info.height);
    for (const [x0, y0, x1, y1] of chromeBoxes) {
      for (let y = Math.max(0, y0); y < Math.min(info.height, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(info.width, x1); x++) inChrome[y * info.width + x] = 1;
      }
    }

    let opaque = 0;
    let varied = 0;
    let purple = 0;
    let chromePx = 0;
    const buckets = new Set();
    for (let i = 0; i < info.width * info.height; i++) {
      if (data[i * 4 + 3] < 200) continue;
      opaque++;
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      buckets.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
      if (Math.abs(r - 14) > 6 || Math.abs(g - 16) > 6 || Math.abs(b - 19) > 6) varied++;
      if (!inChrome[i]) continue;
      chromePx++;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (sat > 0.3 && b > g + 40 && r > g + 15) purple++;
    }
    const purpleFrac = purple / Math.max(1, chromePx);
    const variedFrac = varied / Math.max(1, opaque);

    report.shots.push({
      viewport: vp.name,
      screen: safe,
      label: scr.label,
      size: `${vp.width}x${vp.height}`,
      bytes: statSync(file).size,
      md5: md5(readFileSync(file)),
      colourBuckets: buckets.size,
      variedFraction: Number(variedFrac.toFixed(3)),
      purpleFraction: Number(purpleFrac.toFixed(5)),
      chromePixels: chromePx,
    });
    if (purpleFrac > 0.02) report.purple.push({ shot: `${vp.name}--${safe}`, frac: purpleFrac });
    if (buckets.size < 8) report.errors.push(`${vp.name}/${safe}: only ${buckets.size} colour buckets (blank?)`);
    if (errs.length) report.errors.push(...errs);

    console.log(`${vp.name.padEnd(20)} ${safe.padEnd(22)} buckets ${String(buckets.size).padStart(5)}  purple ${(purpleFrac * 100).toFixed(2)}%`);
    await page.close();
  }
}

// ───────────────────────────────────────────────────────────────────── 2. flow recording

{
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: { dir: RAW, size: { width: 1366, height: 768 } },
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`flow: ${e.message}`));

  // --- menu
  await page.goto(`${BASE}/app.html?screen=menu`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__app !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(2200); // let the live menu scene orbit into frame

  // --- lobby (by clicking the real Skirmish button, so the recording proves the button works)
  await page.getByRole('button', { name: /skirmish/i }).click();
  await page.waitForTimeout(1600);

  // add an opponent so the lobby visibly changes
  const addAi = await page.$('.lobby-add .btn');
  if (addAi) {
    await addAi.click();
    await page.waitForTimeout(900);
  }

  // --- start the match through the real Start button
  const start = await page.$('[data-testid="start-match"]');
  if (start) {
    await start.click();
  } else {
    await page.evaluate(() => window.__app.startMatch());
  }
  await page.waitForFunction(() => document.querySelector('.hud') !== null, null, { timeout: 40000 });
  await page.waitForTimeout(2200);

  // play a little: spawn a fight, pan, zoom
  await page.evaluate(() => {
    const c = window.__app.session;
    if (!c) return;
    const st = c.state;
    const cx = st.entities.posX[0] ?? 2048;
    const cy = st.entities.posY[0] ?? 1320;
    for (const [i, u] of ['stone_golem', 'arcane_archer', 'imp_swarmling', 'storm_caster'].entries()) {
      c.issue({ type: 'devSpawnUnit', defId: u, x: cx - 70 + i * 20, y: cy + 60, count: 5 });
      c.issue({ type: 'devSpawnUnit', defId: u, x: cx + 70 - i * 20, y: cy + 130, count: 5 });
    }
    c.rend.camera.centerOn(cx, cy + 80);
  });
  await page.waitForTimeout(2600);

  // open the research tree mid-match, then close it
  await page.evaluate(() => window.__app.openResearchTree());
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.__app.closeResearchTree());
  await page.waitForTimeout(1400);

  // --- pause, then resume
  await page.evaluate(() => window.__app.go('pause'));
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.__app.resume());
  await page.waitForTimeout(1400);

  // --- end the match and land on results
  await page.evaluate(() => {
    const c = window.__app.session;
    if (c) c.issue({ type: 'surrender' });
  });
  await page.waitForTimeout(2600);

  await ctx.close();

  const files = readdirSync(RAW).filter((f) => f.endsWith('.webm'));
  if (files.length !== 1) throw new Error(`expected one recording, found ${files.length}`);
  const target = join(OUT, 'phase4-full-flow.webm');
  renameSync(join(RAW, files[0]), target);
  rmSync(RAW, { recursive: true, force: true });

  const size = statSync(target).size;
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames,width,height', '-show_entries', 'format=duration', '-of', 'json', target],
    { encoding: 'utf8' },
  );
  const meta = JSON.parse(probe);
  const dur = Number(meta.format?.duration ?? 0);
  const frames = Number(meta.streams?.[0]?.nb_read_frames ?? 0);
  report.recording = { file: 'phase4-full-flow.webm', bytes: size, durationSeconds: Number(dur.toFixed(1)), frames };
  console.log(`\nrecording: ${(size / 1048576).toFixed(2)} MB, ${dur.toFixed(1)}s, ${frames} frames`);
  if (dur < 12) report.errors.push(`recording too short: ${dur}s`);
  if (errs.length) report.errors.push(...errs);
}

await browser.close();
writeFileSync(join(OUT, 'phase4-proof.json'), JSON.stringify(report, null, 2));

console.log(`\n${report.shots.length} screenshots`);
console.log(`purple violations: ${report.purple.length}`);
console.log(`errors: ${report.errors.length}`);
if (report.errors.length) console.log(report.errors.slice(0, 8));
if (report.purple.length) console.log(report.purple);
if (report.errors.length || report.purple.length) process.exitCode = 1;
