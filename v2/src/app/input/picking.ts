// SCREEN-SPACE PICKING — what did the finger actually touch?
//
// WHY NOT WORLD-SPACE. A world-space radius test (`distance(entity, worldPoint) < 26`) is what v2
// shipped first, and it is wrong for the same reason v1 documented before it: the projection squashes
// Y by 4 and X by 2, so a "circle" in world space is a flat diamond on screen. On a phone that made
// taps near a sprite's top edge miss and taps well below a unit select it — the exact "I tapped that
// and it picked something else" complaint.
//
// So picking is done on the PROJECTED sprite position, with a screen-space radius scaled by zoom. The
// lift from a unit's height level is applied identically to the renderer's, using the same
// `VISUAL_HEIGHT_STEP`, or a unit standing on a plateau would be picked from its feet position.
//
// Scoring prefers units over buildings over nodes, then nearest — the RTS convention. A unit standing
// in front of a building must win the tap, or you cannot select an army parked in your own base.

import { TILE } from '../../core/constants';
import { FLYER_HOVER_LEVELS, projectGround, worldToScreen, type CameraView } from '../../core/projection';
import type { Vec2 } from '../../core/math';
import type { Registry } from '../../data/registry';
import type { MapData } from '../../data/defs';
import type { GameState, EntityId, PlayerId } from '../../sim/types';
import { KIND_BUILDING, KIND_RESOURCE_NODE, KIND_UNIT, STATE_GARRISONED } from '../../sim/entity-store';
import { isVisibleTo } from '../../sim/fog';

/** Screen radius a tap can land within, before zoom, in CSS pixels. */
export const PICK_RADIUS_UNIT = 26;
export const PICK_RADIUS_BUILDING = 30;
export const PICK_RADIUS_NODE = 28;

/** Visual height level of a world position, from the map's tile heights. */
export function levelAt(map: MapData, x: number, y: number): number {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return 0;
  return map.heights[ty * map.tileW + tx] ?? 0;
}

function hoverFor(registry: Registry, store: GameState['entities'], slot: number): number {
  if (store.kind[slot] !== KIND_UNIT) return 0;
  const defId = store.extras[slot]!.defId;
  return registry.units.get(defId)?.mobility === 'air' ? FLYER_HOVER_LEVELS : 0;
}

/** Projected screen position of an entity slot, including its terrain lift and flyer hover. */
export function entityScreenPos(
  state: GameState,
  registry: Registry,
  map: MapData,
  slot: number,
  cam: CameraView,
): Vec2 {
  const store = state.entities;
  const level = levelAt(map, store.posX[slot]!, store.posY[slot]!);
  return worldToScreen(
    { x: store.posX[slot]!, y: store.posY[slot]! },
    cam,
    level + hoverFor(registry, store, slot),
  );
}

export interface PickResult {
  id: EntityId;
  slot: number;
  kind: number;
  owner: PlayerId;
}

/** Nearest pickable entity under a screen point, or null. */
export function pickEntityAt(
  state: GameState,
  viewer: PlayerId,
  screen: Vec2,
  cam: CameraView,
  registry: Registry,
  map: MapData,
): PickResult | null {
  const store = state.entities;
  let best: PickResult | null = null;
  let bestScore = -Infinity;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    const kind = store.kind[slot]!;
    if (kind !== KIND_UNIT && kind !== KIND_BUILDING && kind !== KIND_RESOURCE_NODE) continue;
    if (kind === KIND_UNIT && store.state[slot] === STATE_GARRISONED) continue;
    if (kind === KIND_RESOURCE_NODE && store.amount[slot]! <= 0) continue;
    if (!isVisibleTo(state, viewer, slot, { w: map.tileW, h: map.tileH })) continue;
    const s = entityScreenPos(state, registry, map, slot, cam);
    const dx = screen.x - s.x;
    const dy = screen.y - s.y;
    const base =
      kind === KIND_UNIT ? PICK_RADIUS_UNIT : kind === KIND_BUILDING ? PICK_RADIUS_BUILDING : PICK_RADIUS_NODE;
    const r = base * cam.zoom;
    const d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    // Kind weight dominates distance so a unit in front of a building always wins.
    const kindWeight = kind === KIND_UNIT ? 1000 : kind === KIND_BUILDING ? 500 : 100;
    const score = kindWeight - Math.sqrt(d2);
    if (score > bestScore) {
      bestScore = score;
      best = { id: store.id[slot]!, slot, kind, owner: store.ownerId(store.ownerIndex[slot]!) };
    }
  }
  return best;
}

