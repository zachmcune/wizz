// IS EACH START POSITION EQUIVALENT? Compare what the four corners are actually given.
import { loadRegistry } from '../src/data/loader';
const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
const W = map.tileW, H = map.tileH;
const T = 32;
console.log('nodes:', map.manaNodes.length);
for (const [i, s] of map.startLocations.entries()) {
  const near = map.manaNodes
    .map((n) => ({ n, d: Math.hypot(n.x * T - s.x * T, n.y * T - s.y * T) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  const total = near.reduce((a, x) => a + x.n.amount, 0);
  console.log(`start ${i} (${s.x},${s.y}): nearest nodes ${near.map((x) => `${Math.round(x.d / T)}t:${x.n.amount}`).join(' ')}  sum=${total}`);
}
// Global node amount symmetry under x-reflection and y-reflection.
let mismatchX = 0, mismatchY = 0, sumN = 0;
const key = (x: number, y: number) => `${x},${y}`;
const amounts = new Map<string, number>();
for (const n of map.manaNodes) { amounts.set(key(n.x, n.y), n.amount); sumN += n.amount; }
const nodes = new Set(map.manaNodes.map((n) => key(n.x, n.y)));
for (const n of map.manaNodes) {
  if (!nodes.has(key(W - 1 - n.x, n.y))) mismatchX++;
  if (!nodes.has(key(n.x, H - 1 - n.y))) mismatchY++;
}
console.log(`total authored node mana ${sumN}`);
console.log(`nodes without an x-mirror partner: ${mismatchX}/${map.manaNodes.length}`);
console.log(`nodes without a y-mirror partner: ${mismatchY}/${map.manaNodes.length}`);

// Ramp asymmetry near each base (ramps are the elevation gates).
for (const [i, s] of map.startLocations.entries()) {
  let ramps = 0, blocked = 0, walk = 0;
  for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
    const x = s.x + dx, y = s.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const t = map.tiles[y * W + x]!;
    if (t === 1) blocked++; else if (t === 2) ramps++; else walk++;
  }
  console.log(`start ${i}: within 14 tiles -> walkable ${walk}, ramps ${ramps}, blocked ${blocked}`);
}
