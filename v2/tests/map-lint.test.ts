// Map linting: proves every shipped map is playable, and that the linter actually catches
// the ways a map can be broken. A linter that only passes good maps is untested.

import { describe, expect, it } from 'vitest';
import { lintMap, lintMaps, reachableFrom } from '../src/map-lint';
import { getRegistry } from './helpers';
import type { MapData } from '../src/data/defs';

/** Build a tiny map for negative tests. 16x16, all ground, bordered by walls. */
function makeMap(mutate: (m: MapData) => void): MapData {
  const w = 16;
  const h = 16;
  const tiles = new Array(w * h).fill(0);
  for (let x = 0; x < w; x++) {
    tiles[x] = 1;
    tiles[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    tiles[y * w] = 1;
    tiles[y * w + (w - 1)] = 1;
  }
  const m: MapData = {
    id: 'test',
    name: 'Test',
    maxPlayers: 2,
    tileW: w,
    tileH: h,
    tiles,
    heights: new Array(w * h).fill(0),
    startLocations: [
      { x: 3 * 32 + 16, y: 3 * 32 + 16 },
      { x: 12 * 32 + 16, y: 12 * 32 + 16 },
    ],
    manaNodes: [
      { x: 5 * 32, y: 5 * 32, amount: 3000 },
      { x: 10 * 32, y: 10 * 32, amount: 3000 },
    ],
  };
  mutate(m);
  return m;
}

describe('map lint: every shipped map is playable', () => {
  it('no shipped map has any lint issue', () => {
    const reg = getRegistry();
    const issues = lintMaps(reg.maps.values());
    // Print all of them at once so a failing map set is diagnosable in one run.
    if (issues.length) {
      throw new Error(
        'Map lint failures:\n' +
          issues.map((i) => `  [${i.mapId}] ${i.check}: ${i.message}`).join('\n'),
      );
    }
    expect(issues).toEqual([]);
  });

  it('ships 5 maps including the v1 parity map', () => {
    const reg = getRegistry();
    expect(reg.maps.size).toBe(5);
    expect(reg.maps.has('duel_glade')).toBe(true);
  });

  it('each map supports at least as many players as its start locations', () => {
    for (const m of getRegistry().maps.values()) {
      expect(m.startLocations.length, `${m.id} has too few starts`).toBeGreaterThanOrEqual(2);
      expect(m.startLocations.length, `${m.id} has more starts than maxPlayers`).toBeLessThanOrEqual(m.maxPlayers);
    }
  });
});

describe('map lint: catches broken maps', () => {
  it('flags a start location sealed off by a wall', () => {
    const m = makeMap((mm) => {
      // Wall off the second start completely.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = 12 + dx;
          const ty = 12 + dy;
          mm.tiles[ty * mm.tileW + tx] = 1;
        }
      }
    });
    const issues = lintMap(m);
    expect(issues.some((i) => i.check === 'reachability')).toBe(true);
  });

  it('flags a start with no mana node nearby', () => {
    // A 64x64 map so the far start is genuinely beyond the haul threshold.
    const w = 64;
    const h = 64;
    const tiles = new Array(w * h).fill(0);
    for (let x = 0; x < w; x++) {
      tiles[x] = 1;
      tiles[(h - 1) * w + x] = 1;
    }
    for (let y = 0; y < h; y++) {
      tiles[y * w] = 1;
      tiles[y * w + (w - 1)] = 1;
    }
    const m: MapData = {
      id: 'test-far',
      name: 'Test Far',
      maxPlayers: 2,
      tileW: w,
      tileH: h,
      tiles,
      heights: new Array(w * h).fill(0),
      // 60 tiles apart: far beyond the 26-tile haul threshold.
      startLocations: [
        { x: 2 * 32 + 16, y: 2 * 32 + 16 },
        { x: 60 * 32 + 16, y: 60 * 32 + 16 },
      ],
      // Only ONE node, next to the first start.
      manaNodes: [{ x: 3 * 32, y: 3 * 32, amount: 3000 }],
    };
    const issues = lintMap(m);
    expect(issues.some((i) => i.check === 'node-proximity')).toBe(true);
  });

  it('flags a mana node inside a sealed pocket', () => {
    const m = makeMap((mm) => {
      // Seal a 3x3 pocket around the second node.
      const cx = 10;
      const cy = 10;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const edge = Math.abs(dx) === 2 || Math.abs(dy) === 2;
          if (!edge) continue;
          mm.tiles[(cy + dy) * mm.tileW + (cx + dx)] = 1;
        }
      }
    });
    const issues = lintMap(m);
    expect(issues.some((i) => i.check === 'node-access')).toBe(true);
  });

  it('flags a start with no room for a 3x3 building', () => {
    const m = makeMap((mm) => {
      // Fill the map except a one-tile-wide cross, so no 3x3 legal spot exists anywhere.
      mm.tiles.fill(1);
      for (let x = 1; x < mm.tileW - 1; x++) mm.tiles[8 * mm.tileW + x] = 0;
      for (let y = 1; y < mm.tileH - 1; y++) mm.tiles[y * mm.tileW + 8] = 0;
      mm.startLocations = [{ x: 8 * 32 + 16, y: 8 * 32 + 16 }];
      mm.manaNodes = [{ x: 4 * 32, y: 8 * 32 + 16, amount: 3000 }];
    });
    const issues = lintMap(m);
    expect(issues.some((i) => i.check === 'build-space')).toBe(true);
  });
});

describe('map lint: height rule matches the sim', () => {
  it('a cliff with no ramp is impassable', () => {
    const m = makeMap((mm) => {
      // Raise the entire right half by 1 with no ramp.
      for (let ty = 0; ty < mm.tileH; ty++) {
        for (let tx = 8; tx < mm.tileW; tx++) mm.heights[ty * mm.tileW + tx] = 1;
      }
    });
    const issues = lintMap(m);
    expect(issues.some((i) => i.check === 'reachability')).toBe(true);
  });

  it('the same cliff WITH a ramp is passable', () => {
    const m = makeMap((mm) => {
      for (let ty = 0; ty < mm.tileH; ty++) {
        for (let tx = 8; tx < mm.tileW; tx++) mm.heights[ty * mm.tileW + tx] = 1;
      }
      // Ramp on the seam: one tile at level 0 marked as a ramp, the next at level 1.
      mm.tiles[8 * mm.tileW + 7] = 2;
      mm.heights[8 * mm.tileW + 7] = 0;
      mm.tiles[8 * mm.tileW + 8] = 2;
      mm.heights[8 * mm.tileW + 8] = 1;
    });
    const issues = lintMap(m);
    expect(issues.some((i) => i.check === 'reachability')).toBe(false);
  });

  it('a two-level step without a ramp is impassable even if a one-level step would pass', () => {
    const m = makeMap((mm) => {
      for (let ty = 0; ty < mm.tileH; ty++) {
        for (let tx = 8; tx < mm.tileW; tx++) mm.heights[ty * mm.tileW + tx] = 2;
      }
    });
    const issues = lintMap(m);
    expect(issues.some((i) => i.check === 'reachability')).toBe(true);
  });

  it('reachableFrom returns only tiles actually reachable', () => {
    const m = makeMap((mm) => {
      for (let ty = 0; ty < mm.tileH; ty++) {
        for (let tx = 8; tx < mm.tileW; tx++) mm.heights[ty * mm.tileW + tx] = 1;
      }
    });
    const reach = reachableFrom(m, 3, 3);
    expect(reach[3 * 16 + 3]).toBe(1);
    expect(reach[12 * 16 + 12]).toBe(0);
  });
});
