// IoU at both crop heights, for the honest before/after report Zachary asked for.
import sharp from 'sharp';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const ROOT = process.argv[2];
const OUT = process.argv[3];
const man = JSON.parse(readFileSync(`${ROOT}/public/atlas-final/buildings.json`, 'utf8'));
const ids = readdirSync(`${ROOT}/data/buildings`).map((f) => JSON.parse(readFileSync(`${ROOT}/data/buildings/${f}`, 'utf8')).id).sort();
const cache = new Map();
async function mask(id) {
  if (cache.has(id)) return cache.get(id);
  const f = man.frames[`building/${id}/blue/0`];
  const { data, info } = await sharp(`${ROOT}/public/atlas-final/${man.pages[f.page].file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bits = new Uint8Array(f.w * f.h);
  let L = f.w, R = -1, T = f.h, B = -1;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const i = ((f.y + y) * info.width + (f.x + x)) * info.channels;
    if (data[i + 3] > 160) { bits[y * f.w + x] = 1; if (x < L) L = x; if (x > R) R = x; if (y < T) T = y; if (y > B) B = y; }
  }
  const m = { w: f.w, h: f.h, bits, L, R, T, B };
  cache.set(id, m);
  return m;
}
function iou(a, b, keep) {
  const keepMask = (m) => {
    const h = m.B - m.T + 1;
    const cut = m.B - Math.round(h * keep);
    const bits = new Uint8Array(m.bits.length);
    let L = m.w, R = -1, B = -1;
    for (let y = m.T; y <= cut; y++) for (let x = 0; x < m.w; x++) {
      if (!m.bits[y * m.w + x]) continue;
      bits[y * m.w + x] = 1;
      if (x < L) L = x; if (x > R) R = x; if (y > B) B = y;
    }
    return { ...m, bits, L, R, B: B < 0 ? m.T : B, T: m.T };
  };
  const A = keepMask(a), Bm = keepMask(b);
  const aw = A.R - A.L + 1, ah = A.B - A.T + 1, bw = Bm.R - Bm.L + 1, bh = Bm.B - Bm.T + 1;
  const W = 96, H = 96, span = Math.max(aw, ah, bw, bh, 1), s = (W - 2) / span;
  const ras = (m, mw, mh) => { const o = new Uint8Array(W * H); const dw = Math.max(1, Math.round(mw * s)), dh = Math.max(1, Math.round(mh * s)); const ox = Math.round((W - dw) / 2), oy = Math.round((H - dh) / 2);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const sx = m.L + Math.min(mw - 1, Math.round((x / dw) * mw)); const sy = m.T + Math.min(mh - 1, Math.round((y / dh) * mh)); const gx = ox + x, gy = oy + y; if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue; o[gy * W + gx] = m.bits[sy * m.w + sx]; } return o; };
  const ra = ras(A, aw, ah), rb = ras(Bm, bw, bh);
  let i = 0, u = 0;
  for (let k = 0; k < ra.length; k++) { if (ra[k] && rb[k]) i++; if (ra[k] || rb[k]) u++; }
  return u ? i / u : 1;
}
const out = {};
for (const keep of [0.5, 0.3]) {
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push({ a: ids[i], b: ids[j], v: iou(await mask(ids[i]), await mask(ids[j]), keep) });
  pairs.sort((x, y) => y.v - x.v);
  out[`crop${Math.round(keep * 100)}`] = { worst: pairs[0], overThreshold: pairs.filter((p) => p.v > 0.72).length, top: pairs.slice(0, 6) };
}
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ crop50: { worst: out.crop50.worst.v.toFixed(3), over: out.crop50.overThreshold }, crop30: { worst: out.crop30.worst.v.toFixed(3), over: out.crop30.overThreshold } }));
