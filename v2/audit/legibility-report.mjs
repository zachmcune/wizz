// Numeric before/after for the legibility report: worst IoU pair, count over threshold, and mass/aspect per building.
import sharp from 'sharp';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const ROOT = process.argv[2];
const OUT = process.argv[3];
const man = JSON.parse(readFileSync(`${ROOT}/public/atlas-final/buildings.json`, 'utf8'));
const ids = readdirSync(`${ROOT}/data/buildings`)
  .map((f) => JSON.parse(readFileSync(`${ROOT}/data/buildings/${f}`, 'utf8')).id)
  .sort();
const cache = new Map();
async function mask(id) {
  if (cache.has(id)) return cache.get(id);
  const f = man.frames[`building/${id}/blue/0`];
  const { data, info } = await sharp(`${ROOT}/public/atlas-final/${man.pages[f.page].file}`)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bits = new Uint8Array(f.w * f.h);
  let L = f.w, R = -1, T = f.h, B = -1, pixels = 0;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const i = ((f.y + y) * info.width + (f.x + x)) * info.channels;
    if (data[i + 3] > 160) { bits[y * f.w + x] = 1; pixels++; if (x < L) L = x; if (x > R) R = x; if (y < T) T = y; if (y > B) B = y; }
  }
  // Upper-half crop: the identity band (see tests/building-legibility.test.ts for why).
  const cut = B - Math.round((B - T + 1) * 0.5);
  const m = { w: f.w, h: f.h, bits, L, R, T, B: cut, pixels };
  cache.set(id, m);
  return m;
}
function iou(a, b) {
  const aw = a.R - a.L + 1, ah = a.B - a.T + 1, bw = b.R - b.L + 1, bh = b.B - b.T + 1;
  const W = 96, H = 96, span = Math.max(aw, ah, bw, bh, 1), s = (W - 2) / span;
  const ras = (m, mw, mh) => {
    const o = new Uint8Array(W * H);
    const dw = Math.max(1, Math.round(mw * s)), dh = Math.max(1, Math.round(mh * s));
    const ox = Math.round((W - dw) / 2), oy = Math.round((H - dh) / 2);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const sx = m.L + Math.min(mw - 1, Math.round((x / dw) * mw));
      const sy = m.T + Math.min(mh - 1, Math.round((y / dh) * mh));
      const gx = ox + x, gy = oy + y;
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      o[gy * W + gx] = m.bits[sy * m.w + sx];
    }
    return o;
  };
  const ra = ras(a, aw, ah), rb = ras(b, bw, bh);
  let i = 0, u = 0;
  for (let k = 0; k < ra.length; k++) { if (ra[k] && rb[k]) i++; if (ra[k] || rb[k]) u++; }
  return u ? i / u : 1;
}
const pairs = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  pairs.push({ a: ids[i], b: ids[j], v: iou(await mask(ids[i]), await mask(ids[j])) });
}
pairs.sort((x, y) => y.v - x.v);
const over = pairs.filter((p) => p.v > 0.72);
writeFileSync(OUT, JSON.stringify({ worst: pairs[0], overThreshold: over.length, pairs: pairs.slice(0, 12) }, null, 2));
console.log(`${ROOT}: worst ${pairs[0].v.toFixed(3)} (${pairs[0].a} ~ ${pairs[0].b}); pairs over 0.72: ${over.length} of ${pairs.length}`);
