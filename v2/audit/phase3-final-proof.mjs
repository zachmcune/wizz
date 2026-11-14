// PHASE 3 PILOT PROOF — every image written here is rendered from ATLAS BYTES, never a screen crop.
//
// Why this replaced the old approach: `phase3-proof.mjs` produced per-entity "close-ups" by scrolling
// the gallery page and then calling `page.screenshot({ clip: { x: 0, y: 0, ... } })`. Playwright
// interprets `clip` in DOCUMENT coordinates, so the clip never moved with the scroll: every capture
// grabbed the same top-left region of the page. Five proofs (arcane_gate, obsidian_bastion,
// stone_wall, thorn_grove, waystone_camp) came out byte-identical because of it, which is exactly the
// failure that got reported. Cropping a page is inherently unverifiable; slicing the atlas is not.
//
// Each proof image is therefore:
//   * built by reading the frame rect for THE named entity out of the atlas manifest,
//   * composited onto a caption strip that names the entity and its atlas key,
//   * recorded in proof-index.json with its md5 and the atlas key used,
// so `tests/pilot-proof.test.ts` can assert uniqueness AND correct provenance without a browser.
//
// Run: node audit/phase3-pilot-proof.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs/proof/phase-3-final');
const SPRITES = join(OUT, 'sprites');
const ATLAS_NEW = join(ROOT, 'public/atlas-final');
const ATLAS_OLD = join(ROOT, 'public/atlas');

mkdirSync(SPRITES, { recursive: true });

/**
 * THE FULL ROSTER, derived from the data files rather than hard-coded.
 *
 * Deriving it means a new unit or building automatically gets a proof sheet, and a missing one shows
 * up as a count mismatch instead of silently going unproven.
 */
const UNIT_IDS = readdirSync(join(ROOT, 'data/units')).map((f) => f.replace(/\.json$/, '')).sort();
const BUILDING_IDS = readdirSync(join(ROOT, 'data/buildings')).map((f) => f.replace(/\.json$/, '')).sort();
// `mana_node` is a map resource rather than a building definition, but it is drawn as a structure and
// appears in the atlas, so it is proven alongside them.
const ALL_BUILDING_IDS = [...BUILDING_IDS, 'mana_node'].sort();

const ASSETS = [
  ...UNIT_IDS.map((name) => ({ name, kind: 'unit', label: name })),
  ...ALL_BUILDING_IDS.map((name) => ({ name, kind: 'building', label: name })),
];

const TEAMS = ['blue', 'red', 'green', 'gold'];

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

function loadManifest(dir) {
  const units = JSON.parse(readFileSync(join(dir, 'units.json'), 'utf8'));
  const buildings = JSON.parse(readFileSync(join(dir, 'buildings.json'), 'utf8'));
  return { units, buildings };
}

/** Read one frame out of a WebP page and return a raw RGBA buffer of exactly frame.w x frame.h. */
async function readFrame(dir, manifest, key) {
  const f = manifest.frames[key];
  if (!f) throw new Error(`manifest has no frame "${key}"`);
  if (!(f.w > 0) || !(f.h > 0)) throw new Error(`frame "${key}" has invalid size ${f.w}x${f.h}`);
  const page = manifest.pages[f.page];
  const { data, info } = await sharp(join(dir, page.file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
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

// ---------------------------------------------------------------- per-asset 8 facings x 4 teams
const index = { generated: new Date().toISOString(), images: [], skipped: [] };
{
  const a = loadManifest(ATLAS_NEW);
  for (const asset of ASSETS) {
    const manifest = asset.kind === 'unit' ? a.units : a.buildings;
    // Units have 8 facings; buildings bake only facing 0 (a static structure does not rotate).
    const facings = asset.kind === 'unit' ? 8 : 1;
    const cells = [];
    for (const team of TEAMS) {
      for (let f = 0; f < facings; f++) {
        const key =
          asset.kind === 'unit' ? `unit/${asset.name}/${team}/${f}` : `building/${asset.name}/${team}/0`;
        if (!manifest.frames[key]) {
          index.skipped.push({ name: asset.name, key, reason: 'not in atlas' });
          continue;
        }
        const img = await readFrame(ATLAS_NEW, manifest, key);
        cells.push({ img, key, team, facing: f });
      }
    }
    if (cells.length === 0) continue;

    // Lay the grid out explicitly: one column per facing, one row per team.
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
         <text x="8" y="17" font-family="monospace" font-size="13" fill="#e8e4f2">${asset.label} - ${facings} facing${facings > 1 ? 's' : ''} x 4 team colours</text>
         <text x="8" y="32" font-family="monospace" font-size="10" fill="#8f88a8">atlas keys: ${cells[0].key} .. ${cells[cells.length - 1].key}</text>
       </svg>`,
    );

    const out = join(SPRITES, `${asset.name}.png`);
    await sharp({
      create: { width: gridW, height: gridH + 40, channels: 4, background: { r: 21, g: 19, b: 28, alpha: 1 } },
    })
      .composite([
        { input: svg, top: 0, left: 0 },
        { input: raw, raw: { width: gridW, height: gridH, channels: 4 }, top: 40, left: 0 },
      ])
      .png()
      .toFile(out);
    index.images.push({
      file: out,
      name: asset.name,
      atlasKey: cells[0].key,
      atlas: 'atlas-final',
      md5: md5(readFileSync(out)),
      bytes: readFileSync(out).length,
    });
  }
  writeFileSync(join(OUT, 'proof-index.json'), JSON.stringify(index, null, 2));
  console.log(`wrote ${index.images.length} proof images to ${OUT}`);
  for (const s of index.skipped) console.log(`  skipped ${s.name}: ${s.reason}`);
}
