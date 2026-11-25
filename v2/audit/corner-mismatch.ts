// WHERE is the map asymmetric, under the reflection that maps corner 0 onto corner 1?
import { loadRegistry } from '../src/data/loader';
import { TILE } from '../src/core/constants';
const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
const W = map.tileW, H = map.tileH;
const at = (x: number, y: number) => map.tiles[y * W + x]!;
const height = (x: number, y: number) => map.heights[y * W + x]!;
const starts = map.startLocations.map((s) => ({ tx: Math.floor(s.x / TILE), ty: Math.floor(s.y / TILE) }));

// corner0 (14,14) -> corner1 (113,14) is x -> W-1-x
const mirX = (x: number) => W - 1 - x;
const bad: { x: number; y: number; a: number; b: number }[] = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const a = at(x, y), b = at(mirX(x), y);
  if ((a === 1) !== (b === 1) || (a === 2) !== (b === 2) || height(x, y) !== height(mirX(x), y)) bad.push({ x, y, a, b });
}
console.log(`tiles differing from their x-mirror: ${bad.length}/${W * H}`);
const near = (t: { x: number; y: number }, s: { tx: number; ty: number }, r: number) => Math.hypot(t.x - s.tx, t.y - s.ty) <= r;
for (const [i, s] of starts.entries()) {
  const n = bad.filter((t) => near(t, s, 30)).length;
  console.log(`  within 30 tiles of start ${i} (${s.tx},${s.ty}): ${n}`);
}
// What are the mismatches, categorised?
const cat = new Map<string, number>();
for (const b of bad) { const k = `${b.a}->${b.b}`; cat.set(k, (cat.get(k) ?? 0) + 1); }
console.log('tile code transitions:', [...cat.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
console.log('first 20 mismatches:', bad.slice(0, 20).map((b) => `(${b.x},${b.y}) ${b.a}->${b.b}`).join(' '));

// NODE symmetry under the same reflection
const nodes = map.manaNodes;
const nodeKey = new Set(nodes.map((n) => `${Math.round(n.x / 8)},${Math.round(n.y / 8)}`));
let unpaired = 0;
for (const n of nodes) {
  const mx = (W - 1) * TILE - n.x;
  if (!nodeKey.has(`${Math.round(mx / 8)},${Math.round(n.y / 8)}`)) unpaired++;
}
console.log(`nodes without an x-mirror partner: ${unpaired}/${nodes.length}`);
for (const [i, s] of starts.entries()) {
  const list = nodes.map((n) => ({ n, d: Math.hypot(n.x - s.tx * TILE, n.y - s.ty * TILE) })).sort((a, b) => a.d - b.d).slice(0, 3);
  console.log(`  start ${i} three nearest: ${list.map((x) => `(${(x.n.x / TILE).toFixed(0)},${(x.n.y / TILE).toFixed(0)}) d=${(x.d / TILE).toFixed(0)}t amt=${x.n.amount}`).join(' | ')}`);
}
