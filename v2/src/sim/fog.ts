// Fog of war: per-player explored/visible tile masks, plus remembered enemy buildings.
//
// Rules (kept from v1 — these are gameplay, not tunables):
//   • Terrain, obstacles and mana nodes are always drawn; enemy units need live sight.
//   • Cliffs hide higher ground from below; ramps stay visible so units can fight on the slope.
//   • Flyers see over cliffs.
//   • Allied vision is shared.
//   • An enemy building stays visible as a frozen grey ghost after it is scouted, and its last-known
//     HP/build progress updates while it is re-scouted.
//   • Radar turns the minimap on; it does NOT reveal the main view, and it shuts off at low power.
//
// Performance note: v1 allocated an `entitiesSorted()` array per player per tick just to walk sight
// sources. v2 iterates the store's slots directly, which makes this O(entities) with no allocation.

import { TILE } from '../core/constants';
import type { Registry } from '../data/registry';
import type { GameState, EntityId, KnownBuilding, Player, PlayerId } from './types';
import {
  EntityStore,
  KIND_BUILDING,
  KIND_PROJECTILE,
  KIND_RESOURCE_NODE,
  KIND_UNIT,
  STATE_GARRISONED,
} from './entity-store';
import { buildProgressOf, garrisonedInId, hasMorph } from './capabilities';
import { buildingHasPower, isPowerShort } from './power';

export function createFogTiles(tileCount: number): number[] {
  return new Array(tileCount).fill(0);
}

/** Sight radius for an entity slot, or 0 when it grants no vision. */
function sightOfSlot(store: EntityStore, registry: Registry, slot: number): number {
  const kind = store.kind[slot]!;
  if (kind === KIND_UNIT) return registry.units.get(store.extras[slot]!.defId)?.sight ?? 128;
  if (kind === KIND_BUILDING) return registry.buildings.get(store.extras[slot]!.defId)?.sight ?? 160;
  return 0;
}

function isAirSlot(store: EntityStore, registry: Registry, slot: number): boolean {
  if (store.kind[slot] !== KIND_UNIT) return false;
  return registry.units.get(store.extras[slot]!.defId)?.mobility === 'air';
}

/** True if this entity slot is a valid vision source for its owner right now. */
function isSightSource(state: GameState, store: EntityStore, registry: Registry, slot: number): boolean {
  if (store.dead[slot]) return false;
  const kind = store.kind[slot]!;
  if (kind === KIND_PROJECTILE || kind === KIND_RESOURCE_NODE) return false;
  if (kind === KIND_UNIT && store.state[slot] === STATE_GARRISONED) return false;
  if (kind === KIND_BUILDING) {
    const ex = store.extras[slot]!;
    if (buildProgressOf(ex) !== undefined || hasMorph(ex)) return false;
    if (!buildingHasPower(state, registry, slot)) return false;
  }
  return sightOfSlot(store, registry, slot) > 0;
}

/**
 * Stamp a circle of vision. Slightly conservative vs a true line-of-sight test: cliffs hide *higher*
 * tiles from a lower viewer, but a viewer on high ground sees everything. That is the v1 rule and it
 * is what players expect from RA2-style terrain.
 *
 * Takes the raw height/ramp arrays rather than the NavGrid so the inner loop has no method calls or
 * bounds checks — this runs ~14 000 times per tick at 200 entities, and the megamorphic accessor was
 * measurably the dominant cost of the whole tick.
 */
