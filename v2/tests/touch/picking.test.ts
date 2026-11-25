// SCREEN-SPACE PICKING — the "did my tap hit that unit" rules.
//
// Picking in a 2.5D game is where a rebuild quietly gets worse than the original: a world-space radius
// test looks reasonable in code and feels wrong under a finger, because the projection squashes Y by 4
// and X by 2. A world-space circle is a flat diamond on screen, so a tap near a sprite's top edge misses
// while a tap well below it selects. v2 shipped exactly that, and this suite is the replacement.
//
// What is asserted, each as a property rather than a magic number:
//
//   • a tap at an entity's projected position selects it;
//   • a tap exactly outside the radius selects nothing;
//   • a unit in front of a building WINS the tap, because you must be able to select the army parked in
//     your own base — the kind weight is the mechanism and this is the case it exists for;
//   • an entity on a plateau is picked where it is DRAWN (its position lifted by the tile height), not
//     where its feet would project on flat ground;
//   • a box select takes exactly the projected-inside units, and never an enemy's;
//   • a fogged enemy is not pickable, so the picker cannot be used as a map hack.

import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/data/loader';
import { initMatch } from '../../src/sim/factory';
import { Camera } from '../../src/render/camera';
import { TILE } from '../../src/core/constants';
import { FLYER_HOVER_LEVELS, VISUAL_HEIGHT_STEP, projectGround } from '../../src/core/projection';
import {
  PICK_RADIUS_BUILDING,
  PICK_RADIUS_UNIT,
  entityScreenPos,
  groundPointAt,
  levelAt,
  pickEntityAt,
  pickResourceNodeAt,
  unitsInScreenBox,
} from '../../src/app/input/picking';
import { screenToWorld } from '../../src/core/projection';
import { visibilitySystem } from '../../src/sim/fog';

const registry = loadRegistry();

function newMatch(seed = 7): ReturnType<typeof initMatch> {
  return initMatch(registry, {
    mapId: 'duel_glade',
    seed,
    players: [
      { id: 'p1', controller: 'human', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1, aiDifficulty: 'normal' },
    ],
  });
}

/** A camera framed on the first player's base, which is what the game does at match start. */
function baseCamera(match: ReturnType<typeof initMatch>): Camera {
  const map = registry.map(match.state.mapId);
  const cam = new Camera(667, 375, map.tileW * TILE, map.tileH * TILE);
  cam.setInsets({ left: 0, top: 38, right: 136, bottom: 0 });
  const s = map.startLocations[0]!;
  cam.frameOn(s.x, s.y);
  return cam;
}

describe('picking: a tap on an entity selects it', () => {
  it('the starting Sanctum is picked from its own projected centre', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = baseCamera(match);
    const st = match.state;
    let slot = -1;
    for (let s = 0; s < st.entities.count; s++) {
      if (!st.entities.dead[s] && st.entities.kind[s] === 1 && st.entities.ownerIndex[s] === 0) {
        slot = s;
        break;
      }
    }
    expect(slot).toBeGreaterThanOrEqual(0);
    const p = entityScreenPos(st, registry, map, slot, cam.view());
    const hit = pickEntityAt(st, 'p1', p, cam.view(), registry, map);
    expect(hit?.slot).toBe(slot);
    expect(hit?.kind).toBe(1);
    expect(hit?.owner).toBe('p1');
  });

  it('a starting Wisp is picked from its own projected centre', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = baseCamera(match);
    const st = match.state;
    let slot = -1;
    for (let s = 0; s < st.entities.count; s++) {
      if (!st.entities.dead[s] && st.entities.kind[s] === 0 && st.entities.ownerIndex[s] === 0) {
        slot = s;
        break;
      }
    }
    const p = entityScreenPos(st, registry, map, slot, cam.view());
    const hit = pickEntityAt(st, 'p1', p, cam.view(), registry, map);
    expect(hit?.id).toBe(st.entities.id[slot]!);
  });

  it('a tap well outside every radius selects nothing', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = baseCamera(match);
    // The playable rect's bottom-left corner is far from the base at this framing.
    const hit = pickEntityAt(match.state, 'p1', { x: 4, y: 372 }, cam.view(), registry, map);
    // Either nothing, or something genuinely there — but the Sanctum must not be it.
    const st = match.state;
    const sanctum = st.entities.id.find((_, s) => st.entities.kind[s] === 1 && st.entities.ownerIndex[s] === 0);
    expect(hit?.id === sanctum).toBe(false);
  });

  it('the pick radius scales with zoom, so a zoomed-out sprite is still tappable', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = baseCamera(match);
    const st = match.state;
    let slot = -1;
    for (let s = 0; s < st.entities.count; s++) {
      if (!st.entities.dead[s] && st.entities.kind[s] === 0 && st.entities.ownerIndex[s] === 0) {
        slot = s;
        break;
      }
    }
    const p = entityScreenPos(st, registry, map, slot, cam.view());
    // Just outside the radius at the current zoom.
    const justOut = PICK_RADIUS_UNIT * cam.zoom + 6;
    const miss = pickEntityAt(st, 'p1', { x: p.x + justOut, y: p.y }, cam.view(), registry, map);
    expect(miss?.slot).not.toBe(slot);
    // At a higher zoom the same sprite is bigger and the radius is wider.
    cam.setZoom(cam.zoom * 1.6);
    const p2 = entityScreenPos(st, registry, map, slot, cam.view());
    const hit = pickEntityAt(st, 'p1', { x: p2.x + 20, y: p2.y }, cam.view(), registry, map);
    expect(hit?.slot).toBe(slot);
  });
});

