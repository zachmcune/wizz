// Shared deterministic AI utilities used by all strategies.
import { TILE } from '../core/constants';
import { buildingPlacementSpacing } from '../core/placement-spacing';
import type { SimServices } from '../sim/context';
import type { GameState, Entity, EntityId, PlayerId } from '../sim/types';
import type { BuildingEntity, ResourceNodeEntity, UnitEntity } from '../sim/entity-types';
import { ownedBy, buildingsOf, isEnemy, isAlive } from '../sim/queries';
import { canBuildNearBase } from '../sim/build-zone';
import { footprintOverlapsNode } from '../sim/resource-nodes';
import { distSq, len } from '../sim/math';
import { canUnitGarrison, garrisonFreeCapacity } from '../sim/garrison';

export function hasBuilding(state: GameState, owner: PlayerId, defId: string): boolean {
  return ownedBy(state, owner).some((e) => e.kind === 'building' && e.defId === defId && e.state !== 'dead');
}

export function findSanctum(state: GameState, owner: PlayerId): BuildingEntity | null {
  return buildingsOf(state, owner).find((b) => b.defId === 'sanctum') ?? null;
}

export function findEnemySanctum(state: GameState, owner: PlayerId): BuildingEntity | null {
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (e.kind === 'building' && e.defId === 'sanctum' && isAlive(e) && isEnemy(state, owner, e.owner)) {
      return e;
    }
  }
  return null;
}

export function findPlacement(
  state: GameState,
  services: SimServices,
  owner: PlayerId,
  cx: number,
  cy: number,
  defId: string,
): { x: number; y: number } | null {
  const nav = services.nav;
  const def = services.registry.buildings.get(defId);
  if (!def) return null;
  const footprint = def.footprint;
  const spacing = buildingPlacementSpacing(def);
  const ctx = Math.floor(cx / TILE);
  const cty = Math.floor(cy / TILE);
  for (let ring = 2; ring <= 10; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const tx = ctx + dx;
        const ty = cty + dy;
        if (
          nav.canPlace(tx, ty, footprint, spacing) &&
          !footprintOverlapsNode(state, tx, ty, footprint) &&
          canBuildNearBase(state, services, owner, tx, ty, footprint)
        ) {
          return { x: (tx + footprint / 2) * TILE, y: (ty + footprint / 2) * TILE };
        }
      }
    }
  }
  return null;
}

export function idleCombat(combat: UnitEntity[]): EntityId[] {
  return combat.filter((e) => isAlive(e) && e.orders.length === 0 && e.state === 'idle').map((e) => e.id);
}

export function enemiesNear(state: GameState, owner: PlayerId, x: number, y: number, radius: number): Entity[] {
  const r2 = radius * radius;
  const out: Entity[] = [];
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (e.kind !== 'unit' || !isAlive(e) || !isEnemy(state, owner, e.owner)) continue;
    if (distSq(e.pos.x, e.pos.y, x, y) <= r2) out.push(e);
  }
  return out;
}

export function nearestNode(state: GameState, unit: UnitEntity): ResourceNodeEntity | null {
  let best: ResourceNodeEntity | null = null;
  let bestD = Infinity;
  for (const n of state.entities.values()) {
    if (n.kind !== 'resource_node' || n.amount <= 0) continue;
    const d = len(n.pos.x - unit.pos.x, n.pos.y - unit.pos.y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

export function nearestEnemyBuilding(
  state: GameState,
  owner: PlayerId,
  from: { x: number; y: number },
  attackBias: Record<string, number>,
): BuildingEntity | null {
  let best: BuildingEntity | null = null;
  let bestScore = Infinity;
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (e.kind !== 'building' || !isAlive(e) || !isEnemy(state, owner, e.owner)) continue;
    const d = len(e.pos.x - from.x, e.pos.y - from.y);
    const bias = attackBias[e.defId] ?? 0;
    const score = d + bias;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

export function pickAttackTarget(
  state: GameState,
  owner: PlayerId,
  from: { x: number; y: number },
  attackBias: Record<string, number>,
): BuildingEntity | null {
  const enemyHq = findEnemySanctum(state, owner);
  if (enemyHq) return enemyHq;
  return nearestEnemyBuilding(state, owner, from, attackBias);
}

export function garrisonNearbyUnits(
  state: GameState,
  services: SimServices,
  owner: PlayerId,
  unitDefId: string,
  radius: number,
  cmds: import('../sim/types').Command[],
): void {
  const bunkers = buildingsOf(state, owner).filter(
    (b) => b.buildProgress === undefined && services.registry.buildings.get(b.defId)?.garrison && garrisonFreeCapacity(services.registry, b) > 0,
  );
  if (!bunkers.length) return;
  for (const bunker of bunkers) {
    const ids: EntityId[] = [];
    for (const unit of ownedBy(state, owner)) {
      if (ids.length >= garrisonFreeCapacity(services.registry, bunker)) break;
      if (unit.kind !== 'unit' || unit.defId !== unitDefId || unit.orders.length > 0 || unit.state !== 'idle') continue;
      if (!canUnitGarrison(services.registry, unit, bunker)) continue;
      if (distSq(unit.pos.x, unit.pos.y, bunker.pos.x, bunker.pos.y) > radius * radius) continue;
      ids.push(unit.id);
    }
    if (ids.length) {
      cmds.push({ type: 'garrison', playerId: owner, unitIds: ids, buildingId: bunker.id });
      return;
    }
  }
}
