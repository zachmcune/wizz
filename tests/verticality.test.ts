import { describe, it, expect } from 'vitest';
import { TILE, TILE_BLOCKED, TILE_RAMP } from '../src/core/constants';
import { tileToWorld } from '../src/core/coords';
import type { MapData } from '../src/data/defs';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { NavGrid } from '../src/sim/nav-grid';
import { computeFlowField } from '../src/sim/flow-field';
import { visibilitySystem } from '../src/sim/systems/visibility';
import { isTileVisible } from '../src/sim/fog';
import { dist } from '../src/sim/math';
import { worldToScreen } from '../src/core/coords';
import { FLYER_HOVER_LEVELS } from '../src/core/projection';
import { pickEntityForInput } from '../src/input/projected-pick';

const reg = getRegistry();

function makeMap(w: number, h: number): MapData {
  const tiles = new Array(w * h).fill(0);
  const heights = new Array(w * h).fill(0);
  for (let x = 0; x < w; x++) {
    tiles[x] = TILE_BLOCKED;
    tiles[(h - 1) * w + x] = TILE_BLOCKED;
  }
  for (let y = 0; y < h; y++) {
    tiles[y * w] = TILE_BLOCKED;
    tiles[y * w + w - 1] = TILE_BLOCKED;
  }
  return {
    id: 'height_lab',
    name: 'Height Lab',
    maxPlayers: 2,
    tileW: w,
    tileH: h,
    tiles,
    heights,
    startLocations: [],
    manaNodes: [],
  };
}

describe('height-field navigation', () => {
  it('treats a height change without a ramp as a cliff', () => {
    const map = makeMap(16, 12);
    for (let ty = 1; ty < 11; ty++) {
      for (let tx = 8; tx < 15; tx++) map.heights![ty * 16 + tx] = 1;
    }
    const nav = new NavGrid(map);
    expect(nav.canStep(6, 5, 7, 5)).toBe(true);
    expect(nav.canStep(7, 5, 8, 5)).toBe(false);
    expect(nav.heightAt(8, 5)).toBe(1);

    const field = computeFlowField(nav, 10, 5, (tx, ty) => nav.isBlocked(tx, ty));
    expect(field.cost[5 * 16 + 6]).toBe(0xffff);
    expect(field.cost[5 * 16 + 10]).toBe(0);
  });

  it('allows a ±1 height step when a ramp is present', () => {
    const map = makeMap(16, 12);
    for (let ty = 1; ty < 11; ty++) {
      for (let tx = 8; tx < 15; tx++) map.heights![ty * 16 + tx] = 1;
    }
    map.tiles[5 * 16 + 7] = TILE_RAMP;
    map.tiles[5 * 16 + 8] = TILE_RAMP;
    map.heights![5 * 16 + 7] = 0;
    map.heights![5 * 16 + 8] = 1;
    const nav = new NavGrid(map);
    expect(nav.canStep(7, 5, 8, 5)).toBe(true);

    const field = computeFlowField(nav, 10, 5, (tx, ty) => nav.isBlocked(tx, ty));
    expect(field.cost[5 * 16 + 6]).toBeLessThan(0xffff);
  });

  it('rejects a building footprint that hangs off a cliff', () => {
    const map = makeMap(16, 12);
    for (let ty = 1; ty < 11; ty++) {
      for (let tx = 8; tx < 15; tx++) map.heights![ty * 16 + tx] = 1;
    }
    const nav = new NavGrid(map);
    expect(nav.canPlace(7, 4, 2, 0)).toBe(false);
    expect(nav.canPlace(9, 4, 2, 0)).toBe(true);
  });

  it('allows a wall footprint entirely on ramp tiles', () => {
    const map = makeMap(16, 12);
    for (let tx = 6; tx <= 9; tx++) {
      map.tiles[5 * 16 + tx] = TILE_RAMP;
      map.heights![5 * 16 + tx] = tx < 8 ? 0 : 1;
    }
    const nav = new NavGrid(map);
    expect(nav.footprintHeightOk(6, 5, 1)).toBe(true);
    expect(nav.canPlace(7, 5, 1, 0)).toBe(true);
  });
});

describe('Duel Glade plateau', () => {
  const plateau = tileToWorld(64, 44);
  const belowCliff = tileToWorld(64, 36);
  const westApproach = tileToWorld(52, 44);

  it('has a height-1 plateau with ramps on the east and west mouths', () => {
    const { services } = initMatch(reg, reg.match('skirmish_1v1'));
    const nav = services.nav;
    expect(nav.heightAt(64, 44)).toBe(1);
    expect(nav.isRamp(55, 44)).toBe(true);
    expect(nav.isRamp(72, 44)).toBe(true);
    expect(nav.canStep(64, 36, 64, 38)).toBe(false);
    expect(nav.canStep(55, 44, 56, 44)).toBe(true);
  });

  it('lets a ground unit climb the west ramp and blocks a cliff hop', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);

    const climber = spawnEntity(state, services, null, 'imp_swarmling', 'player0', westApproach.x, westApproach.y);
    sim.enqueueNow([{ type: 'move', playerId: 'player0', entityIds: [climber.id], x: plateau.x, y: plateau.y }]);
    for (let i = 0; i < 500; i++) sim.step();
    expect(dist(climber.pos, plateau)).toBeLessThan(TILE * 3);
    expect(services.nav.heightAtWorld(climber.pos.x, climber.pos.y)).toBe(1);

    const hopper = spawnEntity(state, services, null, 'imp_swarmling', 'player0', belowCliff.x, belowCliff.y);
    sim.enqueueNow([{ type: 'move', playerId: 'player0', entityIds: [hopper.id], x: plateau.x, y: plateau.y }]);
    for (let i = 0; i < 50; i++) sim.step();
    expect(services.nav.heightAtWorld(hopper.pos.x, hopper.pos.y)).toBe(0);
    expect(hopper.pos.y).toBeLessThan(38 * TILE);
  });
});

