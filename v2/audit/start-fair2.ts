// startLocations are in TILES. Re-probe terrain around each start in tile space.
import { loadRegistry } from '../src/data/loader';
const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
const W = map.tileW, H = map.tileH;
const at = (x: number, y: number) => map.tiles[y * W + x]!;
for (const [i, s] of map.startLocations.entries()) {
  let ramps = 0, blocked = 0, walk = 0;
  const R = 20;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = s.x + dx, y = s.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const t = at(x, y);
    if (t === 1) blocked++; else if (t === 2) ramps++; else walk++;
  }
  // ramp distance profile
  const rampD: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === 2) rampD.push(Math.hypot(x - s.x, y - s.y));
  rampD.sort((a, b) => a - b);
  console.log(`start ${i} (${s.x},${s.y}): walk ${walk} ramps ${ramps} blocked ${blocked} | nearest ramps ${rampD.slice(0, 4).map((d) => d.toFixed(0)).join(',')}`);
}
// Node distances in TILE space.
for (const [i, s] of map.startLocations.entries()) {
  const near = map.manaNodes.map((n) => ({ n, d: Math.hypot(n.x - s.x, n.y - s.y) })).sort((a, b) => a.d - b.d).slice(0, 5);
  console.log(`start ${i}: ${near.map((x) => `${x.d.toFixed(0)}t:${x.n.amount}`).join(' ')}`);
}
