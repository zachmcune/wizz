// CORNER 1 BEATS CORNER 0 12/12. Find the terrain difference that explains it.
import { loadRegistry } from '../src/data/loader';
import { TILE } from '../src/core/constants';
const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
const W = map.tileW, H = map.tileH;
const at = (x: number, y: number) => map.tiles[y * W + x]!;
const hgt = (x: number, y: number) => map.heights[y * W + x]!;
const s = map.startLocations.map((p) => ({ tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE) }));

// Full walkability reachability from each start, using a BFS over walkable+ramp tiles.
function reach(startIdx: number): Set<number> {
  const start = s[startIdx]!;
  const seen = new Set<number>();
  const q: [number, number][] = [[start.tx, start.ty]];
  seen.add(start.ty * W + start.tx);
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (seen.has(k)) continue;
      const t = at(nx, ny);
      if (t === 1) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
const r = s.map((_, i) => reach(i));
console.log('reachable tiles:', r.map((x, i) => `${i}:${x.size}`).join(' '));
// Cross-reachability: can corner0's region reach corner1's tile?
for (let i = 0; i < s.length; i++) {
  for (let j = 0; j < s.length; j++) {
    if (i >= j) continue;
    const a = r[i]!, b = r[j]!;
    const shared = [...a].filter((k) => b.has(k)).length;
    console.log(`  region ${i} vs ${j}: shared ${shared} of ${a.size}/${b.size}`);
  }
}
// Height + ramp profile along the straight line between corner0 and corner1.
console.log('\nprofile along corner0 -> corner1 (y=14):');
let line = '';
for (let x = s[0]!.tx; x <= s[1]!.tx; x += 4) line += `${at(x, s[0]!.ty)}/${hgt(x, s[0]!.ty)} `;
console.log('  ' + line);
console.log('\nprofile along corner2 -> corner3 (y=73):');
let line2 = '';
for (let x = s[2]!.tx; x <= s[3]!.tx; x += 4) line2 += `${at(x, s[2]!.ty)}/${hgt(x, s[2]!.ty)} `;
console.log('  ' + line2);
// Ramps within 25 tiles of each start.
for (const [i, p] of s.entries()) {
  let ramps = 0;
  const list: string[] = [];
  for (let dy = -25; dy <= 25; dy++) for (let dx = -25; dx <= 25; dx++) {
    const x = p.tx + dx, y = p.ty + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (at(x, y) === 2) { ramps++; if (list.length < 8) list.push(`(${x},${y})h${hgt(x,y)}`); }
  }
  console.log(`start ${i} (${p.tx},${p.ty}): ${ramps} ramps within 25 tiles: ${list.join(' ')}`);
}
