// Shared deterministic AI utilities used by all strategies.
import { TILE } from '../core/constants';
import { buildingPlacementSpacing } from '../core/placement-spacing';
import type { Registry } from '../data/registry';
import type { SimServices } from '../sim/context';
import type { GameState, Entity, EntityId, PlayerId } from '../sim/types';
import { isCombatUnit, isHarvester } from '../sim/types';
import type { BuildingEntity, ResourceNodeEntity, UnitEntity } from '../sim/entity-types';
import { ownedBy, buildingsOf, isEnemy, isAlive } from '../sim/queries';
import { canBuildNearBase } from '../sim/build-zone';
import { footprintOverlapsNode } from '../sim/resource-nodes';
import { distSq, len } from '../sim/math';
import { canUnitGarrison, garrisonFreeCapacity } from '../sim/garrison';
import type { AiDecisionContext } from './strategies/types';

export function hasBuilding(state: GameState, owner: PlayerId, defId: string): boolean {
  return ownedBy(state, owner).some((e) => e.kind === 'building' && e.defId === defId && e.state !== 'dead');
}

export function countBuildings(state: GameState, owner: PlayerId, defId: string): number {
  return buildingsOf(state, owner).filter((b) => b.defId === defId).length;
}

export function constructionYards(state: GameState, owner: PlayerId): BuildingEntity[] {
  return buildingsOf(state, owner).filter((b) => {
    if (b.buildProgress !== undefined) return false;
    return b.defId === 'sanctum' || b.defId === 'waystone_camp';
  });
}

export function findSanctum(state: GameState, owner: PlayerId): BuildingEntity | null {
  const yards = constructionYards(state, owner);
  return yards.find((b) => b.defId === 'sanctum') ?? yards[0] ?? null;
}

export function findEnemySanctum(state: GameState, owner: PlayerId): BuildingEntity | null {
  return findEnemyHq(state, owner);
}

export function findEnemyHq(state: GameState, owner: PlayerId): BuildingEntity | null {
  let camp: BuildingEntity | null = null;
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (e.kind !== 'building' || !isAlive(e) || !isEnemy(state, owner, e.owner)) continue;
    if (e.defId === 'sanctum') return e;
    if (e.defId === 'waystone_camp' && !camp) camp = e;
  }
  return camp;
}

export function isDefenseBuilding(registry: Registry, defId: string): boolean {
  const def = registry.buildings.get(defId);
  if (!def) return false;
  return !!(def.weapon || def.aura || def.garrison);
}

/** Mana still unspent after produce/build commands already queued this decision. */
export function remainingMana(ctx: AiDecisionContext): number {
  let spent = 0;
  const reg = ctx.services.registry;
  for (const c of ctx.cmds) {
    if (c.type === 'produce') spent += reg.units.get(c.defId)?.cost ?? 0;
    else if (c.type === 'build') spent += reg.buildings.get(c.defId)?.cost ?? 0;
  }
  return ctx.player.mana - spent;
}

export function findPlacement(
  state: GameState,
  services: SimServices,
  owner: PlayerId,
  cx: number,
  cy: number,
  defId: string,
): { x: number; y: number } | null {
  const def = services.registry.buildings.get(defId);
  if (!def) return null;
  return searchPlacementRings(state, services, owner, cx, cy, def.footprint, buildingPlacementSpacing(def), true);
}

/** Deploy spots ignore the RA2 build zone so a Waystone can plant on a far node. */
export function findDeploySpot(
  state: GameState,
  services: SimServices,
  cx: number,
  cy: number,
  defId: string,
): { x: number; y: number } | null {
  const def = services.registry.buildings.get(defId);
  if (!def) return null;
  return searchPlacementRings(state, services, null, cx, cy, def.footprint, buildingPlacementSpacing(def), false);
}

function searchPlacementRings(
  state: GameState,
  services: SimServices,
  owner: PlayerId | null,
  cx: number,
  cy: number,
  footprint: number,
  spacing: number,
  requireBuildZone: boolean,
): { x: number; y: number } | null {
  const nav = services.nav;
  const originTx = Math.floor(cx / TILE);
  const originTy = Math.floor(cy / TILE);
  for (let ring = 2; ring <= 16; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const tx = originTx + dx;
        const ty = originTy + dy;
        if (!nav.canPlace(tx, ty, footprint, spacing)) continue;
        if (footprintOverlapsNode(state, tx, ty, footprint)) continue;
        if (requireBuildZone && owner && !canBuildNearBase(state, services, owner, tx, ty, footprint)) continue;
        return { x: (tx + footprint / 2) * TILE, y: (ty + footprint / 2) * TILE };
      }
    }
  }
  return null;
}

export function stagingPoint(
  from: { x: number; y: number },
  toward: { x: number; y: number },
  distance = 220,
): { x: number; y: number } {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const d = len(dx, dy);
  if (d < 1) return { x: from.x + distance, y: from.y };
  return { x: from.x + (dx / d) * distance, y: from.y + (dy / d) * distance };
}

export function approachPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  axes: number,
  spread = 260,
): { x: number; y: number }[] {
  const n = Math.max(1, Math.floor(axes));
  if (n <= 1) return [{ x: to.x, y: to.y }];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = len(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const px = -uy;
  const py = ux;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1;
    points.push({
      x: to.x + px * spread * t - ux * 48,
      y: to.y + py * spread * t - uy * 48,
    });
  }
  return points;
}

export function idleCombat(combat: UnitEntity[]): EntityId[] {
  return combat.filter((e) => isAlive(e) && e.orders.length === 0 && e.state === 'idle').map((e) => e.id);
}

/** Armed troops only — excludes harvesters, weavers, and packable wagons. */
export function isArmyUnit(registry: Registry, e: Entity): e is UnitEntity {
  if (!isCombatUnit(e) || !isAlive(e)) return false;
  const def = registry.units.get(e.defId);
  if (!def?.weapon) return false;
  if (def.canConjureMana) return false;
  if (def.deploysAs) return false;
  return true;
}

export function idleArmy(units: UnitEntity[]): UnitEntity[] {
  return units.filter((e) => isAlive(e) && e.orders.length === 0 && e.state === 'idle');
}

export function assignedHarvestersPerNode(state: GameState, owner: PlayerId): Map<EntityId, number> {
  const counts = new Map<EntityId, number>();
  for (const e of ownedBy(state, owner)) {
    if (!isHarvester(e) || !isAlive(e)) continue;
    const harvest = e.orders.find((o) => o.type === 'harvest');
    const nodeId = harvest?.type === 'harvest' ? harvest.nodeId : undefined;
    if (nodeId === undefined) continue;
    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  }
  return counts;
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
  registry?: Registry,
): BuildingEntity | null {
  let best: BuildingEntity | null = null;
  let bestScore = Infinity;
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (e.kind !== 'building' || !isAlive(e) || !isEnemy(state, owner, e.owner)) continue;
    const d = len(e.pos.x - from.x, e.pos.y - from.y);
    const fallback = registry && isDefenseBuilding(registry, e.defId) ? -700 : 0;
    const bias = attackBias[e.defId] ?? fallback;
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
  registry?: Registry,
): BuildingEntity | null {
  return nearestEnemyBuilding(state, owner, from, attackBias, registry);
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
