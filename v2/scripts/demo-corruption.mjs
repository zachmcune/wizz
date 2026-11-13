// Phase 1 done-criterion 3: prove a corrupted data file fails to load with an actionable
// message naming the FILE and the FIELD.
//
// This is a runnable script (not just a unit test) so the evidence can be reproduced with one
// command and pasted into a report:
//
//   node v2/scripts/demo-corruption.mjs
//
// It bundles the pure registry builder with esbuild (already a Vite dependency), injects two
// realistic content mistakes, and prints the resulting error.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v2Root = join(here, '..');
const dataRoot = join(v2Root, 'data');
const tmp = mkdtempSync(join(tmpdir(), 'v2-corrupt-'));

function readAll() {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      out[`/data/${relative(dataRoot, full).split('\\').join('/')}`] = JSON.parse(readFileSync(full, 'utf8'));
    }
  };
  walk(dataRoot);
  return out;
}

try {
  // Bundle the pure builder so this script can import TypeScript directly. The bundle must live
  // inside v2/ so Node can resolve zod from v2/node_modules (ESM resolution walks up from the
  // importing file, not from cwd).
  const bundle = join(v2Root, '.demo-builder.mjs');
  execFileSync(
    'npx',
    [
      'esbuild',
      join(v2Root, 'src', 'data', 'registry-builder.ts'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${bundle}`,
      '--external:zod',
      '--log-level=error',
    ],
    { cwd: v2Root, stdio: 'inherit' },
  );

  const { loadRegistryFromModules } = await import(pathToFileURL(bundle).href);

  // 1. A clean load must succeed, otherwise the demo proves nothing.
  const clean = loadRegistryFromModules(readAll());
  console.log(`Clean load OK: ${clean.units.size} units, ${clean.buildings.size} buildings.\n`);

  // 2a. Schema-level corruption: a bad field value.
  console.log('--- Case A: a schema violation (hp = -5) ---');
  const badField = readAll();
  badField['/data/units/wisp.json'].hp = -5;
  let caseA = '';
  try {
    loadRegistryFromModules(badField);
    console.error('FAIL: broken content loaded without an error');
    process.exitCode = 1;
  } catch (err) {
    caseA = err.message;
    console.log(caseA + '\n');
  }

  // 2b. Cross-reference corruption: a valid file pointing at a missing id.
  // Run separately because schema errors abort the load before reference checks (by design: fix
  // the schema first, then the refs).
  console.log('--- Case B: a dangling reference (producedBy = summoning_serkyl) ---');
  const badRef = readAll();
  badRef['/data/units/arcane_archer.json'].producedBy = 'summoning_serkyl';
  let caseB = '';
  try {
    loadRegistryFromModules(badRef);
    console.error('FAIL: dangling reference loaded without an error');
    process.exitCode = 1;
  } catch (err) {
    caseB = err.message;
    console.log(caseB + '\n');
  }

  // 2c. Two schema violations at once must BOTH be reported in one run.
  console.log('--- Case C: two schema violations in one load ---');
  const twoBad = readAll();
  twoBad['/data/units/wisp.json'].hp = -5;
  twoBad['/data/units/imp_swarmling.json'].speed = -1;
  let caseC = '';
  try {
    loadRegistryFromModules(twoBad);
    console.error('FAIL: two broken files loaded without an error');
    process.exitCode = 1;
  } catch (err) {
    caseC = err.message;
    console.log(caseC + '\n');
  }

  const checks = [
    ['A names the wisp file', caseA.includes('/data/units/wisp.json')],
    ['A names the hp field', caseA.includes('hp')],
    ['A says why (must be > 0)', caseA.includes('greater than 0')],
    ['B names the archer file', caseB.includes('/data/units/arcane_archer.json')],
    ['B names the dangling id', caseB.includes('summoning_serkyl')],
    ['B explains it is not a known building', caseB.includes('not a known building')],
    ['C reports the wisp file', caseC.includes('/data/units/wisp.json')],
    ['C reports the imp file', caseC.includes('/data/units/imp_swarmling.json')],
  ];
  console.log('--- Checks ---');
  let allOk = true;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) allOk = false;
  }
  if (!allOk) process.exitCode = 1;
  else console.log('\nDone-criterion 3: PASS');
} finally {
  rmSync(tmp, { recursive: true, force: true });
  for (const leftover of ['.demo-builder.mjs']) {
    try {
      rmSync(join(v2Root, leftover), { force: true });
    } catch {
      /* best effort */
    }
  }
}
