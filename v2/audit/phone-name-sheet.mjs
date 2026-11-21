// PHONE-SIZE "NAME THE BUILDING" SHEET — silhouettes only, at the scale they appear on a 667x375 screen.
//
// A 667px-wide phone shows roughly 25 tiles across, so one 32-unit tile is ~0.82 screen px and a 2x2 building is
// ~52 screen px wide. This renders each silhouette at exactly that size, which is the only honest test of "can you
// tell what it is at a glance".
import sharp from 'sharp';
import { readFileSync, readdirSync } from 'node:fs';
const ROOT = process.argv[2] ?? '.';
const OUT = process.argv[3] ?? 'docs/proof/phase-5/art/buildings-phone-silhouettes.png';
// At zoom 1 on a 667px viewport the game shows ~25 tiles -> 0.82 px per world unit, so a 2x2 (64wu) building is
// ~52px wide and a 3x3 is ~79px. The sheet reproduces those drawn sizes exactly.
const PX_PER_WU = 0.82;
const man = JSON.parse(readFileSync(`${ROOT}/public/atlas-final/buildings.json`, 'utf8'));
const defs = new Map();
for (const f of readdirSync(`${ROOT}/data/buildings`)) {
  const j = JSON.parse(readFileSync(`${ROOT}/data/buildings/${f}`, 'utf8'));
  defs.set(j.id, j);
}
const ids = [...defs.keys()].sort();
const CELL = 120;
const LABEL = 20;
const COLS = 6;
const rows = Math.ceil(ids.length / COLS);
const W = COLS * CELL;
const H = rows * (CELL + LABEL) + 46;
const comps = [];
const head = Buffer.from(
  `<svg width="${W}" height="46" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0b0a0f"/>
    <text x="12" y="19" font-family="monospace" font-size="13" fill="#f4efe4">NAME THE BUILDING — phone scale, silhouettes only</text>
    <text x="12" y="36" font-family="monospace" font-size="10" fill="#8f8a80">drawn at the real size on a 667x375 screen (0.82 px per world unit); filled shape = what the player resolves</text>
  </svg>`,
);
comps.push({ input: head, top: 0, left: 0 });

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const def = defs.get(id);
  const f = man.frames[`building/${id}/blue/0`];
  if (!f) continue;
  const { data, info } = await sharp(`${ROOT}/public/atlas-final/${man.pages[f.page].file}`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Opaque -> flat near-white, everything else transparent (pure silhouette).
  const buf = Buffer.alloc(f.w * f.h * 4);
  let left = f.w;
  let right = -1;
  let top = f.h;
  let bottom = -1;
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const si = ((f.y + y) * info.width + (f.x + x)) * info.channels;
      const di = (y * f.w + x) * 4;
      if (data[si + 3] > 160) {
        buf[di] = 236;
        buf[di + 1] = 234;
        buf[di + 2] = 228;
        buf[di + 3] = 255;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) continue;
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  // The atlas was authored so one projected pixel is one world unit at scale 0.7071, so a 32-unit tile is 32 atlas px.
  // Shrink to phone size by the ratio of on-screen px per world unit to atlas px per world unit.
  const atlasPxPerWu = 32 / 32; // 32 atlas px span one 32-unit tile
  const targetW = Math.max(10, Math.round((cropW / atlasPxPerWu) * PX_PER_WU));
  const crop = sharp(buf, { raw: { width: f.w, height: f.h, channels: 4 } }).extract({
    left,
    top,
    width: cropW,
    height: cropH,
  });
  const cell = await sharp(await crop.png().toBuffer())
    .resize(targetW, null, { kernel: 'nearest' })
    .png()
    .toBuffer();
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const meta = await sharp(cell).metadata();
  // Centre the tiny sprite in its cell so the eye compares SHAPES, not positions.
  const offX = col * CELL + Math.round((CELL - (meta.width ?? targetW)) / 2);
  const offY = 46 + row * (CELL + LABEL) + Math.round((CELL - (meta.height ?? 20)) / 2);
  comps.push({ input: cell, top: offY, left: offX });
  const lbl = Buffer.from(
    `<svg width="${CELL}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><text x="6" y="14" font-family="monospace" font-size="9" fill="#ded7c7">${i + 1}. ${id}</text></svg>`,
  );
  comps.push({ input: lbl, top: 46 + row * (CELL + LABEL) + CELL - 6, left: col * CELL });
}
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 11, g: 10, b: 15, alpha: 1 } } })
  .composite(comps)
  .png()
  .toFile(OUT);
console.log('wrote', OUT, `${W}x${H}`, '|', ids.length, 'buildings');
