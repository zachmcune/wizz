import { loadRegistry } from '../src/data/loader';
const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
console.log('tileW', map.tileW, 'tileH', map.tileH, 'starts', JSON.stringify(map.startLocations));
const W = map.tileW, H = map.tileH;
const at = (x: number, y: number) => map.tiles[y * W + x]!;
const diff = (fx: (x: number, y: number) => [number, number], label: string) => {
  let blocked = 0, ramp = 0, total = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [a, b] = fx(x, y);
    if (a < 0 || b < 0 || a >= W || b >= H) continue;
    total++;
    const t = at(x, y), u = at(a, b);
    if ((t === 1) !== (u === 1)) blocked++;
    if ((t === 2) !== (u === 2)) ramp++;
  }
  console.log(`${label}: walkability mismatches ${blocked}/${total}, ramp mismatches ${ramp}/${total}`);
};
// Symmetries that would make a 1v1 fair.
diff((x, y) => [x, H - 1 - y], 'reflect horizontal axis (y -> H-1-y)');
diff((x, y) => [W - 1 - x, y], 'reflect vertical axis (x -> W-1-x)');
diff((x, y) => [W - 1 - x, H - 1 - y], 'rotate 180');
diff((x, y) => [y, x], 'reflect main diagonal (swap x,y)');
diff((x, y) => [H - 1 - y, W - 1 - x], 'reflect anti-diagonal');
// Which reflection maps corner0 onto corner1?
for (const [i, s] of map.startLocations.entries()) console.log(`start ${i}: (${s.x},${s.y})`);