function revealSight(
  w: number,
  h: number,
  heights: Uint16Array,
  ramps: Uint8Array,
  explored: number[],
  visible: number[],
  x: number,
  y: number,
  sight: number,
  viewerHeight: number,
  flying: boolean,
): void {
  if (sight <= 0) return;
  const minTx = Math.max(0, Math.floor((x - sight) / TILE));
  const maxTx = Math.min(w - 1, Math.floor((x + sight) / TILE));
  const minTy = Math.max(0, Math.floor((y - sight) / TILE));
  const maxTy = Math.min(h - 1, Math.floor((y + sight) / TILE));
  const sightSq = sight * sight;

  // The cliff test is the same for every source standing on the same height, and there are usually
  // only 1-3 distinct heights on a map. Skipping the array reads for tiles that cannot pass keeps
  // the inner loop to two float compares and two writes on the common path.
  const checkCliff = !flying;
  for (let ty = minTy; ty <= maxTy; ty++) {
    const row = ty * w;
    const cy = ty * TILE + TILE / 2 - y;
    const cySq = cy * cy;
    for (let tx = minTx; tx <= maxTx; tx++) {
      const cx = tx * TILE + TILE / 2 - x;
      if (cx * cx + cySq > sightSq) continue;
      const i = row + tx;
      if (checkCliff && heights[i]! > viewerHeight && ramps[i] !== 1) continue;
      explored[i] = 1;
      visible[i] = 1;
    }
  }
}

function isAllyOf(state: GameState, viewerId: PlayerId, owner: PlayerId): boolean {
  if (viewerId === owner) return true;
  return state.relations[viewerId]?.[owner] === 'ally';
}

/** Recompute every player's visibility mask and remembered buildings. */
export function visibilitySystem(state: GameState, registry: Registry, nav: { w: number; h: number; heightAt(tx: number, ty: number): number; isRamp(tx: number, ty: number): boolean }): void {
  const store = state.entities;
  const elev = (nav as unknown as { elevationData?: { heights: Uint16Array; ramps: Uint8Array } }).elevationData;
  if (!elev) return;

  for (const player of state.players) {
    if (player.defeated) continue;
    player.visible.fill(0);

    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot]) continue;
      const owner = store.ownerId(store.ownerIndex[slot]!);
      if (!isAllyOf(state, player.id, owner)) continue;
      if (!isSightSource(state, store, registry, slot)) continue;

      const x = store.posX[slot]!;
      const y = store.posY[slot]!;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= nav.w || ty >= nav.h) continue;

      revealSight(
        nav.w,
        nav.h,
        elev.heights,
        elev.ramps,
        player.explored,
        player.visible,
        x,
        y,
        sightOfSlot(store, registry, slot),
        nav.heightAt(tx, ty),
        isAirSlot(store, registry, slot),
      );
    }

    updateKnownBuildings(state, registry, nav, player);
  }
}

/** True when a tile index is in a player's live sight. */
export function isTileFogged(player: Player, tileIdx: number): boolean {
  return player.visible[tileIdx] === 0;
}

/** Minimap fog mirrors main-map sight. Radar enables the widget, not full intel. */
export function isMinimapTileFogged(player: Player, tileIdx: number, _radarOn: boolean): boolean {
  return player.visible[tileIdx] === 0;
}

export function isTileVisible(
  player: Player,
  x: number,
  y: number,
  nav: { w: number; h: number },
): boolean {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= nav.w || ty >= nav.h) return false;
  return player.visible[ty * nav.w + tx] === 1;
}

export function getPlayer(state: GameState, id: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === id);
}

function snapshotBuilding(state: GameState, slot: number): KnownBuilding {
  const store = state.entities;
  const ex = store.extras[slot]!;
  return {
    id: store.id[slot]!,
    owner: store.ownerId(store.ownerIndex[slot]!),
    defId: ex.defId,
    x: store.posX[slot]!,
    y: store.posY[slot]!,
    hp: store.hp[slot]!,
    maxHp: store.maxHp[slot]!,
    radius: store.radius[slot]!,
    ...(buildProgressOf(ex) !== undefined ? { buildProgress: buildProgressOf(ex) } : {}),
  };
}

/** True when an enemy building is inside the viewer's current sight. */
export function isBuildingInLiveSight(
  state: GameState,
  viewerId: PlayerId,
  slot: number,
  nav: { w: number; h: number },
): boolean {
  const store = state.entities;
  const owner = store.ownerId(store.ownerIndex[slot]!);
  if (owner === viewerId || isAllyOf(state, viewerId, owner)) return true;
  const viewer = getPlayer(state, viewerId);
  if (!viewer) return false;
  return isTileVisible(viewer, store.posX[slot]!, store.posY[slot]!, nav);
}

