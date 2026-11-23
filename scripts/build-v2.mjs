#!/usr/bin/env node
/**
 * Builds the v2 app into `dist/v2/`, so the ONE Cloudflare Pages deploy serves both games:
 *
 *   /                      v1  (built by `npm run build:v1` into `dist/`)
 *   /v2/                   v2, the playable app shell (menu → lobby → match)
 *   /v2/spectate.html      v2's AI-vs-AI spectate harness (v2's own `index.html`)
 *   /v2/gallery.html …     every other v2 Vite entry, unchanged
 *   /atlas-final/          v2's sprite atlas, copied to the root as well (see below)
 *
 * Pages runs a single `npm run build` at the repository root and publishes `dist`, so this script is
 * what puts v2 inside that one output. It is build-and-deploy plumbing only: no v1 or v2 source is
 * touched, and `v2/npm run build` on its own still uses `base: './'` so local dev, vitest and the CI
 * `v2` job behave exactly as before. The deploy-only base is applied here through Vite's `--base`
 * flag, which is why v2's `vite.config.ts` needs no change.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const V2 = join(ROOT, 'v2');
const V2_DIST = join(V2, 'dist');
const V1_DIST = join(ROOT, 'dist');
const OUT = join(V1_DIST, 'v2');

/** The URL prefix v2 is deployed under. Must match the directory copied into `dist/`. */
const BASE = '/v2/';

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env });
}

function step(label) {
  console.log(`\n[build:v2] ${label}`);
}

function fail(message) {
  console.error(`\n[build:v2] FAILED: ${message}`);
  process.exit(1);
}

/**
 * v2 is a separate npm project, so a clean Pages checkout has only installed the root one. `npm ci`
 * also runs when `v2/package-lock.json` is newer than the installed tree, which is what makes a
 * restored build cache safe to reuse instead of trusting it blindly.
 *
 * `--include=dev` because the build needs TypeScript and Vite, and hosted builds often run with
 * NODE_ENV=production.
 */
function v2DepsAreCurrent() {
  const installed = join(V2, 'node_modules', '.package-lock.json');
  if (!existsSync(join(V2, 'node_modules', 'vite', 'package.json')) || !existsSync(installed)) return false;
  try {
    return statSync(installed).mtimeMs >= statSync(join(V2, 'package-lock.json')).mtimeMs;
  } catch {
    return false;
  }
}

if (!v2DepsAreCurrent()) {
  step('installing v2 dependencies');
  run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], V2);
} else {
  step('v2 dependencies already installed');
}

step(`building v2 with base ${BASE}`);
run('npm', ['run', 'build', '--', `--base=${BASE}`], V2);

step('copying the v2 bundle into dist/v2');
if (!existsSync(join(V2_DIST, 'index.html')) || !existsSync(join(V2_DIST, 'app.html'))) {
  fail('v2 build produced no HTML entries');
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const entry of readdirSync(V2_DIST)) {
  cpSync(join(V2_DIST, entry), join(OUT, entry), { recursive: true });
}

/**
 * Pick the file behind each deployed URL. v2 ships TWO HTML apps:
 *
 *   app.html    the playable Phase 4 shell (menu → lobby → skirmish → match)
 *   index.html  the Phase 3 AI-vs-AI renderer harness
 *
 * `/v2/` has to be the playable game, so the app shell takes the directory index; the harness keeps
 * being reachable by name as `/v2/spectate.html`. Both are byte-for-byte copies of v2's own build
 * output — the only thing that changes is which filename they sit behind.
 */
copyFileSync(join(OUT, 'app.html'), join(OUT, 'index.html'));
copyFileSync(join(V2_DIST, 'index.html'), join(OUT, 'spectate.html'));

/**
 * v2 fetches its sprite atlas from the ABSOLUTE path `/atlas-final/`
 * (`v2/src/render/atlas.ts`, deliberately absolute so the request never depends on the document's
 * own URL). `--base` cannot rewrite a string literal inside JS, so the atlas is published at the
 * site root too. Without it the request misses every file and Cloudflare's SPA fallback answers with
 * v1's index.html, so v2 boots to "Failed to start".
 */
step('publishing the v2 atlas at /atlas-final/ (v2 requests it by absolute path)');
cpSync(join(V2, 'public', 'atlas-final'), join(V1_DIST, 'atlas-final'), { recursive: true });

/**
 * Assert the deploy is actually the thing we claim, because every failure here is SILENT in
 * production: a wrong base or a missing atlas still deploys cleanly and only shows up as `/v2/`
 * rendering v1's HTML through the SPA fallback.
 */
step('verifying the deploy layout');
const v2Index = readFileSync(join(OUT, 'index.html'), 'utf8');
if (!existsSync(join(V1_DIST, 'index.html'))) {
  fail('dist/index.html is missing — run `npm run build` (which builds v1 first), not `build:v2` alone');
}
const v1Index = readFileSync(join(V1_DIST, 'index.html'), 'utf8');
if (!v2Index.includes(`"${BASE}assets/`)) fail(`dist/v2/index.html does not reference ${BASE}assets/`);
if (v1Index.includes(`${BASE}assets/`)) fail('v1 index.html unexpectedly references the v2 bundle');
if (!existsSync(join(V1_DIST, 'atlas-final', 'units.json'))) fail('dist/atlas-final/units.json is missing');
if (!existsSync(join(OUT, 'spectate.html'))) fail('dist/v2/spectate.html is missing');
const v2Js = readdirSync(join(OUT, 'assets')).filter((f) => f.endsWith('.js'));
if (v2Js.length === 0) fail('dist/v2/assets contains no JavaScript');

console.log(`[build:v2] ok — ${v2Js.length} v2 chunks under ${BASE}assets/, atlas at /atlas-final/`);