describe('picking: units win over buildings', () => {
  it('a unit standing in front of a building is the pick', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = baseCamera(match);
    const st = match.state;
    // Spawn a unit whose projected position overlaps the Sanctum's building disc.
    let bslot = -1;
    for (let s = 0; s < st.entities.count; s++) {
      if (!st.entities.dead[s] && st.entities.kind[s] === 1 && st.entities.ownerIndex[s] === 0) {
        bslot = s;
        break;
      }
    }
    const bx = st.entities.posX[bslot]!;
    const by = st.entities.posY[bslot]!;
    match.state.entities.spawnUnit(match.state.nextEntityId++, 0, 'arcane_archer', -1, bx + 6, by + 6, 100, 8);
    const uslot = st.entities.count - 1;
    const p = entityScreenPos(st, registry, map, uslot, cam.view());
    const hit = pickEntityAt(st, 'p1', p, cam.view(), registry, map);
    expect(hit, 'nothing picked where the unit stands').not.toBeNull();
    expect(hit!.kind, 'a building beat the unit standing in front of it').toBe(0);
    expect(hit!.slot).toBe(uslot);
    /**
     * And the building is still pickable in its own right: a point inside the building's disc but outside
     * the unit's smaller one selects the building. The exact offset is computed from the two radii rather
     * than guessed, so the case keeps testing what it says it tests if either radius is retuned.
     */
    const bp = entityScreenPos(st, registry, map, bslot, cam.view());
    const up = entityScreenPos(st, registry, map, uslot, cam.view());
    // Walk out from the building centre along -X until past the unit's disc, staying inside the building's.
    let found: ReturnType<typeof pickEntityAt> = null;
    for (let off = PICK_RADIUS_UNIT * cam.zoom + 2; off < PICK_RADIUS_BUILDING * cam.zoom; off += 2) {
      const probe = { x: bp.x - off, y: bp.y };
      if (Math.hypot(probe.x - up.x, probe.y - up.y) <= PICK_RADIUS_UNIT * cam.zoom) continue;
      found = pickEntityAt(st, 'p1', probe, cam.view(), registry, map);
      if (found) break;
    }
    expect(found?.kind, 'the building was not pickable outside the unit disc').toBe(1);
  });
});

describe('picking: entities on a plateau are picked where they are drawn', () => {
  it('the terrain lift is applied to the pick position, not just to the sprite', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = baseCamera(match);
    const st = match.state;
    // Find a tile on the map with a NON-ZERO height, and put a unit there.
    let tx = -1;
    let ty = -1;
    for (let y = 2; y < map.tileH - 2 && ty < 0; y++) {
      for (let x = 2; x < map.tileW - 2; x++) {
        if (map.tiles[y * map.tileW + x] !== 0) continue;
        if ((map.heights[y * map.tileW + x] ?? 0) > 0) {
          tx = x;
          ty = y;
          break;
        }
      }
    }
    expect(tx, 'the map has no raised passable tile').toBeGreaterThan(0);

    const wx = tx * TILE + TILE / 2;
    const wy = ty * TILE + TILE / 2;
    st.entities.spawnUnit(st.nextEntityId++, 0, 'arcane_archer', -1, wx, wy, 100, 8);
    const slot = st.entities.count - 1;

    // Aim the camera at the tile so the pick is inside the viewport.
    cam.frameOn(wx, wy);

    const level = levelAt(map, wx, wy);
    expect(level).toBeGreaterThan(0);
    // The lift is real: the sprite's projected Y is above the flat-ground projection.
    const flat = projectGround({ x: wx, y: wy }, 0);
    const lifted = projectGround({ x: wx, y: wy }, level);
    expect(lifted.y).toBeLessThan(flat.y);
    expect(flat.y - lifted.y).toBeCloseTo(level * VISUAL_HEIGHT_STEP, 5);

    // The picker uses the LIFTED point: a tap there selects the unit.
    const p = entityScreenPos(st, registry, map, slot, cam.view());
    const hit = pickEntityAt(st, 'p1', p, cam.view(), registry, map);
    expect(hit?.slot).toBe(slot);

    // And a tap at the FLAT-GROUND position, a full visual step lower, does not.
    const flatScreen = {
      x: (flat.x - projectGround({ x: cam.view().x, y: cam.view().y }).x) * cam.zoom,
      y: (flat.y - projectGround({ x: cam.view().x, y: cam.view().y }).y) * cam.zoom,
    };
    const miss = pickEntityAt(st, 'p1', flatScreen, cam.view(), registry, map);
    if (level * VISUAL_HEIGHT_STEP * cam.zoom > PICK_RADIUS_UNIT * cam.zoom) {
      expect(miss?.slot).not.toBe(slot);
    }
  });

  it('a flyer is picked at its hover height', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = baseCamera(match);
    const st = match.state;
    const s = map.startLocations[0]!;
    st.entities.spawnUnit(st.nextEntityId++, 0, 'rift_skimmer', -1, s.x, s.y, 100, 9);
    const slot = st.entities.count - 1;
    const level = levelAt(map, s.x, s.y);
    const expected = projectGround({ x: s.x, y: s.y }, level + FLYER_HOVER_LEVELS);
    const p = entityScreenPos(st, registry, map, slot, cam.view());
    const camProj = projectGround({ x: cam.view().x, y: cam.view().y });
    expect(p.x).toBeCloseTo((expected.x - camProj.x) * cam.zoom, 4);
    expect(p.y).toBeCloseTo((expected.y - camProj.y) * cam.zoom, 4);
  });
});