describe('high-ground vision', () => {
  it('does not reveal higher tiles from the ground, but flyers reveal all heights', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.id === 'player0')!;
    const edge = tileToWorld(64, 36);
    const plateauTx = 64;
    const plateauTy = 40;

    const scout = [...state.entities.values()].find((e) => e.owner === 'player0' && e.defId === 'wisp')!;
    scout.pos = { x: edge.x, y: edge.y };
    visibilitySystem(state, { services, events: [] });
    expect(isTileVisible(human, plateauTx * TILE + 16, plateauTy * TILE + 16, services.nav)).toBe(false);

    spawnEntity(state, services, null, 'rift_skimmer', 'player0', edge.x, edge.y);
    visibilitySystem(state, { services, events: [] });
    expect(isTileVisible(human, plateauTx * TILE + 16, plateauTy * TILE + 16, services.nav)).toBe(true);
  });
});

describe('flying troops', () => {
  it('defines the Rift Skimmer as a late-tech air unit', () => {
    const unit = reg.unit('rift_skimmer');
    expect(unit.mobility).toBe('air');
    expect(unit.producedBy).toBe('summoning_circle');
    expect(unit.requires).toContain('arcane_nexus');
    expect(reg.building('summoning_circle').producesUnits).toContain('rift_skimmer');
    expect(unit.canGarrison).toBeFalsy();
    expect(unit.isHarvester).toBeFalsy();
  });

  it('ignores buildings when pathing', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);

    const start = { x: 400, y: 800 };
    const target = { x: 1400, y: 800 };
    const flyer = spawnEntity(state, services, null, 'rift_skimmer', 'player0', start.x, start.y);
    spawnEntity(state, services, null, 'golem_forge', 'player0', 900, 800);

    sim.enqueueNow([{ type: 'move', playerId: 'player0', entityIds: [flyer.id], x: target.x, y: target.y }]);
    let maxYOffset = 0;
    for (let i = 0; i < 400; i++) {
      sim.step();
      maxYOffset = Math.max(maxYOffset, Math.abs(flyer.pos.y - start.y));
    }
    expect(dist(flyer.pos, target)).toBeLessThan(TILE * 3);
    expect(maxYOffset).toBeLessThan(TILE * 2);
  });

  it('cannot be hit by melee but can be hit by a tagged ranged weapon', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);

    const flyer = spawnEntity(state, services, null, 'rift_skimmer', 'player1', 720, 720);
    const imp = spawnEntity(state, services, null, 'imp_swarmling', 'player0', 700, 720);
    const flyerHp = flyer.hp;
    sim.enqueueNow([{ type: 'attack', playerId: 'player0', entityIds: [imp.id], targetId: flyer.id }]);
    for (let i = 0; i < 80; i++) sim.step();
    expect(flyer.hp).toBe(flyerHp);

    const archer = spawnEntity(state, services, null, 'arcane_archer', 'player0', 640, 720);
    sim.enqueueNow([{ type: 'attack', playerId: 'player0', entityIds: [archer.id], targetId: flyer.id }]);
    for (let i = 0; i < 80; i++) sim.step();
    expect(flyer.hp).toBeLessThan(flyerHp);
  });

  it('is ignored by Storm Conductor chain lightning', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);

    spawnEntity(state, services, null, 'storm_conductor', 'player0', 640, 640);
    const flyer = spawnEntity(state, services, null, 'rift_skimmer', 'player1', 760, 640);
    const golem = spawnEntity(state, services, null, 'stone_golem', 'player1', 800, 640);
    const flyerHp = flyer.hp;
    const golemHp = golem.hp;
    for (let i = 0; i < 80; i++) sim.step();
    expect(flyer.hp).toBe(flyerHp);
    expect(golem.hp).toBeLessThan(golemHp);
  });

  it('projects pick height with hover lift', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const flyer = spawnEntity(state, services, null, 'rift_skimmer', 'player0', 640, 640);
    const cam = { x: flyer.pos.x - 200, y: flyer.pos.y - 150, zoom: 1 };
    const hoverScreen = worldToScreen(
      flyer.pos,
      cam,
      services.nav.heightAtWorld(flyer.pos.x, flyer.pos.y) + FLYER_HOVER_LEVELS,
    );
    expect(pickEntityForInput(state, 'player0', { x: 0, y: 0 }, hoverScreen, cam, services.nav, reg)?.id).toBe(flyer.id);
  });
});
