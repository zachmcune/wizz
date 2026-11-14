// SILHOUETTE MEASUREMENT — per-facing alpha extents for every unit in an atlas.
//
// This exists because Zachary spotted that some side facings "don't read as the same unit": the Stone
// Golem at facings 2/6 collapsed into an oblong slab. Eyeballing 35 sheets x 8 facings is not a
// reliable check, so this measures the rendered silhouette directly from the atlas pages.
//
// For each facing it reports the opaque bounding box, the width:height aspect, and the filled area.
// A unit whose silhouette is consistent from all 8 angles should have an aspect that varies within a
// small band across facings, and no facing that is a large outlier. The checker below flags outliers.
//
// Run: node audit/phase3-silhouette.mjs [atlasDir]
//   node audit/phase3-silhouette.mjs public/atlas-pilot
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIR = join(ROOT, process.argv[2] ?? 'docs/proof/atlas-archive/pilot');
const TEAM = process.env.TEAM ?? 'blue';

const units = JSON.parse(readFileSync(join(DIR, 'units.json'), 'utf8'));

const pageCache = new Map();
async function page(file) {
  if (!pageCache.has(file)) {
    pageCache.set(file, await sharp(join(DIR, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  return pageCache.get(file);
}

/**
 * Opaque extents of one frame.
 *
 * Alpha threshold is low (>16) so the antialiased rim and any soft glow still count: a dim halo is
 * part of the silhouette a player reads, and excluding it would hide exactly the facings that read as
 * a thin slab.
 */
export async function measureFrame(manifest, key) {
  const r = manifest.frames[key];
  if (!r) return null;
  const { data, info } = await page(manifest.pages[r.page].file);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let area = 0;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const a = data[((r.y + y) * info.width + (r.x + x)) * 4 + 3];
      if (a > 16) {
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return { w, h, aspect: w / h, area, fill: area / (w * h), minX, minY };
}

const names = [...new Set(Object.keys(units.frames).map((k) => k.split('/')[1]))].sort();
const report = { atlas: process.argv[2] ?? 'docs/proof/atlas-archive/pilot', team: TEAM, units: [], violations: [] };

for (const name of names) {
  const rows = [];
  for (let f = 0; f < 8; f++) {
    const m = await measureFrame(units, `unit/${name}/${TEAM}/${f}`);
    if (m) rows.push({ facing: f, ...m });
  }
  if (!rows.length) continue;
  const aspects = rows.map((r) => r.aspect);
  const mean = aspects.reduce((a, b) => a + b, 0) / aspects.length;
  const min = Math.min(...aspects);
  const max = Math.max(...aspects);
  const spread = max / min;
  // A silhouette that keeps its identity should hold its proportion across rotations. 1.85x is the
  // line: past it, a side view is visibly a different shape (the golem slab was ~2.8x).
  const violation = spread > 1.85;
  report.units.push({ name, meanAspect: +mean.toFixed(2), spread: +spread.toFixed(2), rows: rows.map((r) => ({ f: r.facing, w: r.w, h: r.h, aspect: +r.aspect.toFixed(2) })) });
  if (violation) report.violations.push({ name, spread: +spread.toFixed(2), aspects: aspects.map((a) => +a.toFixed(2)) });
  console.log(`${name.padEnd(16)} aspect mean ${mean.toFixed(2)}  spread ${spread.toFixed(2)}x  ${violation ? '<-- INCONSISTENT' : 'ok'}`);
  console.log('   ' + rows.map((r) => `f${r.facing}:${r.w}x${r.h}`).join('  '));
}

console.log(`\n${report.violations.length} of ${report.units.length} units have an inconsistent silhouette across facings`);
if (process.env.WRITE_JSON) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.WRITE_JSON, JSON.stringify(report, null, 2));
}
