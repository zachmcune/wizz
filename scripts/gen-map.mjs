// Generates data/maps/duel_glade.json: an open arena with a blocked border, a few rock
// clusters, 4 start locations, and mana nodes. Editable afterwards like any data file.
import { writeFileSync, mkdirSync } from 'node:fs';

const TILE = 32;
const W = 64;
const H = 44;
const tiles = new Array(W * H).fill(0);
const set = (tx, ty, v) => {
  if (tx >= 0 && ty >= 0 && tx < W && ty < H) tiles[ty * W + tx] = v;
};

// blocked border
for (let x = 0; x < W; x++) {
  set(x, 0, 1);
  set(x, H - 1, 1);
}
for (let y = 0; y < H; y++) {
  set(0, y, 1);
  set(W - 1, y, 1);
}

// a few rock clusters (kept away from starts and lanes)
const rocks = [
  [20, 14],
  [44, 14],
  [20, 30],
  [44, 30],
  [32, 22],
];
for (const [rx, ry] of rocks) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(rx + dx, ry + dy, 1);
}

const w = (tx) => tx * TILE + TILE / 2;
const startTiles = [
  [7, 7],
  [W - 8, 7],
  [7, H - 8],
  [W - 8, H - 8],
];
const startLocations = startTiles.map(([tx, ty]) => ({ x: w(tx), y: w(ty) }));

const nodeTiles = [
  [12, 12],
  [W - 13, 12],
  [12, H - 13],
  [W - 13, H - 13],
  [32, 10],
  [32, H - 11],
];
const manaNodes = nodeTiles.map(([tx, ty]) => ({ x: w(tx), y: w(ty), amount: 20000 }));

const map = {
  id: 'duel_glade',
  name: 'Duel Glade',
  maxPlayers: 4,
  tileW: W,
  tileH: H,
  tiles,
  startLocations,
  manaNodes,
};

mkdirSync('data/maps', { recursive: true });
writeFileSync('data/maps/duel_glade.json', JSON.stringify(map));
console.log('wrote data/maps/duel_glade.json', W, 'x', H);
