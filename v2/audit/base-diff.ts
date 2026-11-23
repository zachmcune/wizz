// Precise 40x40 window diff: start 0's neighbourhood vs the x-mirror of start 1's.
import { loadRegistry } from '../src/data/loader';
import { TILE } from '../src/core/constants';
const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
const W = map.tileW, H = map.tileH;
const at = (x: number, y: number) => map.tiles[y * W + x]!;
const hg = (x: number, y: number) => map.heights[y * W + x]!;
const S = map.startLocations.map((p) => ({ tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE) }));
const R = 20;
function windowDiff(a: { tx: number; ty: number }, b: { tx: number; ty: number }, label: string) {
  let t = 0, h = 0;
  const first: string[] = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const ax = a.tx + dx, ay = a.ty + dy;
    const bx = W - 1 - (b.tx + dx), by = b.ty + dy; // reflect b's window
    if (ax < 0 || ay < 0 || ax >= W || ay >= H || bx < 0 || by < 0 || bx >= W || by >= H) continue;
    if (at(ax, ay) !== at(bx, by)) { t++; if (first.length < 10) first.push(`tile(${ax - a.tx},${ay - a.ty}) ${at(ax,ay)} vs ${at(bx,by)}`); }
    if (hg(ax, ay) !== hg(bx, by)) { h++; }
  }
  console.log(`${label}: tile mismatches ${t}, height mismatches ${h}`);
  if (first.length) console.log(`   e.g. ${first.join(' | ')}`);
}
windowDiff(S[0]!, S[1]!, 'start0 vs mirror(start1)  [north pair]');
windowDiff(S[2]!, S[3]!, 'start2 vs mirror(start3)  [south pair]');
windowDiff(S[0]!, S[2]!, 'WINDOW CHECK start0 vs start2 (no reflection, y-offset)');

// Print the base-entrance tile code grid for each start (rows = y-10..y+18)
for (const [i, s] of S.entries()) {
  console.log(`\nstart ${i} (${s.tx},${s.ty}) entrance grid [y from ${s.ty - 6} to ${s.ty + 18}, x from ${s.tx - 8} to ${s.tx + 8}]:`);
  for (let dy = -14; dy <= 18; dy++) {
    let row = '  ';
    for (let dx = -14; dx <= 14; dx++) {
      const x = s.tx + dx, y = s.ty + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) { row += '?'; continue; }
      const t = at(x, y);
      row += t === 1 ? '#' : t === 2 ? '/' : t === 0 ? '.' : String(t);
    }
    console.log(`${String(s.ty + dy).padStart(3)} ${row}`);
  }
}
