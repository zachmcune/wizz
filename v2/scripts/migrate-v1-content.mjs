// One-off migration: copy v1 content into v2/data and adapt it to the v2 schema.
// Run once with `node v2/scripts/migrate-v1-content.mjs` from the repo root.
//
// What it changes (and why each change is required by the v2 schema):
//   1. art.sprite is REQUIRED in v2. v1 units already have it; v1 buildings mostly do too, but
//      `resonance_vault` pointed at the attunement_spire sprite, which we keep (it is a deliberate
//      art reuse, not a typo).
//   2. art.shape is now OPTIONAL (only the procedural fallback provider uses it) — left as-is.
//   3. v1 maps carry `heights`; v2 requires it. duel_glade already has it.
//   4. `visualHeights` (v1 deprecated field) is dropped.
//   5. Nothing else changes: every number is copied verbatim so the parity test is meaningful.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const srcData = join(repoRoot, 'data');
const dstData = join(repoRoot, 'v2', 'data');

const dirs = ['units', 'buildings', 'spells', 'projectiles', 'factions', 'maps', 'match'];

function copyDir(dir) {
  const from = join(srcData, dir);
  let names = [];
  try {
    names = readdirSync(from).filter((n) => n.endsWith('.json'));
  } catch {
    console.log(`  (skip ${dir}: not present)`);
    return 0;
  }
  const to = join(dstData, dir);
  mkdirSync(to, { recursive: true });
  for (const name of names) {
    const raw = JSON.parse(readFileSync(join(from, name), 'utf8'));

    if (dir === 'maps') {
      delete raw.visualHeights;
      if (!raw.heights) throw new Error(`map ${name} has no heights; v2 requires them`);
    }

    writeFileSync(join(to, name), JSON.stringify(raw, null, 2) + '\n');
  }
  console.log(`  copied ${names.length} from ${dir}`);
  return names.length;
}

mkdirSync(dstData, { recursive: true });

let total = 0;
for (const d of dirs) total += copyDir(d);

// balance.json is a single file at the data root.
const balance = JSON.parse(readFileSync(join(srcData, 'balance.json'), 'utf8'));
writeFileSync(join(dstData, 'balance.json'), JSON.stringify(balance, null, 2) + '\n');
console.log('  copied balance.json');

// An empty manifest so the overlay loader has something valid to read.
writeFileSync(join(dstData, 'manifest.json'), JSON.stringify({ version: 1, overlays: {} }, null, 2) + '\n');
console.log('  wrote manifest.json');

console.log(`\nMigrated ${total} definition files into v2/data.`);
