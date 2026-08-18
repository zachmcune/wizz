// Generates data/maps/duel_glade.json: an open arena with a blocked border, a few rock
// clusters, 4 start locations, mana nodes, and one holdable plateau with two ramps.
import { writeFileSync, mkdirSync } from 'node:fs';

const TILE = 32;
const TILE_BLOCKED = 1;
const TILE_RAMP = 2;
const W = 128;
const H = 88;
const BASE_POOL = 25000;
const SMALL_POOL = 3000;
const tiles = new Array(W * H).fill(0);
const heights = new Array(W * H).fill(0);
const set = (tx, ty, v) => {
  if (tx >= 0 && ty >= 0 && tx < W && ty < H) tiles[ty * W + tx] = v;
};
const setHeight = (tx, ty, h) => {
  if (tx >= 0 && ty >= 0 && tx < W && ty < H) heights[ty * W + tx] = h;
};

// blocked border
for (let x = 0; x < W; x++) {
  set(x, 0, TILE_BLOCKED);
  set(x, H - 1, TILE_BLOCKED);
}
for (let y = 0; y < H; y++) {
  set(0, y, TILE_BLOCKED);
  set(W - 1, y, TILE_BLOCKED);
}

// rock clusters kept away from starts, lanes, and the center plateau
const rocks = [
  [40, 28],
  [88, 28],
  [40, 60],
  [88, 60],
];
for (const [rx, ry] of rocks) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(rx + dx, ry + dy, TILE_BLOCKED);
}

/** Holdable mid plateau (height 1) with east/west ramp mouths. */
const platX0 = 58;
const platX1 = 70;
const platY0 = 38;
const platY1 = 50;
for (let ty = platY0; ty <= platY1; ty++) {
  for (let tx = platX0; tx <= platX1; tx++) {
    setHeight(tx, ty, 1);
  }
}

const paintRamp = (tx, ty, height) => {
  set(tx, ty, TILE_RAMP);
  setHeight(tx, ty, height);
};

// West ramp: climb from open ground into the plateau (3 wide, 4 long)
for (let ty = 43; ty <= 45; ty++) {
  paintRamp(54, ty, 0);
  paintRamp(55, ty, 0);
  paintRamp(56, ty, 1);
  paintRamp(57, ty, 1);
}
// East ramp
for (let ty = 43; ty <= 45; ty++) {
  paintRamp(71, ty, 1);
  paintRamp(72, ty, 1);
  paintRamp(73, ty, 0);
  paintRamp(74, ty, 0);
}

const w = (tx) => tx * TILE + TILE / 2;
const startTiles = [
  [14, 14],
  [W - 15, 14],
  [14, H - 15],
  [W - 15, H - 15],
];
const startLocations = startTiles.map(([tx, ty]) => ({ x: w(tx), y: w(ty) }));

/** Large pool beside each corner base + smaller pools, including one on the plateau. */
const nodeTiles = [
  { tx: 24, ty: 24, amount: BASE_POOL },
  { tx: W - 25, ty: 24, amount: BASE_POOL },
  { tx: 24, ty: H - 25, amount: BASE_POOL },
  { tx: W - 25, ty: H - 25, amount: BASE_POOL },
  { tx: 64, ty: 20, amount: SMALL_POOL },
  { tx: 64, ty: H - 21, amount: SMALL_POOL },
  { tx: 20, ty: 44, amount: SMALL_POOL },
  { tx: W - 21, ty: 44, amount: SMALL_POOL },
  { tx: 44, ty: 34, amount: SMALL_POOL },
  { tx: W - 45, ty: 34, amount: SMALL_POOL },
  { tx: 44, ty: H - 35, amount: SMALL_POOL },
  { tx: W - 45, ty: H - 35, amount: SMALL_POOL },
  { tx: 64, ty: 44, amount: SMALL_POOL },
];
const manaNodes = nodeTiles.map(({ tx, ty, amount }) => ({ x: w(tx), y: w(ty), amount }));

const map = {
  id: 'duel_glade',
  name: 'Duel Glade',
  maxPlayers: 4,
  tileW: W,
  tileH: H,
  tiles,
  heights,
  startLocations,
  manaNodes,
};

mkdirSync('data/maps', { recursive: true });
writeFileSync('data/maps/duel_glade.json', JSON.stringify(map));
console.log('wrote data/maps/duel_glade.json', W, 'x', H, 'nodes', manaNodes.length);