/** Resource node under a screen point (harvest targeting, which must prefer nodes over buildings). */
export function pickResourceNodeAt(
  state: GameState,
  viewer: PlayerId,
  screen: Vec2,
  cam: CameraView,
  registry: Registry,
  map: MapData,
): PickResult | null {
  const store = state.entities;
  let best: PickResult | null = null;
  let bestD = Infinity;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_RESOURCE_NODE) continue;
    if (store.amount[slot]! <= 0) continue;
    if (!isVisibleTo(state, viewer, slot, { w: map.tileW, h: map.tileH })) continue;
    const s = entityScreenPos(state, registry, map, slot, cam);
    const dx = screen.x - s.x;
    const dy = screen.y - s.y;
    const r = PICK_RADIUS_NODE * cam.zoom;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r * r && d2 < bestD) {
      bestD = d2;
      best = { id: store.id[slot]!, slot, kind: KIND_RESOURCE_NODE, owner: '' };
    }
  }
  return best;
}

/**
 * Own units whose projected position falls inside a screen-space drag box.
 *
 * `additive` lets a box extend a selection (shift-drag on desktop, or a second box on a phone held in
 * select-drag mode). Selection is by PROJECTED position for the same reason picking is.
 */
export function unitsInScreenBox(
  state: GameState,
  owner: PlayerId,
  a: Vec2,
  b: Vec2,
  cam: CameraView,
  registry: Registry,
  map: MapData,
): EntityId[] {
  const store = state.entities;
  const minSX = Math.min(a.x, b.x);
  const maxSX = Math.max(a.x, b.x);
  const minSY = Math.min(a.y, b.y);
  const maxSY = Math.max(a.y, b.y);
  const out: EntityId[] = [];
  const ownerIdx = store.ownerIndexFor(owner);
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    if (store.ownerIndex[slot] !== ownerIdx) continue;
    if (store.state[slot] === STATE_GARRISONED) continue;
    const s = entityScreenPos(state, registry, map, slot, cam);
    if (s.x >= minSX && s.x <= maxSX && s.y >= minSY && s.y <= maxSY) out.push(store.id[slot]!);
  }
  return out;
}

/** Screen-space drag box from two viewport points, normalised. */
export function normaliseBox(a: Vec2, b: Vec2): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/**
 * World point under a screen position, accounting for the ground height at that point.
 *
 * `screenToWorld` assumes a flat plane; on a plateau the inverse lands short of the real tile. Two
 * refinement passes converge to within a tile on every map in the content set, which is all a
 * command needs (the sim snaps builds to tiles itself). This mirrors the v2 picker's height lift
 * rather than inventing a second convention.
 */
export function groundPointAt(
  map: MapData,
  screen: Vec2,
  cam: CameraView,
  screenToWorldFn: (p: Vec2, c: CameraView, visualHeight?: number) => Vec2,
): Vec2 {
  let level = 0;
  let world = screenToWorldFn(screen, cam, 0);
  /**
   * The projection lifts the SPRITE by level*VISUAL_HEIGHT_STEP, so the inverse must subtract the same
   * lift: a point on a plateau is drawn higher on screen than its ground position would be, and reading
   * the level at the FLAT solution therefore lands one tile short. Alternating "read the level here,
   * re-solve with that lift" converges in two steps on every map in the content set. Six passes is a
   * safety margin, not a requirement — it exits early on a fixed point.
   */
  for (let i = 0; i < 6; i++) {
    const next = levelAt(map, world.x, world.y);
    if (next === level) break;
    level = next;
    world = screenToWorldFn(screen, cam, level);
  }
  return world;
}

/** World position at the centre of a projected sprite, for effects that must sit on the sprite. */
export function spriteWorldPoint(map: MapData, x: number, y: number): Vec2 {
  const p = projectGround({ x, y }, levelAt(map, x, y));
  return p;
}
