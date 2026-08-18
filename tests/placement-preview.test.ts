import { describe, expect, it } from 'vitest';
import { TILE, TILE_BLOCKED } from '../src/core/constants';
import type { MapData } from '../src/data/defs';
import { placementConfirmHint } from '../src/input/placement';
import { BUILD_ZONE_TILES, canBuildNearBase, collectBuildZoneTiles, tileInBuildZone } from '../src/sim/build-zone';
import { initMatch } from '../src/sim/factory';
import { NavGrid } from '../src/sim/nav-grid';
import {
  classifyBuildZoneTiles,
  classifyPlacementCells,
  placementIssueFromChecks,
} from '../src/sim/placement-preview';
import { footprintOverlapsNode, resourceNodeTiles } from '../src/sim/resource-nodes';
import { getRegistry } from './helpers';

const reg = getRegistry();

function makeMap(w: number, h: number): MapData {
  const tiles = new Array(w * h).fill(0);
  const heights = new Array(w * h).fill(0);
  return {
    id: 'place_lab',
    name: 'Place Lab',
    maxPlayers: 2,
    tileW: w,
    tileH: h,
    tiles,
    heights,
    startLocations: [],
    manaNodes: [],
  };
}

describe('placement issue hints', () => {
  it('uses one consistent sentence per failure reason', () => {
    expect(placementConfirmHint()).toBe('· click map or Place');
    expect(placementConfirmHint('node')).toBe('· on a mana pool');
    expect(placementConfirmHint('range')).toBe('· too far from your buildings');
    expect(placementConfirmHint('cliff')).toBe('· needs level ground');
    expect(placementConfirmHint('blocked')).toBe('· blocked by terrain or a structure');
  });
});

describe('placement cell classification', () => {
  it('marks each footprint tile with the matching reason', () => {
    const cells = classifyPlacementCells({
      tx: 10,
      ty: 4,
      footprint: 2,
      requireZone: true,
      tileInZone: (tx) => tx === 10,
      tileOnNode: (tx, ty) => tx === 11 && ty === 4,
      tileOccupied: (tx, ty) => tx === 10 && ty === 5,
      heightOk: true,
    });
    expect(cells).toEqual([
      { tx: 10, ty: 4, kind: 'ok' },
      { tx: 11, ty: 4, kind: 'node' },
      { tx: 10, ty: 5, kind: 'blocked' },
      { tx: 11, ty: 5, kind: 'range' },
    ]);
  });

  it('paints leftover clear tiles as cliff when the footprint spans uneven ground', () => {
    const cells = classifyPlacementCells({
      tx: 7,
      ty: 4,
      footprint: 2,
      requireZone: true,
      tileInZone: () => true,
      tileOnNode: () => false,
      tileOccupied: () => false,
      heightOk: false,
    });
    expect(cells.every((c) => c.kind === 'cliff')).toBe(true);
    expect(placementIssueFromChecks({ occupied: false, heightOk: false, nodeBlocked: false, zoneOk: true, navOk: false })).toBe(
      'cliff',
    );
  });

  it('does not apply the build-zone color when deploy skips the zone check', () => {
    const cells = classifyPlacementCells({
      tx: 0,
      ty: 0,
      footprint: 1,
      requireZone: false,
      tileInZone: () => false,
      tileOnNode: () => false,
      tileOccupied: () => false,
      heightOk: true,
    });
    expect(cells).toEqual([{ tx: 0, ty: 0, kind: 'ok' }]);
  });
});

describe('build zone tile overlay', () => {
  it('lists exactly the tiles canBuildNearBase accepts for a 1x1 footprint', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const tiles = collectBuildZoneTiles(state, services, 'player0');
    expect(tiles.length).toBeGreaterThan(100);

    for (const { tx, ty } of tiles) {
      expect(tileInBuildZone(state, services, 'player0', tx, ty)).toBe(true);
      expect(canBuildNearBase(state, services, 'player0', tx, ty, 1)).toBe(true);
    }

    const farTx = Math.floor(2400 / TILE);
    const farTy = Math.floor(1800 / TILE);
    expect(tiles.some((t) => t.tx === farTx && t.ty === farTy)).toBe(false);
    expect(canBuildNearBase(state, services, 'player0', farTx, farTy, 1)).toBe(false);
  });

  it('keeps the zone a filled Chebyshev square, not a circle', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sanctum = [...state.entities.values()].find((e) => e.defId === 'sanctum' && e.owner === 'player0')!;
    const originTx = Math.floor((sanctum.pos.x - (3 * TILE) / 2) / TILE);
    const originTy = Math.floor((sanctum.pos.y - (3 * TILE) / 2) / TILE);
    const cornerTx = originTx - BUILD_ZONE_TILES;
    const cornerTy = originTy - BUILD_ZONE_TILES;
    expect(tileInBuildZone(state, services, 'player0', cornerTx, cornerTy)).toBe(true);
    expect(tileInBuildZone(state, services, 'player0', cornerTx - 1, cornerTy)).toBe(false);
  });

  it('colors open, blocked, and mana-pool tiles in the zone', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const tiles = collectBuildZoneTiles(state, services, 'player0');
    const nodeSet = new Set(resourceNodeTiles(state).map((n) => `${n.tx},${n.ty}`));
    const classified = classifyBuildZoneTiles(tiles, services.nav, (tx, ty) => nodeSet.has(`${tx},${ty}`));

    expect(classified.some((t) => t.kind === 'open')).toBe(true);
    expect(classified.some((t) => t.kind === 'blocked')).toBe(true);

    const node = resourceNodeTiles(state)[0];
    if (node && tiles.some((t) => t.tx === node.tx && t.ty === node.ty)) {
      expect(classified.find((t) => t.tx === node.tx && t.ty === node.ty)?.kind).toBe('node');
      expect(footprintOverlapsNode(state, node.tx, node.ty, 1)).toBe(true);
    }
  });

  it('treats a cliff-spanning 2x2 as not placeable even when every tile is open', () => {
    const map = makeMap(16, 12);
    for (let ty = 1; ty < 11; ty++) {
      for (let tx = 8; tx < 15; tx++) map.heights![ty * 16 + tx] = 1;
    }
    map.tiles[0] = TILE_BLOCKED;
    const nav = new NavGrid(map);
    expect(nav.canPlace(7, 4, 2, 0)).toBe(false);
    expect(nav.footprintHeightOk(7, 4, 2)).toBe(false);
    expect(nav.isOccupied(7, 4)).toBe(false);
    expect(nav.isOccupied(8, 4)).toBe(false);
  });
});
