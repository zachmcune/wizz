// Fog-aware attack objectives, threat ranking, and cluster finding.
import { TILE } from '../core/constants';
import type { BuildingEntity, UnitEntity } from '../sim/entity-types';
import type { Entity, EntityId, KnownBuilding } from '../sim/types';
import { isAlive, isEnemy, entitiesSorted } from '../sim/queries';
import { isVisibleTo } from '../sim/fog';
import { distSq, len } from '../sim/math';
import { isCombatUnit } from '../sim/types';
import { LATE_GAME_TICK } from './difficulty';
import { findEnemySanctum, pickAttackTarget } from './shared';
import type { AiDecisionContext } from './strategies/types';

export interface AttackObjective {
  x: number;
  y: number;
  source: 'live' | 'memory' | 'probe';
  entityId?: EntityId;
}

const THREAT_SCORE: Record<string, number> = {
  siege_behemoth: 120,
  storm_caster: 90,
  mana_weaver: 80,
  rift_skimmer: 70,
  celestial_cannon: 60,
  golem_forge: 50,
  summoning_circle: 45,
  attunement_spire: 40,
  sanctum: 35,
};

export function threatScore(defId: string): number {
  return THREAT_SCORE[defId] ?? 10;
}

export function pickFocusTarget(threats: Entity[]): Entity {
  let best = threats[0]!;
  let bestScore = -Infinity;
  for (const e of threats) {
    const hurt = 1 - e.hp / Math.max(1, e.maxHp);
    const score = threatScore(e.defId) + hurt * 15;
    if (score > bestScore || (score === bestScore && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

export function visibleEnemies(ctx: AiDecisionContext): Entity[] {
  const { state, services, player } = ctx;
  const out: Entity[] = [];
  for (const e of entitiesSorted(state)) {
    if (e.kind === 'resource_node' || e.kind === 'projectile' || !isAlive(e)) continue;
    if (!isEnemy(state, player.id, e.owner)) continue;
    if (!isVisibleTo(state, player.id, e, services.nav)) continue;
    out.push(e);
  }
  return out;
}

export function knownEnemyBuildings(ctx: AiDecisionContext): KnownBuilding[] {
  const entries = Object.values(ctx.player.knownBuildings);
  return entries.sort((a, b) => a.id - b.id);
}

export function probePoints(ctx: AiDecisionContext, from: { x: number; y: number }): { x: number; y: number }[] {
  const map = ctx.services.registry.maps.get(ctx.state.mapId);
  const starts = map?.startLocations ?? [];
  const points = starts.filter((s) => len(s.x - from.x, s.y - from.y) > 480);
  if (map) {
    points.push({ x: (map.tileW * TILE) / 2, y: (map.tileH * TILE) / 2 });
  }
  return points;
}

export function pickAttackObjective(
  ctx: AiDecisionContext,
  from: { x: number; y: number },
  attackBias: Record<string, number>,
): AttackObjective | null {
  const { state, player, profile } = ctx;

  const late = state.tick >= LATE_GAME_TICK;
  // Easy wanders until late-game; Normal/Hard go for a real base so matches resolve.
  if (profile.intel !== 'probe' || late) {
    const live = pickAttackTarget(state, player.id, from, attackBias);
    if (live) return { x: live.pos.x, y: live.pos.y, source: 'live', entityId: live.id };
  }

  const visibleBuilding = nearestVisibleEnemyBuilding(ctx, from, attackBias);
  if (visibleBuilding) {
    return { x: visibleBuilding.pos.x, y: visibleBuilding.pos.y, source: 'live', entityId: visibleBuilding.id };
  }

  if (profile.intel === 'memory') {
    const remembered = pickKnownBuilding(ctx, from, attackBias);
    if (remembered) return { x: remembered.x, y: remembered.y, source: 'memory', entityId: remembered.id };
  }

  const probes = probePoints(ctx, from);
  if (!probes.length) {
    const hq = findEnemySanctum(state, player.id);
    if (hq) return { x: hq.pos.x, y: hq.pos.y, source: 'live', entityId: hq.id };
    return null;
  }
  const dwell = profile.id === 'easy' ? 900 : 400;
  const dest = probes[Math.floor(state.tick / dwell) % probes.length]!;
  return { x: dest.x, y: dest.y, source: 'probe' };
}

function nearestVisibleEnemyBuilding(
  ctx: AiDecisionContext,
  from: { x: number; y: number },
  attackBias: Record<string, number>,
): BuildingEntity | null {
  const { state, services, player } = ctx;
  let best: BuildingEntity | null = null;
  let bestScore = Infinity;
  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'building' || !isAlive(e) || !isEnemy(state, player.id, e.owner)) continue;
    if (!isVisibleTo(state, player.id, e, services.nav)) continue;
    const d = len(e.pos.x - from.x, e.pos.y - from.y);
    const score = d + (attackBias[e.defId] ?? 0);
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function pickKnownBuilding(
  ctx: AiDecisionContext,
  from: { x: number; y: number },
  attackBias: Record<string, number>,
): KnownBuilding | null {
  let best: KnownBuilding | null = null;
  let bestScore = Infinity;
  for (const k of knownEnemyBuildings(ctx)) {
    const d = len(k.x - from.x, k.y - from.y);
    const score = d + (attackBias[k.defId] ?? 0);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

export function densestEnemyCluster(
  ctx: AiDecisionContext,
  radius: number,
  requireVisible: boolean,
): { x: number; y: number; count: number } | null {
  const { state, services, player } = ctx;
  const foes: Entity[] = [];
  for (const e of entitiesSorted(state)) {
    if (e.kind === 'resource_node' || e.kind === 'projectile' || !isAlive(e)) continue;
    if (!isEnemy(state, player.id, e.owner)) continue;
    if (requireVisible && !isVisibleTo(state, player.id, e, services.nav)) continue;
    foes.push(e);
  }
  if (!foes.length) return null;

  const r2 = radius * radius;
  let bestCount = 0;
  let bestX = 0;
  let bestY = 0;
  for (const seed of foes) {
    let count = 0;
    let sx = 0;
    let sy = 0;
    for (const e of foes) {
      if (distSq(seed.pos.x, seed.pos.y, e.pos.x, e.pos.y) > r2) continue;
      count++;
      sx += e.pos.x;
      sy += e.pos.y;
    }
    if (count > bestCount) {
      bestCount = count;
      bestX = sx / count;
      bestY = sy / count;
    }
  }
  if (bestCount <= 0) return null;
  return { x: bestX, y: bestY, count: bestCount };
}

export function visibleEnemyWorkers(ctx: AiDecisionContext): UnitEntity[] {
  return visibleEnemies(ctx).filter((e): e is UnitEntity => e.kind === 'unit' && !isCombatUnit(e));
}

export function omniscientEnemyHq(ctx: AiDecisionContext): BuildingEntity | null {
  return findEnemySanctum(ctx.state, ctx.player.id);
}
