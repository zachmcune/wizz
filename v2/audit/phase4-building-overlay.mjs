// FOOTPRINT OVERLAY PROOF — every building drawn on its own tile diamond.
//
// Zachary asked for "an overlay image of every building drawn on its footprint diamond", so that the
// alignment can be checked by eye as well as by the automated corner test.
//
// How the overlay is built: the building's atlas frame is placed with the SAME transform the renderer
// uses (pivot from the manifest, scale 1), and the footprint diamond is drawn from the SAME projection
// the terrain uses. If a building sits flat and fills its footprint, its base corners lie on the
// diamond's corners. A magenta diamond is drawn around a cyan footprint outline so a few pixels of error
// is visible rather than hidden under the art.
//
// Run: node audit/phase4-building-overlay.mjs
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs/proof/phase-4-polish');
const ATLAS = join(ROOT, 'public/atlas-final');
const TILE = 32;
/** Projection constants, mirroring `src/core/projection.ts`. */
const SX = 0.5;
const SY = 0.25;

mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(join(ATLAS, 'buildings.json'), 'utf8'));

const defs = new Map();
for (const f of readdirSync(join(ROOT, 'data/buildings'))) {
  const j = JSON.parse(readFileSync(join(ROOT, 'data/buildings', f), 'utf8'));
  defs.set(j.id, j);
}

/** Ground projection of a world point, identical to `projectGround`. */
const project = (x, y) => ({ x: (x - y) * SX, y: (x + y) * SY });

const rows = [];

for (const id of [...defs.keys()].sort()) {
  const def = defs.get(id);
  const key = `building/${id}/blue/0`;
  const frame = manifest.frames[key];
  if (!frame) {
    console.warn(`skip ${id}: no frame`);
    continue;
  }
  const page = manifest.pages[frame.page];
  const { data, info } = await sharp(join(ATLAS, page.file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Extract the frame.
  const fw = frame.w;
  const fh = frame.h;
  const raw = Buffer.alloc(fw * fh * 4);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const si = ((frame.y + y) * info.width + (frame.x + x)) * 4;
      const di = (y * fw + x) * 4;
      raw[di] = data[si];
      raw[di + 1] = data[si + 1];
      raw[di + 2] = data[si + 2];
      raw[di + 3] = data[si + 3];
    }
  }

  // Canvas: the frame plus generous margin, so the footprint can extend past it if it is wrong.
  const pad = Math.ceil(def.footprint * TILE * 0.9);
  const W = fw + pad * 2;
  const H = fh + pad * 2;
  // Where the sprite's ground origin (pivot) lands on the canvas.
  const ox = pad + frame.pivotX * fw;
  const oy = pad + frame.pivotY * fh;

  // Footprint diamond corners in canvas space.
  const half = (def.footprint * TILE) / 2;
  const corners = [
    project(-half, -half),
    project(half, -half),
    project(half, half),
    project(-half, half),
  ].map((p) => ({ x: ox + p.x, y: oy + p.y }));

  const poly = corners.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const cx = corners.reduce((a, c) => a + c.x, 0) / 4;
  const cy = corners.reduce((a, c) => a + c.y, 0) / 4;

  // Faint fill + strong outline, drawn UNDER the sprite, plus tick marks at each corner drawn OVER it.
  const underlay = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
       <rect width="100%" height="100%" fill="#101318"/>
       <polygon points="${poly}" fill="#2ec6ff" fill-opacity="0.13"
                stroke="#2ec6ff" stroke-width="1.5" stroke-opacity="0.95"/>
       <line x1="${corners[0].x}" y1="${corners[0].y}" x2="${corners[2].x}" y2="${corners[2].y}" stroke="#2ec6ff" stroke-width="0.6" stroke-opacity="0.35"/>
       <line x1="${corners[1].x}" y1="${corners[1].y}" x2="${corners[3].x}" y2="${corners[3].y}" stroke="#2ec6ff" stroke-width="0.6" stroke-opacity="0.35"/>
     </svg>`,
  );
  const marks = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
       ${corners
         .map(
           (c) =>
             `<circle cx="${c.x}" cy="${c.y}" r="2.2" fill="none" stroke="#ff4fd8" stroke-width="1.3"/>`,
         )
         .join('')}
       <circle cx="${cx}" cy="${cy}" r="1.6" fill="#ff4fd8" fill-opacity="0.85"/>
     </svg>`,
  );

  const composed = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 16, g: 19, b: 24, alpha: 1 } },
  })
    .composite([
      { input: underlay, top: 0, left: 0 },
      { input: raw, raw: { width: fw, height: fh, channels: 4 }, top: pad, left: pad },
      { input: marks, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  rows.push({ name: `${def.name} (${def.footprint}×${def.footprint})`, png: composed, foot: def.footprint });
  console.log(`overlay ${id}: frame ${fw}x${fh}, footprint ${def.footprint * TILE}px diamond`);
}

// ---- assemble a contact sheet, 4 per row, each cell captioned.
const CELL = 260;
const LABEL = 26;
const COLS = 4;
const rowsCount = Math.ceil(rows.length / COLS);
const sheetW = COLS * CELL;
const sheetH = rowsCount * (CELL + LABEL) + 44;

const comps = [];
const header = Buffer.from(
  `<svg width="${sheetW}" height="44" xmlns="http://www.w3.org/2000/svg">
     <rect width="100%" height="100%" fill="#15131c"/>
     <text x="10" y="19" font-family="monospace" font-size="14" fill="#f4efe4">BUILDINGS ON THEIR FOOTPRINT DIAMONDS</text>
     <text x="10" y="35" font-family="monospace" font-size="10" fill="#a9a294">cyan = footprint tiles &#160;|&#160; magenta rings = projected footprint corners &#160;|&#160; magenta dot = footprint centre</text>
   </svg>`,
);
comps.push({ input: header, top: 0, left: 0 });

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = col * CELL;
  const y = 44 + row * (CELL + LABEL);
  const fitted = await sharp(r.png)
    .resize(CELL - 8, CELL - 8, { fit: 'contain', background: { r: 16, g: 19, b: 24, alpha: 1 } })
    .png()
    .toBuffer();
  comps.push({ input: fitted, top: y, left: x + 4 });
  const label = Buffer.from(
    `<svg width="${CELL}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg">
       <text x="${x + 4}" y="17" font-family="monospace" font-size="11" fill="#ded7c7">${r.name}</text>
     </svg>`,
  );
  comps.push({ input: label, top: y + CELL - 8, left: 0 });
}

const sheet = await sharp({
  create: { width: sheetW, height: sheetH, channels: 4, background: { r: 21, g: 19, b: 28, alpha: 1 } },
})
  .composite(comps)
  .png()
  .toFile(join(OUT, 'buildings-on-footprints.png'));

console.log(`\nwrote buildings-on-footprints.png (${sheet.width}x${sheet.height})`);

// ---- also write one overlay per building, for close inspection.
const DIR = join(OUT, 'building-overlays');
mkdirSync(DIR, { recursive: true });
for (let i = 0; i < rows.length; i++) {
  const name = [...defs.keys()].sort()[i];
  writeFileSync(join(DIR, `${name}.png`), rows[i].png);
}
console.log(`wrote ${rows.length} individual overlays to building-overlays/`);
