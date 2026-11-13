// Generates the v2 map set into v2/data/maps/.
// Run from the repo root: `node v2/scripts/gen-maps.mjs`
//
// Every map is produced by the same small toolkit so the shapes are consistent and reviewable,
// and every map is checked by `v2/src/map-lint.ts` (run in tests) for:
//   • mutual reachability of all start locations on foot, ignoring buildings
//   • at least one mana node within a usable haul of every start
//   • no start location on a blocked tile
//   • footprints legal: no 3x3 building spot forced across a cliff edge at a start
//
// duel_glade is copied verbatim from v1 (it is the parity map) and is NOT regenerated.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TILE = 32;
const GROUND = 0;
const BLOCKED = 1;
const RAMP = 2;
const BASE_POOL = 25000;
const SMALL_POOL = 3000;

/** Small builder so each map is declarative rather than 10 000 hand-written numbers. */
class MapBuilder {
  constructor(id, name, w, h, description) {
    this.id = id;
    this.name = name;
    this.w = w;
    this.h = h;
    this.description = description;
    this.tiles = new Array(w * h).fill(GROUND);
    this.heights = new Array(w * h).fill(0);
    this.starts = [];
    this.nodes = [];
  }

  idx(tx, ty) {
    return ty * this.w + tx;
  }

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  set(tx, ty, code) {
    if (this.inBounds(tx, ty)) this.tiles[this.idx(tx, ty)] = code;
    return this;
  }

  setHeight(tx, ty, h) {
    if (this.inBounds(tx, ty)) this.heights[this.idx(tx, ty)] = h;
    return this;
  }

  /** Border wall. */
  border(thickness = 1) {
    for (let t = 0; t < thickness; t++) {
      for (let x = 0; x < this.w; x++) {
        this.set(x, t, BLOCKED);
        this.set(x, this.h - 1 - t, BLOCKED);
      }
      for (let y = 0; y < this.h; y++) {
        this.set(t, y, BLOCKED);
        this.set(this.w - 1 - t, y, BLOCKED);
      }
    }
    return this;
  }

  rect(x0, y0, x1, y1, code = BLOCKED, height = null) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        this.set(tx, ty, code);
        if (height !== null) this.setHeight(tx, ty, height);
      }
    }
    return this;
  }

  /** Raise a rectangular plateau to `height`, leaving the interior walkable. */
  plateau(x0, y0, x1, y1, height) {
    return this.rect(x0, y0, x1, y1, GROUND, height);
  }

  /** Ramp strip: a passable tile at `height` so units may step between levels here. */
  ramp(x0, y0, x1, y1, height) {
    return this.rect(x0, y0, x1, y1, RAMP, height);
  }

  start(tx, ty) {
    this.starts.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
    return this;
  }

  node(tx, ty, amount = SMALL_POOL) {
    this.nodes.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, amount });
    return this;
  }

  build(maxPlayers) {
    if (this.starts.length > maxPlayers) throw new Error(`${this.id}: more starts than maxPlayers`);
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      maxPlayers,
      tileW: this.w,
      tileH: this.h,
      tiles: this.tiles,
      heights: this.heights,
      startLocations: this.starts,
      manaNodes: this.nodes,
    };
  }
}

// ---------------------------------------------------------------- Ashen Steps
// 2 players, height-heavy: a central two-tier mesa with a single long ramp per side.
function ashenSteps() {
  const b = new MapBuilder(
    'ashen_steps',
    'Ashen Steps',
    112,
    96,
    'Two bases on the low ground, a two-tier mesa in the middle. The only way up is the long ramp — hold it and you hold the map.',
  );
  b.border(1);

  // Outer low ground, with rock outcrops framing the lanes.
  b.rect(26, 30, 30, 34);
  b.rect(81, 30, 85, 34);
  b.rect(26, 61, 30, 65);
  b.rect(81, 61, 85, 65);

  // Central two-tier mesa: a broad level-1 shelf with a small level-2 crown.
  b.plateau(44, 34, 67, 61, 1);
  b.plateau(52, 43, 59, 52, 2);

  // Ramps: level 0 -> 1 on each side, then 1 -> 2 up to the crown.
  b.ramp(41, 46, 43, 49, 0);
  b.ramp(44, 46, 44, 49, 1);
  b.ramp(68, 46, 70, 49, 0);
  b.ramp(67, 46, 67, 49, 1);
  b.ramp(51, 46, 51, 49, 1);
  b.ramp(52, 46, 52, 49, 2);
  b.ramp(59, 46, 59, 49, 1);
  b.ramp(60, 46, 60, 49, 2);

  b.start(16, 16);
  b.start(95, 79);

  b.node(30, 24, BASE_POOL);
  b.node(81, 71, BASE_POOL);
  b.node(55, 37, SMALL_POOL);
  b.node(56, 58, SMALL_POOL);
  b.node(20, 48, SMALL_POOL);
  b.node(91, 48, SMALL_POOL);
  b.node(46, 20, SMALL_POOL);
  b.node(65, 75, SMALL_POOL);
  return b.build(2);
}

