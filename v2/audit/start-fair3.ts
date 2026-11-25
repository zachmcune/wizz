// startLocations are in WORLD units; tiles are 32 world units.
import { loadRegistry } from '../src/data/loader';
import { TILE } from '../src/core/constants';
const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
const W = map.tileW, H = map.tileH;
const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : map.tiles[y * W + x]!);
console.log(`map ${W}x${H} tiles, TILE=${TILE}`);
const starts = map.startLocations.map((s) => ({ tx: Math.floor(s.x / TILE), ty: Math.floor(s.y / TILE), wx: s.x, wy: s.y }));
for (const [i, s] of starts.entries()) {
  let ramps = 0, blocked = 0, walk = 0;
  const R = 20;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const t = at(s.tx + dx, s.ty + dy);
    if (t === 1) blocked++; else if (t === 2) ramps++; else if (t === 0) walk++;
  }
  console.log(`start ${i} tile(${s.tx},${s.ty}) walk ${walk} ramps ${ramps} blocked ${blocked}`);
}
// Node distances in world units, same as before (nodes are world units too).
for (const [i, s] of starts.entries()) {
  const near = map.manaNodes.map((n) => ({ n, d: Math.hypot(n.x - s.wx, n.y - s.wy) })).sort((a, b) => a.d - b.d).slice(0, 4);
  console.log(`start ${i}: nearest nodes ${near.map((x) => `${Math.round(x.d)}wu:${x.n.amount}`).join(' ')}`);
}