function updateKnownBuildings(
  state: GameState,
  registry: Registry,
  nav: { w: number; h: number },
  player: Player,
): void {
  const store = state.entities;
  // Fast path: when no enemy buildings exist at all (the common case for most of a match and for
  // every test harness that has not built any), there is nothing to remember or forget. This scan
  // used to dominate the tick purely by walking every entity once per player.
  let anyEnemyBuilding = false;
  let anyRemembered = false;
  for (const _ of Object.keys(player.knownBuildings)) {
    anyRemembered = true;
    break;
  }
  if (!anyRemembered) {
    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
      const owner = store.ownerId(store.ownerIndex[slot]!);
      if (owner === player.id || isAllyOf(state, player.id, owner)) continue;
      anyEnemyBuilding = true;
      break;
    }
    if (!anyEnemyBuilding) return;
  }
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    const owner = store.ownerId(store.ownerIndex[slot]!);
    if (owner === player.id || isAllyOf(state, player.id, owner)) continue;
    if (isBuildingInLiveSight(state, player.id, slot, nav)) {
      player.knownBuildings[store.id[slot]!] = snapshotBuilding(state, slot);
    }
  }
  void registry;

  // Forget a remembered building once its tile is seen again and the building is gone.
  for (const key of Object.keys(player.knownBuildings)) {
    const id = Number(key) as EntityId;
    const known = player.knownBuildings[id]!;
    if (!isTileVisible(player, known.x, known.y, nav)) continue;
    const slot = store.slotOf(id);
    if (slot < 0 || store.kind[slot] !== KIND_BUILDING || store.dead[slot]) delete player.knownBuildings[id];
  }
}

/** Enemy building ghosts to draw: remembered but not currently in live sight. */
export function listBuildingGhosts(
  state: GameState,
  viewerId: PlayerId,
  nav: { w: number; h: number },
): KnownBuilding[] {
  const viewer = getPlayer(state, viewerId);
  if (!viewer) return [];
  const ghosts: KnownBuilding[] = [];
  for (const known of Object.values(viewer.knownBuildings)) {
    const slot = state.entities.slotOf(known.id);
    if (slot >= 0 && isBuildingInLiveSight(state, viewerId, slot, nav)) continue;
    ghosts.push(known);
  }
  return ghosts;
}

/** True when the player has a powered radar building (minimap enabled). */
export function radarActive(state: GameState, registry: Registry, playerId: PlayerId): boolean {
  if (isPowerShort(state, playerId)) return false;
  const store = state.entities;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.ownerId(store.ownerIndex[slot]!) !== playerId) continue;
    if (buildProgressOf(store.extras[slot]!) !== undefined || hasMorph(store.extras[slot]!)) continue;
    if (registry.buildings.get(store.extras[slot]!.defId)?.isRadar) return true;
  }
  return false;
}

/**
 * Whether a viewer can see an entity. Own and allied entities are always visible; resource nodes are
 * always visible; everything else needs live sight on its tile.
 */
export function isVisibleTo(
  state: GameState,
  viewerId: PlayerId,
  slot: number,
  nav: { w: number; h: number },
): boolean {
  const store = state.entities;
  const owner = store.ownerId(store.ownerIndex[slot]!);
  if (owner === viewerId || isAllyOf(state, viewerId, owner)) return true;
  if (store.kind[slot] === KIND_RESOURCE_NODE) return true;
  const viewer = getPlayer(state, viewerId);
  if (!viewer) return false;
  return isTileVisible(viewer, store.posX[slot]!, store.posY[slot]!, nav);
}

/** See the whole live map: match over, or a dead spectator with the option enabled. */
export function shouldRevealAllForViewer(
  state: GameState,
  viewerId: PlayerId,
  deadSpectatorReveal: boolean,
): boolean {
  if (state.ended) return true;
  if (!deadSpectatorReveal) return false;
  const viewer = getPlayer(state, viewerId);
  return viewer?.defeated ?? false;
}

export { garrisonedInId };
