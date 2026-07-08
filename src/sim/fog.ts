// C&C Generals-style fog: the full map stays visible but grayed without line of sight.
// Terrain, obstacles, and mana nodes always show; enemy units need sight.
// Enemy buildings leave a frozen gray ghost after they are scouted.
// Radar reveals the minimap only while its building is powered (main view fog unchanged).
import { TILE } from '../core/constants';
import type { Registry } from '../data/registry';
import type { NavGrid } from './nav-grid';
import type { BuildingEntity } from './entity-types';
import type { GameState, Entity, Player, PlayerId, KnownBuilding } from './types';
import { entitiesSorted, getPlayer, isAlly, isAlive } from './queries';
import { buildingHasPower, isPowerShort } from './power';

export function createFogTiles(tileCount: number): number[] {
  return new Array(tileCount).fill(0);
}

/** True when the player has radar and the grid is not in low-power (RA2 radar shutdown). */
export function radarActive(state: GameState, registry: Registry, playerId: PlayerId): boolean {
  if (isPowerShort(state, playerId)) return false;
  for (const e of entitiesSorted(state)) {
    if (e.owner !== playerId || e.kind !== 'building' || !isAlive(e)) continue;
    if (e.buildProgress !== undefined || e.morphProgress !== undefined) continue;
    if (!registry.buildings.get(e.defId)?.isRadar) continue;
    return true;
  }
  return false;
}

/** Main-view fog — gray veil on tiles outside unit/building sight. */
export function isTileFogged(player: Player, tileIdx: number): boolean {
  return player.visible[tileIdx] === 0;
}

/** Minimap fog — mirrors main-map line of sight (radar enables the widget, not full intel). */
export function isMinimapTileFogged(player: Player, tileIdx: number, _radarOn: boolean): boolean {
  return player.visible[tileIdx] === 0;
}

function visionPartners(state: GameState, viewerId: PlayerId): PlayerId[] {
  const ids: PlayerId[] = [];
  for (const p of state.players) {
    if (p.defeated) continue;
    if (p.id === viewerId || isAlly(state, viewerId, p.id)) ids.push(p.id);
  }
  return ids;
}

function sightOfEntity(registry: Registry, e: Entity): number {
  if (e.kind === 'unit') return registry.units.get(e.defId)?.sight ?? 128;
  if (e.kind === 'building') return registry.buildings.get(e.defId)?.sight ?? 160;
  return 0;
}

function revealSight(
  nav: NavGrid,
  explored: number[],
  visible: number[],
  x: number,
  y: number,
  sight: number,
): void {
  if (sight <= 0) return;
  const minTx = Math.max(0, Math.floor((x - sight) / TILE));
  const maxTx = Math.min(nav.w - 1, Math.floor((x + sight) / TILE));
  const minTy = Math.max(0, Math.floor((y - sight) / TILE));
  const maxTy = Math.min(nav.h - 1, Math.floor((y + sight) / TILE));
  const sightSq = sight * sight;

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      const dx = cx - x;
      const dy = cy - y;
      if (dx * dx + dy * dy > sightSq) continue;
      const i = ty * nav.w + tx;
      explored[i] = 1;
      visible[i] = 1;
    }
  }
}

function isSightSource(state: GameState, registry: Registry, e: Entity): boolean {
  if (!isAlive(e) || e.kind === 'projectile' || e.kind === 'resource_node') return false;
  if (e.kind === 'unit' && e.garrisonedIn !== undefined) return false;
  if (e.kind === 'building') {
    if (e.buildProgress !== undefined || e.morphProgress !== undefined) return false;
    if (!buildingHasPower(state, registry, e)) return false;
  }
  return sightOfEntity(registry, e) > 0;
}

export function visibilitySystem(state: GameState, registry: Registry, nav: NavGrid): void {
  for (const player of state.players) {
    if (player.defeated) continue;
    player.visible.fill(0);

    const partners = visionPartners(state, player.id);
    for (const e of entitiesSorted(state)) {
      if (!partners.includes(e.owner)) continue;
      if (!isSightSource(state, registry, e)) continue;
      revealSight(nav, player.explored, player.visible, e.pos.x, e.pos.y, sightOfEntity(registry, e));
    }

    updateKnownBuildings(state, registry, nav, player);
  }
}

function isEnemyOwner(state: GameState, viewerId: PlayerId, owner: PlayerId): boolean {
  if (owner === viewerId || owner === 'neutral') return false;
  return !isAlly(state, viewerId, owner);
}