// ------------------------------------------------------------------- Tideglass
// 2-4 players, wide and open with a rich contested centre node and thin side lanes.
function tideglass() {
  const b = new MapBuilder(
    'tideglass',
    'Tideglass',
    144,
    80,
    'A wide glass plain. One fat node in the dead centre pays for an army — if you can hold it from four directions at once.',
  );
  b.border(1);

  // Long low ridges that create three lanes but never fully block a lane.
  b.rect(34, 12, 36, 30);
  b.rect(34, 49, 36, 67);
  b.rect(107, 12, 109, 30);
  b.rect(107, 49, 109, 67);
  b.rect(64, 22, 80, 23);
  b.rect(64, 56, 80, 57);

  // Centre raised ring with four ramps — the contested high ground.
  b.plateau(66, 34, 78, 45, 1);
  b.ramp(65, 38, 66, 41, 0);
  b.ramp(78, 38, 79, 41, 0);
  b.ramp(70, 33, 73, 34, 0);
  b.ramp(70, 45, 73, 46, 0);

  b.start(14, 14);
  b.start(129, 14);
  b.start(14, 65);
  b.start(129, 65);

  b.node(26, 26, BASE_POOL);
  b.node(117, 26, BASE_POOL);
  b.node(26, 53, BASE_POOL);
  b.node(117, 53, BASE_POOL);
  b.node(72, 39, 9000);
  b.node(56, 14, SMALL_POOL);
  b.node(88, 14, SMALL_POOL);
  b.node(56, 65, SMALL_POOL);
  b.node(88, 65, SMALL_POOL);
  b.node(20, 40, SMALL_POOL);
  b.node(123, 40, SMALL_POOL);
  return b.build(4);
}

// ----------------------------------------------------------------- Sunken Vault
// 2 players, tight and fast: few nodes, short rush distance, one shared chamber.
function sunkenVault() {
  const b = new MapBuilder(
    'sunken_vault',
    'Sunken Vault',
    96,
    96,
    'A collapsed vault. Short rush distance and only six nodes — games here are decided in the first five minutes.',
  );
  b.border(1);

  // Chamber walls forming a pinched middle.
  b.rect(30, 20, 34, 40);
  b.rect(61, 20, 65, 40);
  b.rect(30, 55, 34, 75);
  b.rect(61, 55, 65, 75);

  // A single raised vault floor in the centre, one ramp each side.
  b.plateau(42, 40, 53, 55, 1);
  b.ramp(41, 45, 42, 49, 0);
  b.ramp(53, 45, 54, 49, 0);

  b.start(14, 14);
  b.start(81, 81);

  b.node(22, 22, BASE_POOL);
  b.node(73, 73, BASE_POOL);
  b.node(47, 47, 6000);
  b.node(47, 20, SMALL_POOL);
  b.node(47, 75, SMALL_POOL);
  b.node(18, 47, SMALL_POOL);
  b.node(77, 47, SMALL_POOL);
  return b.build(2);
}

// ------------------------------------------------------------------ Ember Reach
// 4 players, four corners, long hauls: the endurance map for 20-minute games.
function emberReach() {
  const b = new MapBuilder(
    'ember_reach',
    'Ember Reach',
    160,
    112,
    'Four distant keeps across a broken caldera. Long supply lines reward expansion and punish over-extension.',
  );
  b.border(1);

  // Broken caldera walls: three concentric arcs with gaps, creating long flank routes.
  const arc = (cx, cy, r, fromDeg, toDeg, thickness) => {
    for (let d = fromDeg; d <= toDeg; d += 0.5) {
      const rad = (d * Math.PI) / 180;
      for (let t = 0; t < thickness; t++) {
        const tx = Math.round(cx + Math.cos(rad) * (r + t));
        const ty = Math.round(cy + Math.sin(rad) * (r + t));
        b.set(tx, ty, BLOCKED);
      }
    }
  };
  arc(80, 56, 26, 200, 340, 3);
  arc(80, 56, 26, 20, 160, 3);
  arc(80, 56, 40, 210, 250, 2);
  arc(80, 56, 40, 290, 330, 2);

  // Clear any wall that landed on a would-be walkable feature. The arc painter works from a
  // radius and can clip intended node tiles; carving here keeps the map honest instead of
  // silently shipping a node sealed inside rock (which the map linter caught once already).
  const clearRect = (cx, cy, r) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) b.set(cx + dx, cy + dy, GROUND);
    }
  };
  for (const [cx, cy] of [
    [44, 26],
    [116, 26],
    [50, 82],
    [110, 82],
    [80, 20],
    [80, 92],
    [22, 56],
    [138, 56],
  ]) {
    clearRect(cx, cy, 2);
  }

  // Central caldera floor: raised, rich, and reachable from four ramps.
  b.plateau(70, 46, 89, 65, 1);
  b.ramp(69, 53, 70, 58, 0);
  b.ramp(89, 53, 90, 58, 0);
  b.ramp(77, 45, 82, 46, 0);
  b.ramp(77, 65, 82, 66, 0);

  b.start(14, 14);
  b.start(145, 14);
  b.start(14, 97);
  b.start(145, 97);

  b.node(28, 28, BASE_POOL);
  b.node(131, 28, BASE_POOL);
  b.node(28, 83, BASE_POOL);
  b.node(131, 83, BASE_POOL);
  b.node(80, 55, 10000);
  b.node(80, 20, SMALL_POOL);
  b.node(80, 92, SMALL_POOL);
  b.node(22, 56, SMALL_POOL);
  b.node(138, 56, SMALL_POOL);
  b.node(44, 26, SMALL_POOL);
  b.node(116, 26, SMALL_POOL);
  b.node(50, 82, SMALL_POOL);
  b.node(110, 82, SMALL_POOL);
  return b.build(4);
}

const maps = [ashenSteps(), tideglass(), sunkenVault(), emberReach()];

// Resolve output relative to THIS FILE, not the shell's cwd, so the script is correct whether it
// is run from the repo root or from v2/. (Writing relative to cwd silently created v2/v2/data.)
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data', 'maps');
mkdirSync(outDir, { recursive: true });
for (const m of maps) {
  writeFileSync(join(outDir, `${m.id}.json`), JSON.stringify(m) + '\n');
  console.log(
    `wrote v2/data/maps/${m.id}.json  ${m.tileW}x${m.tileH}  starts=${m.startLocations.length}  nodes=${m.manaNodes.length}`,
  );
}