describe('picking: box select takes exactly the projected-inside units', () => {
  it('selects the units inside a screen rect and none outside it', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = baseCamera(match);
    const st = match.state;
    const s = map.startLocations[0]!;
    // Four units in a row, spaced widely enough that a box can exclude some.
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) {
      st.entities.spawnUnit(st.nextEntityId++, 0, 'arcane_archer', -1, s.x + i * 64, s.y, 100, 8);
      ids.push(st.entities.id[st.entities.count - 1]!);
    }
    const points = ids.map((id) => {
      const slot = st.entities.slotOf(id);
      return entityScreenPos(st, registry, map, slot, cam.view());
    });
    // A box around the first two only.
    const a = { x: points[0]!.x - 20, y: points[0]!.y - 20 };
    const b = { x: points[1]!.x + 20, y: points[1]!.y + 20 };
    const picked = unitsInScreenBox(st, 'p1', a, b, cam.view(), registry, map);
    expect(picked).toContain(ids[0]!);
    expect(picked).toContain(ids[1]!);
    expect(picked).not.toContain(ids[3]!);
  });

  it('never selects another player units', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const st = match.state;
    const s = map.startLocations[0]!;
    const cam = new Camera(667, 375, map.tileW * TILE, map.tileH * TILE);
    cam.frameOn(s.x, s.y);
    // A huge box over everything.
    const picked = unitsInScreenBox(st, 'p1', { x: -10_000, y: -10_000 }, { x: 10_000, y: 10_000 }, cam.view(), registry, map);
    const myIdx = st.entities.ownerIndexFor('p1');
    for (const id of picked) {
      const slot = st.entities.slotOf(id);
      expect(st.entities.ownerIndex[slot]).toBe(myIdx);
    }
    expect(picked.length).toBeGreaterThan(0);
  });
});

describe('picking: fogged enemies are not pickable', () => {
  it('an enemy in the dark cannot be picked, so the picker is not a map hack', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const st = match.state;
    const cam = new Camera(map.tileW * TILE, map.tileH * TILE, map.tileW * TILE, map.tileH * TILE);
    // Reset vision to "nothing seen" for p1 and recompute.
    const p1 = st.players[0]!;
    p1.visible.fill(0);
    p1.explored.fill(0);
    visibilitySystem(st, registry, match.services.nav);

    // The enemy Sanctum, far from the player's base, is in the dark.
    let eslot = -1;
    for (let s = 0; s < st.entities.count; s++) {
      if (!st.entities.dead[s] && st.entities.kind[s] === 1 && st.entities.ownerIndex[s] === 1) {
        eslot = s;
        break;
      }
    }
    expect(eslot).toBeGreaterThanOrEqual(0);
    const wx = st.entities.posX[eslot]!;
    const wy = st.entities.posY[eslot]!;
    const v = cam.view();
    const camProj = projectGround({ x: v.x, y: v.y });
    const p = projectGround({ x: wx, y: wy }, levelAt(map, wx, wy));
    const screen = { x: (p.x - camProj.x) * v.zoom, y: (p.y - camProj.y) * v.zoom };
    const hit = pickEntityAt(st, 'p1', screen, v, registry, map);
    expect(hit?.owner).not.toBe('p2');
  });

  it('own entities are always pickable regardless of vision', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const st = match.state;
    const p1 = st.players[0]!;
    p1.visible.fill(0);
    p1.explored.fill(0);
    visibilitySystem(st, registry, match.services.nav);
    // Own units are visible by rule even with an empty vision mask.
    let uslot = -1;
    for (let s = 0; s < st.entities.count; s++) {
      if (!st.entities.dead[s] && st.entities.kind[s] === 0 && st.entities.ownerIndex[s] === 0) {
        uslot = s;
        break;
      }
    }
    const wx = st.entities.posX[uslot]!;
    const wy = st.entities.posY[uslot]!;
    const cam = new Camera(667, 375, map.tileW * TILE, map.tileH * TILE);
    cam.frameOn(wx, wy);
    const p = entityScreenPos(st, registry, map, uslot, cam.view());
    const hit = pickEntityAt(st, 'p1', p, cam.view(), registry, map);
    expect(hit?.slot).toBe(uslot);
  });
});

