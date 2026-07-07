// C&C Generals-style fog: the full map stays visible but grayed without line of sight.
// Terrain, obstacles, and mana nodes always show; enemy units/buildings need sight.
// Radar reveals the full map only while its building is powered.
import { TILE } from '../core/constants';
import type { Registry } from '../data/registry';
import type { NavGrid } from './nav-grid';
import type { GameState, Entity, Player, PlayerId } from './types';
import { entitiesSorted, getPlayer, isAlly, isAlive } from './queries';
import { buildingHasPower } from './power';

export function createFogTiles(tileCount: number): number[] {
  return new Array(tileCount).fill(0);
}

/** True when the player has a completed, powered radar structure (RA2 radar online). */
export function radarActive(state: GameState, registry: Registry, playerId: PlayerId): boolean {
  for (const e of entitiesSorted(state)) {
    if (e.owner !== playerId || e.kind !== 'building' || !isAlive(e)) continue;
    if (e.buildProgress !== undefined || e.morphProgress !== undefined) continue;
    if (!registry.buildings.get(e.defId)?.isRadar) continue;
    if (buildingHasPower(state, registry, e)) return true;
  }
  return false;
}

/** True when a tile is outside current sight and not revealed by radar. */
export function isTileFogged(player: Player, tileIdx: number, radarOn: boolean): boolean {
  return !radarOn && player.visible[tileIdx] === 0;
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
  }
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