function snapshotBuilding(e: BuildingEntity): KnownBuilding {
  return {
    id: e.id,
    owner: e.owner,
    defId: e.defId,
    x: e.pos.x,
    y: e.pos.y,
    hp: e.hp,
    maxHp: e.maxHp,
    radius: e.radius,
    buildProgress: e.buildProgress,
  };
}

/** True when a building is in current unit/building sight (not radar). */
export function isBuildingInLiveSight(
  state: GameState,
  _registry: Registry,
  viewerId: PlayerId,
  building: Entity,
  nav: NavGrid,
): boolean {
  if (building.kind !== 'building') return false;
  if (!isEnemyOwner(state, viewerId, building.owner)) return true;
  const viewer = getPlayer(state, viewerId);
  if (!viewer) return false;
  return isTileVisible(viewer, building.pos.x, building.pos.y, nav);
}

function updateKnownBuildings(
  state: GameState,
  registry: Registry,
  nav: NavGrid,
  player: Player,
): void {
  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'building' || !isAlive(e)) continue;
    if (!isEnemyOwner(state, player.id, e.owner)) continue;
    if (isBuildingInLiveSight(state, registry, player.id, e, nav)) {
      player.knownBuildings[e.id] = snapshotBuilding(e);
    }
  }

  for (const id of Object.keys(player.knownBuildings).map(Number)) {
    const known = player.knownBuildings[id]!;
    if (!isTileVisible(player, known.x, known.y, nav)) continue;
    const e = state.entities.get(id);
    if (!e || e.kind !== 'building' || !isAlive(e)) delete player.knownBuildings[id];
  }
}

/** Enemy building ghosts shown while out of sight (or after destruction until re-scouted). */
export function listBuildingGhosts(
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid,
): KnownBuilding[] {
  const viewer = getPlayer(state, viewerId);
  if (!viewer) return [];
  const ghosts: KnownBuilding[] = [];
  for (const known of Object.values(viewer.knownBuildings)) {
    const e = state.entities.get(known.id);
    if (e && isBuildingInLiveSight(state, registry, viewerId, e, nav)) continue;
    ghosts.push(known);
  }
  return ghosts;
}

export function isTileExplored(player: Player, tx: number, ty: number, nav: NavGrid, radarOn = false): boolean {
  if (!nav.inBounds(tx, ty)) return false;
  const i = ty * nav.w + tx;
  return player.explored[i] === 1 || radarOn;
}

export function isTileVisible(player: Player, x: number, y: number, nav: NavGrid): boolean {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (!nav.inBounds(tx, ty)) return false;
  return player.visible[ty * nav.w + tx] === 1;
}

/** Whether a viewer has line-of-sight on a world point (VFX, audio, UI gating). */
export function isWorldPointVisible(
  state: GameState,
  viewerId: PlayerId,
  x: number,
  y: number,
  nav: NavGrid,
): boolean {
  const viewer = getPlayer(state, viewerId);
  if (!viewer) return false;
  return isTileVisible(viewer, x, y, nav);
}

export function isVisibleTo(
  state: GameState,
  viewerId: PlayerId,
  entity: Entity,
  nav: NavGrid,
): boolean {
  if (entity.owner === viewerId) return true;
  if (entity.owner !== 'neutral' && isAlly(state, viewerId, entity.owner)) return true;
  const viewer = getPlayer(state, viewerId);
  if (!viewer) return false;

  // Static map features (mana nodes) are always visible through fog.
  if (entity.kind === 'resource_node') return true;

  return isTileVisible(viewer, entity.pos.x, entity.pos.y, nav);
}

/** True when the viewer can see a mana node's reserve level (ring, bar, % label). */
export function isNodeIntelVisible(
  state: GameState,
  viewerId: PlayerId,
  entity: Entity,
  nav: NavGrid,
): boolean {
  if (entity.kind !== 'resource_node') return true;
  const viewer = getPlayer(state, viewerId);
  if (!viewer) return false;
  return isTileVisible(viewer, entity.pos.x, entity.pos.y, nav);
}

/** Minimap entity visibility — same line-of-sight rules as the main map. */
export function isVisibleOnMinimap(
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  entity: Entity,
  nav: NavGrid,
): boolean {
  if (entity.kind === 'projectile') return false;
  void registry;
  return isVisibleTo(state, viewerId, entity, nav);
}

/** True when the viewer should see the full live map (post-game or dead-spectator mode). */
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
