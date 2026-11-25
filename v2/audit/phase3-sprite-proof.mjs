// REGENERATE THE PHASE-3 SPRITE PROOFS — every entity in the atlas, sliced from the manifest.
//
// This replaces the broken crop step that produced five byte-identical images (arcane_gate,
// obsidian_bastion, stone_wall, thorn_grove, waystone_camp). That tool scrolled the gallery page and
// then captured `clip: {x:0,y:0,...}`, which Playwright resolves in document coordinates: the clip
// never followed the scroll, so every capture grabbed the same top-left region of the page.
//
// Here each proof is cut directly out of the atlas page using the frame rect for that entity's own
// atlas key, then captioned with that key. There is no scrolling and no viewport involved, so a proof
// cannot show a region other than the one its name claims.
//
// Run: node audit/phase3-sprite-proof.mjs [atlasDir] [outDir]
//   defaults: public/atlas-pilot -> docs/proof/phase-3-pilot/sprites
//             public/atlas       -> docs/proof/phase-3/sprites
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ATLAS = join(ROOT, process.argv[2] ?? 'public/atlas-pilot');
const OUT = join(ROOT, process.argv[3] ?? 'docs/proof/phase-3-pilot/sprites');
const TEAMS = ['blue', 'red', 'green', 'gold'];
const FACINGS = 8;

mkdirSync(OUT, { recursive: true });

const md5 = (b) => createHash('md5').update(b).digest('hex');
const load = (f) => JSON.parse(readFileSync(join(ATLAS, f), 'utf8'));
const units = load('units.json');
const buildings = load('buildings.json');

const pages = new Map();
async function pageRaw(file) {
  if (!pages.has(file)) {
    pages.set(file, await sharp(join(ATLAS, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  return pages.get(file);
}

async function readFrame(manifest, key) {
  const f = manifest.frames[key];
  if (!f) throw new Error(`no frame ${key}`);
  if (!(f.w > 0) || !(f.h > 0)) throw new Error(`frame ${key} has invalid size ${f.w}x${f.h}`);
  const { data, info } = await pageRaw(manifest.pages[f.page].file);
  const out = Buffer.alloc(f.w * f.h * 4);
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const si = ((f.y + y) * info.width + (f.x + x)) * 4;
      const di = (y * f.w + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { buf: out, w: f.w, h: f.h };
}

function entitiesOf(manifest) {
  return [...new Set(Object.keys(manifest.frames).map((k) => k.split('/')[1]))].sort();
}

const index = { generated: new Date().toISOString(), atlas: process.argv[2] ?? 'public/atlas-pilot', images: [], skipped: [] };

async function buildSheet(manifest, name, kind) {
  // Units carry 8 facings; buildings are static and bake a single facing.
  const facings = kind === 'unit' ? FACINGS : 1;
  const cells = [];
  for (const team of TEAMS) {
    for (let f = 0; f < facings; f++) {
      const key = kind === 'unit' ? `unit/${name}/${team}/${f}` : `building/${name}/${team}/0`;
      if (!manifest.frames[key]) {
        index.skipped.push({ name, key, reason: 'not in atlas' });
        continue;
      }
      cells.push({ img: await readFrame(manifest, key), key, team, facing: f });
    }
  }
  if (!cells.length) return;

  const cw = cells[0].img.w;
  const chh = cells[0].img.h;
  const gridW = cw * facings;
  const gridH = chh * TEAMS.length;
  const raw = Buffer.alloc(gridW * gridH * 4);
  for (const c of cells) {
    const row = TEAMS.indexOf(c.team);
    const col = c.facing;
    for (let y = 0; y < chh; y++) {
      for (let x = 0; x < cw; x++) {
        const si = (y * cw + x) * 4;
        const di = ((row * chh + y) * gridW + col * cw + x) * 4;
        raw[di] = c.img.buf[si];
        raw[di + 1] = c.img.buf[si + 1];
        raw[di + 2] = c.img.buf[si + 2];
        raw[di + 3] = c.img.buf[si + 3];
      }
    }
  }

  const svg = Buffer.from(
    `<svg width="${gridW}" height="40" xmlns="http://www.w3.org/2000/svg">
       <rect width="100%" height="100%" fill="#15131c"/>
       <text x="8" y="17" font-family="monospace" font-size="13" fill="#e8e4f2">${name} - ${facings} facing${facings > 1 ? 's' : ''} x 4 team colours</text>
       <text x="8" y="32" font-family="monospace" font-size="10" fill="#8f88a8">atlas key: ${cells[0].key}</text>
     </svg>`,
  );

  const file = join(OUT, `${name}.png`);
  await sharp({ create: { width: gridW, height: gridH + 40, channels: 4, background: { r: 21, g: 19, b: 28, alpha: 1 } } })
    .composite([
      { input: svg, top: 0, left: 0 },
      { input: raw, raw: { width: gridW, height: gridH, channels: 4 }, top: 40, left: 0 },
    ])
    .png()
    .toFile(file);
  index.images.push({
    file,
    name,
    atlasKey: cells[0].key,
    atlas: index.atlas,
    md5: md5(readFileSync(file)),
    bytes: readFileSync(file).length,
  });
}

for (const n of entitiesOf(units)) await buildSheet(units, n, 'unit');
for (const n of entitiesOf(buildings)) await buildSheet(buildings, n, 'building');

writeFileSync(join(OUT, '..', existsSync(join(OUT, '..')) ? 'sprite-index.json' : 'sprite-index.json'), JSON.stringify(index, null, 2));
console.log(`wrote ${index.images.length} sprite proofs to ${OUT}`);
if (index.skipped.length) console.log(`skipped ${index.skipped.length} frames`);