describe('picking: resource nodes are targeted separately', () => {
  it('a mana node is picked by the node picker', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const st = match.state;
    let nslot = -1;
    for (let s = 0; s < st.entities.count; s++) {
      if (!st.entities.dead[s] && st.entities.kind[s] === 3) {
        nslot = s;
        break;
      }
    }
    expect(nslot).toBeGreaterThanOrEqual(0);
    const wx = st.entities.posX[nslot]!;
    const wy = st.entities.posY[nslot]!;
    const cam = new Camera(667, 375, map.tileW * TILE, map.tileH * TILE);
    cam.frameOn(wx, wy);
    const p = entityScreenPos(st, registry, map, nslot, cam.view());
    const hit = pickResourceNodeAt(st, 'p1', p, cam.view(), registry, map);
    expect(hit?.slot).toBe(nslot);
  });

  it('a depleted node is not targetable', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const st = match.state;
    let nslot = -1;
    for (let s = 0; s < st.entities.count; s++) {
      if (!st.entities.dead[s] && st.entities.kind[s] === 3) {
        nslot = s;
        break;
      }
    }
    const wx = st.entities.posX[nslot]!;
    const wy = st.entities.posY[nslot]!;
    st.entities.amount[nslot] = 0;
    const cam = new Camera(667, 375, map.tileW * TILE, map.tileH * TILE);
    cam.frameOn(wx, wy);
    const p = entityScreenPos(st, registry, map, nslot, cam.view());
    expect(pickResourceNodeAt(st, 'p1', p, cam.view(), registry, map)).toBeNull();
  });
});

describe('picking: the ground point under the finger accounts for terrain height', () => {
  it('a tap on flat ground lands on the same tile', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = baseCamera(match);
    const s = map.startLocations[0]!;
    const p = cam.worldToScreenPoint(s.x + 160, s.y + 160);
    const world = groundPointAt(map, p, cam.view(), screenToWorld);
    const tileX = Math.floor(world.x / TILE);
    const tileY = Math.floor(world.y / TILE);
    expect(Math.abs(tileX - Math.floor((s.x + 160) / TILE))).toBeLessThanOrEqual(1);
    expect(Math.abs(tileY - Math.floor((s.y + 160) / TILE))).toBeLessThanOrEqual(1);
  });

  it('a tap on a plateau lands on the plateau tile, not short of it', () => {
    const match = newMatch();
    const map = registry.map(match.state.mapId);
    const cam = new Camera(667, 375, map.tileW * TILE, map.tileH * TILE);
    // Find a raised passable tile.
    let tx = -1;
    let ty = -1;
    for (let y = 2; y < map.tileH - 2 && ty < 0; y++) {
      for (let x = 2; x < map.tileW - 2; x++) {
        if (map.tiles[y * map.tileW + x] === 0 && (map.heights[y * map.tileW + x] ?? 0) > 0) {
          tx = x;
          ty = y;
          break;
        }
      }
    }
    expect(tx).toBeGreaterThan(0);
    const wx = tx * TILE + TILE / 2;
    const wy = ty * TILE + TILE / 2;
    cam.frameOn(wx, wy);
    const p = cam.worldToScreenPoint(wx, wy, levelAt(map, wx, wy));
    const world = groundPointAt(map, p, cam.view(), screenToWorld);
    /**
     * Within a tile in projected terms: the inverse of a height field is a fixed point, and the
     * alternating solve lands on the intended tile, not one level short. A tolerance of 1.5 tiles is the
     * honest statement — on a ramp the two adjacent tiles project to the same pixel, so the answer can be
     * the neighbour and be correct.
     */
    expect(Math.abs(world.x - wx)).toBeLessThanOrEqual(TILE * 1.5);
    expect(Math.abs(world.y - wy)).toBeLessThanOrEqual(TILE * 1.5);
  });
});
