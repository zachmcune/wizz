// Red Alert 2-style fog of war: shroud (unexplored), fog (explored but not seen), visible.
// Radar permanently removes shroud from the entire map once built.
import { TILE } from '../core/constants';
import type { Registry } from '../data/registry';
import type { NavGrid } from './nav-grid';
import type { GameState, Entity, Player, PlayerId } from './types';
import { entitiesSorted, getPlayer, isAlly, isAlive } from './queries';
import { buildingHasPower } from './power';

export function createFogTiles(tileCount: number): number[] {
  return new Array(tileCount).fill(0);
}

export function revealEntireMap(player: Player): void {
  player.explored.fill(1);
}

export function syncRadarFromTech(state: GameState, registry: Registry): void {
  for (const p of state.players) {
    if (p.hasRadar) continue;
    for (const defId of p.unlockedTech) {
      if (registry.buildings.get(defId)?.isRadar) {
        p.hasRadar = true;
        revealEntireMap(p);
        break;
      }
    }
  }
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

    if (player.hasRadar) player.explored.fill(1);

    const partners = visionPartners(state, player.id);
    for (const e of entitiesSorted(state)) {
      if (!partners.includes(e.owner)) continue;
      if (!isSightSource(state, registry, e)) continue;
      revealSight(nav, player.explored, player.visible, e.pos.x, e.pos.y, sightOfEntity(registry, e));
    }
  }
}

export function isTileExplored(player: Player, tx: number, ty: number, nav: NavGrid): boolean {
  if (!nav.inBounds(tx, ty)) return false;
  return player.explored[ty * nav.w + tx] === 1;
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

  if (entity.kind === 'resource_node') {
    const tx = Math.floor(entity.pos.x / TILE);
    const ty = Math.floor(entity.pos.y / TILE);
    return isTileExplored(viewer, tx, ty, nav);
  }

  return isTileVisible(viewer, entity.pos.x, entity.pos.y, nav);
}

export function onRadarBuilt(player: Player): void {
  player.hasRadar = true;
  revealEntireMap(player);
}
