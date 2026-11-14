// GAMEPLAY RECORDING for the art review — a real match in the real renderer.
//
// This is not a mockup and not a slideshow: it boots the actual v2 game, spawns a full-roster battle,
// lets the simulation run, pans and zooms while it plays, and captures the canvas continuously with
// Playwright video. What a reviewer sees is exactly what a player sees.
//
// Every claim about the recording is checked after the fact: the file must exist, be non-trivial in
// size, and ffprobe must report a real duration and frame count. A "recording" that failed to capture
// would otherwise be indistinguishable from a successful one.
//
//   node audit/phase3-final-video.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs/proof/phase-3-final');
const RAW = join(OUT, '.video-raw');
const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5339/';
mkdirSync(OUT, { recursive: true });
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  recordVideo: { dir: RAW, size: { width: 1366, height: 768 } },
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 180)}`);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__v2 !== undefined, null, { timeout: 30000 });
await page.waitForTimeout(1500);

// Phase 1: a massed fight at default zoom, so the clump-readability work is visible in motion.
await page.evaluate(() => window.__v2.spawnBattle(26));
await page.waitForTimeout(5000);

// Phase 2: pan across the fight so the reviewer sees the units from several angles and positions.
for (const [dx, dy] of [
  [140, 0],
  [-280, 40],
  [140, -40],
]) {
  await page.evaluate(
    ([x, y]) => {
      const c = window.__v2.renderer.camera;
      c.panByScreen(x, y);
    },
    [dx, dy],
  );
  await page.waitForTimeout(1400);
}

// Phase 3: zoom in on the fight so individual silhouettes are legible.
await page.evaluate(() => {
  const v = window.__v2;
  v.renderer.camera.setZoom(1.7);
});
await page.waitForTimeout(2600);

// Phase 4: zoom back out and let the fight resolve for a while.
await page.evaluate(() => window.__v2.renderer.camera.setZoom(1.0));
await page.waitForTimeout(4200);

const stats = await page.evaluate(() => {
  const v = window.__v2;
  const s = v.state;
  let alive = 0;
  for (let i = 0; i < s.entities.count; i++) if (!s.entities.dead[i] && s.entities.kind[i] === 0) alive++;
  return { aliveUnits: alive, tick: s.tick };
});

await ctx.close();
await browser.close();

// Playwright writes the video on context close with a random name; normalise it.
const files = readdirSync(RAW).filter((f) => f.endsWith('.webm'));
if (files.length !== 1) throw new Error(`expected exactly one recording, found ${files.length}`);
const target = join(OUT, 'phase3-final-gameplay.webm');
renameSync(join(RAW, files[0]), target);
rmSync(RAW, { recursive: true, force: true });

// Verify the recording is real.
if (!existsSync(target)) throw new Error('recording missing');
const size = statSync(target).size;
const probe = execFileSync(
  'ffprobe',
  ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames,width,height', '-show_entries', 'format=duration', '-of', 'json', target],
  { encoding: 'utf8' },
);
const meta = JSON.parse(probe);
const dur = Number(meta.format?.duration ?? 0);
const frames = Number(meta.streams?.[0]?.nb_read_frames ?? 0);
console.log(`recording: ${(size / 1048576).toFixed(2)} MB, ${dur.toFixed(1)}s, ${frames} frames, ${stats.aliveUnits} units alive at end, tick ${stats.tick}`);
if (dur < 10) throw new Error(`recording too short: ${dur}s`);
if (frames < 100) throw new Error(`recording has too few frames: ${frames}`);
if (errs.length) {
  console.log('ERRORS:', errs.slice(0, 5));
  process.exitCode = 1;
}
