// Generates data/maps/duel_glade.json: an open arena with a blocked border, a few rock
// clusters, 4 start locations, and mana nodes. Editable afterwards like any data file.
import { writeFileSync, mkdirSync } from 'node:fs';

const TILE = 32;
const W = 128;
const H = 88;
const BASE_POOL = 25000;
const SMALL_POOL = 3000;
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
  [40, 28],
  [88, 28],
  [40, 60],
  [88, 60],
  [64, 44],
];
for (const [rx, ry] of rocks) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(rx + dx, ry + dy, 1);
}

const w = (tx) => tx * TILE + TILE / 2;
const startTiles = [
  [14, 14],
  [W - 15, 14],
  [14, H - 15],
  [W - 15, H - 15],
];
const startLocations = startTiles.map(([tx, ty]) => ({ x: w(tx), y: w(ty) }));

/** Large pool beside each corner base + smaller pools spread across the map. */
const nodeTiles = [
  // corner base pools
  { tx: 24, ty: 24, amount: BASE_POOL },
  { tx: W - 25, ty: 24, amount: BASE_POOL },
  { tx: 24, ty: H - 25, amount: BASE_POOL },
  { tx: W - 25, ty: H - 25, amount: BASE_POOL },
  // north / south lane
  { tx: 64, ty: 20, amount: SMALL_POOL },
  { tx: 64, ty: H - 21, amount: SMALL_POOL },
  // east / west mid
  { tx: 20, ty: 44, amount: SMALL_POOL },
  { tx: W - 21, ty: 44, amount: SMALL_POOL },
  // inner quadrants
  { tx: 44, ty: 34, amount: SMALL_POOL },
  { tx: W - 45, ty: 34, amount: SMALL_POOL },
  { tx: 44, ty: H - 35, amount: SMALL_POOL },
  { tx: W - 45, ty: H - 35, amount: SMALL_POOL },
  // map center
  { tx: 64, ty: 44, amount: SMALL_POOL },
];
const manaNodes = nodeTiles.map(({ tx, ty, amount }) => ({ x: w(tx), y: w(ty), amount }));

/** Render-only raised plateaus (sim ignores; oblique view lifts these tiles). */
const visualHeights = new Array(W * H).fill(0);
const plateau = (tx, ty, level = 1) => {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && tiles[y * W + x] === 0) {
        visualHeights[y * W + x] = level;
      }
    }
  }
};
plateau(64, 44, 2);
plateau(32, 22, 1);
plateau(W - 33, 22, 1);
plateau(32, H - 23, 1);
plateau(W - 33, H - 23, 1);

const map = {
  id: 'duel_glade',
  name: 'Duel Glade',
  maxPlayers: 4,
  tileW: W,
  tileH: H,
  tiles,
  visualHeights,
  startLocations,
  manaNodes,
};

mkdirSync('data/maps', { recursive: true });
writeFileSync('data/maps/duel_glade.json', JSON.stringify(map));
console.log('wrote data/maps/duel_glade.json', W, 'x', H, 'nodes', manaNodes.length);
