// Difficulty-aware AI behaviors. Each helper only emits Commands.
import type { BuildingEntity, UnitEntity } from '../sim/entity-types';
import type { EntityId } from '../sim/types';
import { isHarvester } from '../sim/types';
import { ownedBy, buildingsOf, isAlive } from '../sim/queries';
import { buildingHasPower } from '../sim/power';
import { getProductionQueue, isChanneling } from '../sim/capabilities';
import { isAirEntity } from '../sim/mobility';
import { len } from '../sim/math';
import { roll } from './chance';
import {
  densestEnemyCluster,
  omniscientEnemyHq,
  pickAttackObjective,
  pickFocusTarget,
  probePoints,
  visibleEnemies,
  visibleEnemyWorkers,
} from './intel';
import {
  assignedHarvestersPerNode,
  enemiesNear,
  idleArmy,
  nearestNode,
} from './shared';
import type { AiDecisionContext, AiStrategyConfig } from './strategies/types';

const HOME_NODE_RADIUS = 460;
const WORKER_THREAT_RADIUS = 110;
const RETREAT_ENEMY_RANGE = 520;
const BLINK_MIN_RANGE = 280;
const BLINK_STEP = 220;
const MANA_RESERVE_REPAIR = 180;
const METEOR_RADIUS = 90;

const REPAIR_PRIORITY = new Set([
  'sanctum',
  'waystone_camp',
  'attunement_spire',
  'summoning_circle',
  'golem_forge',
  'resonance_vault',
]);

export function assignHarvesters(ctx: AiDecisionContext, sanctum: BuildingEntity): void {
  const { state, player: p, profile, cmds } = ctx;
  const assignments = assignedHarvestersPerNode(state, p.id);
  for (const w of ownedBy(state, p.id)) {
    if (!isHarvester(w) || !isAlive(w)) continue;
    if (w.orders.length > 0 || w.state !== 'idle') continue;
    const node = profile.expandNodes
      ? pickSpreadNode(ctx, w, sanctum, assignments)
      : (nearestHomeNode(state, w, sanctum) ?? nearestNode(state, w));
    if (!node) continue;
    assignments.set(node.id, (assignments.get(node.id) ?? 0) + 1);
    cmds.push({ type: 'harvest', playerId: p.id, entityIds: [w.id], nodeId: node.id });
  }
}

function nearestHomeNode(state: AiDecisionContext['state'], unit: UnitEntity, sanctum: BuildingEntity) {
  let best = null as ReturnType<typeof nearestNode>;
  let bestD = Infinity;
  for (const n of state.entities.values()) {
    if (n.kind !== 'resource_node' || n.amount <= 0) continue;
    if (len(n.pos.x - sanctum.pos.x, n.pos.y - sanctum.pos.y) > HOME_NODE_RADIUS) continue;
    const d = len(n.pos.x - unit.pos.x, n.pos.y - unit.pos.y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function pickSpreadNode(
  ctx: AiDecisionContext,
  unit: UnitEntity,
  sanctum: BuildingEntity,
  assignments: Map<EntityId, number>,
) {
  const { state } = ctx;
  let best = null as ReturnType<typeof nearestNode>;
  let bestScore = Infinity;
  for (const n of [...state.entities.values()].sort((a, b) => a.id - b.id)) {
    if (n.kind !== 'resource_node' || n.amount <= 0) continue;
    const home = len(n.pos.x - sanctum.pos.x, n.pos.y - sanctum.pos.y);
    const travel = len(n.pos.x - unit.pos.x, n.pos.y - unit.pos.y);
    const assigned = assignments.get(n.id) ?? 0;
    const score = travel + assigned * 140 + home * 0.15;
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

export function fleeThreatenedWorkers(ctx: AiDecisionContext, sanctum: BuildingEntity): void {
  const { state, player: p, profile, cmds } = ctx;
  if (!profile.workerFlee) return;
  const ids: EntityId[] = [];
  for (const w of ownedBy(state, p.id)) {
    if (!isHarvester(w) || !isAlive(w)) continue;
    if (!enemiesNear(state, p.id, w.pos.x, w.pos.y, WORKER_THREAT_RADIUS).length) continue;
    ids.push(w.id);
  }
  if (ids.length) {
    cmds.push({ type: 'move', playerId: p.id, entityIds: ids, x: sanctum.pos.x, y: sanctum.pos.y });
  }
}

export function repairOwnBuildings(ctx: AiDecisionContext): void {
  const { state, player: p, profile, cmds } = ctx;
  if (!profile.repair || p.mana < MANA_RESERVE_REPAIR) return;
  const damaged = buildingsOf(state, p.id)
    .filter((b) => {
      if (b.buildProgress !== undefined || !isAlive(b) || b.repairing) return false;
      const ratio = b.hp / Math.max(1, b.maxHp);
      if (profile.repairAll) return ratio < 0.88;
      return REPAIR_PRIORITY.has(b.defId) && ratio < 0.7;
    })
    .sort((a, b) => a.id - b.id);
  const target = damaged[0];
  if (target) cmds.push({ type: 'setRepair', playerId: p.id, buildingId: target.id, enabled: true });
}

export function trainWeavers(ctx: AiDecisionContext, config: AiStrategyConfig): void {
  const { state, services, player: p, profile, cmds } = ctx;
  if (profile.weaverTarget <= 0) return;
  if (roll(state.tick, p.id, 'weaver', profile.missChance)) return;
  const weavers = ownedBy(state, p.id).filter((e) => e.kind === 'unit' && e.defId === config.production.weaverUnit);
  if (weavers.length >= profile.weaverTarget) return;
  const vault = buildingsOf(state, p.id).find(
    (b) => b.defId === config.production.weaverBuilding && b.buildProgress === undefined,
  );
  if (!vault || !buildingHasPower(state, services.registry, vault)) return;
  if ((getProductionQueue(vault)?.length ?? 0) >= profile.maxQueue) return;
  const udef = services.registry.units.get(config.production.weaverUnit);
  if (!udef || p.mana < udef.cost) return;
  if (!udef.requires.every((r) => p.unlockedTech.includes(r))) return;
  cmds.push({ type: 'produce', playerId: p.id, buildingId: vault.id, defId: config.production.weaverUnit });
}

export function channelWeavers(ctx: AiDecisionContext, config: AiStrategyConfig, sanctum: BuildingEntity): void {
  const { state, player: p, profile, cmds } = ctx;
  if (profile.weaverTarget <= 0) return;
  const vault = buildingsOf(state, p.id).find((b) => b.defId === config.production.weaverBuilding && isAlive(b));
  const park = vault ?? sanctum;
  const ids: EntityId[] = [];
  for (const e of ownedBy(state, p.id)) {
    if (e.kind !== 'unit' || e.defId !== config.production.weaverUnit || !isAlive(e)) continue;
    if (isChanneling(e)) continue;
    if (len(e.pos.x - park.pos.x, e.pos.y - park.pos.y) > 90 && e.orders.length === 0) {
      cmds.push({ type: 'move', playerId: p.id, entityIds: [e.id], x: park.pos.x, y: park.pos.y });
      continue;
    }
    if (e.orders.length === 0) ids.push(e.id);
  }
  if (ids.length) cmds.push({ type: 'channel', playerId: p.id, entityIds: ids, enabled: true });
}

export function produceArmy(ctx: AiDecisionContext, config: AiStrategyConfig, combatCount: number): void {
  const { state, services, player: p, difficulty: diff, profile, cmds } = ctx;
  if (roll(state.tick, p.id, 'produce', profile.missChance)) return;
  const reg = services.registry;
  const prod = config.production;
  const circle = buildingsOf(state, p.id).find((b) => b.defId === prod.armyBuilding && b.buildProgress === undefined);
  const forge = buildingsOf(state, p.id).find((b) => b.defId === prod.siegeBuilding && b.buildProgress === undefined);

  const tryProduce = (building: BuildingEntity | undefined, defId: string): boolean => {
    if (!building || !buildingHasPower(state, reg, building)) return false;
    if ((getProductionQueue(building)?.length ?? 0) >= profile.maxQueue) return false;
    const udef = reg.units.get(defId);
    if (!udef || p.mana < udef.cost) return false;
    if (!udef.requires.every((r) => p.unlockedTech.includes(r))) return false;
    cmds.push({ type: 'produce', playerId: p.id, buildingId: building.id, defId });
    return true;
  };

  if (circle) {
    const airCount = ownedBy(state, p.id).filter((e) => e.kind === 'unit' && e.defId === prod.airUnit).length;
    if (profile.airTarget > 0 && airCount < profile.airTarget && tryProduce(circle, prod.airUnit)) return;
    if (p.unlockedTech.includes('arcane_nexus') && tryProduce(circle, prod.nexusUnit)) return;
    const phase = Math.floor(state.tick / 40) % prod.armyRotation.length;
    const rotated = [...prod.armyRotation.slice(phase), ...prod.armyRotation.slice(0, phase)];
    for (const uid of rotated) {
      if (tryProduce(circle, uid)) break;
    }
  }

  if (forge && combatCount >= Math.floor(diff.armyThreshold * prod.forgeArmyThresholdFactor)) {
    for (const uid of prod.siegeUnits) {
      if (tryProduce(forge, uid)) break;
    }
  }
}

export function decideSpells(ctx: AiDecisionContext, config: AiStrategyConfig, army: UnitEntity[]): void {
  const { state, player: p, profile, cmds } = ctx;
  if (!p.unlockedTech.includes(config.superweapon.requiresBuilding)) return;

  const beam = state.beams.find((b) => b.owner === p.id);
  const lanceCd = p.spellCooldowns[config.superweapon.spellId] ?? 0;
  const requireVisible = profile.intel !== 'omniscient';
  const cluster = densestEnemyCluster(ctx, METEOR_RADIUS, requireVisible);
  const hq = omniscientEnemyHq(ctx);
  const lanceTarget =
    profile.id === 'hard' && cluster && cluster.count >= 3
      ? { x: cluster.x, y: cluster.y }
      : hq
        ? { x: hq.pos.x, y: hq.pos.y }
        : pickAttackObjective(ctx, army[0]?.pos ?? { x: 0, y: 0 }, config.combat.attackBias);

  if (lanceTarget) {
    if (beam && beam.state === 'firing') {
      cmds.push({ type: 'steerSuperweapon', playerId: p.id, x: lanceTarget.x, y: lanceTarget.y });
    } else if (!beam && lanceCd === 0) {
      cmds.push({
        type: 'castSpell',
        playerId: p.id,
        spellId: config.superweapon.spellId,
        x: lanceTarget.x,
        y: lanceTarget.y,
      });
    }
  }

  if (!profile.utilitySpells || roll(state.tick, p.id, 'spell', profile.missChance)) return;

  const meteorCd = p.spellCooldowns[config.spells.meteor] ?? 0;
  if (meteorCd === 0 && cluster && cluster.count >= profile.meteorMinEnemies) {
    cmds.push({
      type: 'castSpell',
      playerId: p.id,
      spellId: config.spells.meteor,
      x: cluster.x,
      y: cluster.y,
    });
  }

  const aegisCd = p.spellCooldowns[config.spells.aegis] ?? 0;
  const idle = idleArmy(army);
  if (aegisCd === 0 && idle.length >= profile.aegisMinArmy) {
    cmds.push({
      type: 'castSpell',
      playerId: p.id,
      spellId: config.spells.aegis,
      x: idle[0]!.pos.x,
      y: idle[0]!.pos.y,
      entityIds: idle.map((u) => u.id),
    });
  }

  if (!profile.blinkSiege) return;
  const blinkCd = p.spellCooldowns[config.spells.blink] ?? 0;
  const siege = idle.filter((u) => u.defId === config.combat.siegeUnit);
  const dest = hq ? { x: hq.pos.x, y: hq.pos.y } : lanceTarget;
  if (blinkCd === 0 && siege.length && dest) {
    const lead = siege[0]!;
    const dx = dest.x - lead.pos.x;
    const dy = dest.y - lead.pos.y;
    const d = len(dx, dy);
    if (d >= BLINK_MIN_RANGE) {
      const step = Math.min(BLINK_STEP, d - 140);
      cmds.push({
        type: 'castSpell',
        playerId: p.id,
        spellId: config.spells.blink,
        x: lead.pos.x + (dx / d) * step,
        y: lead.pos.y + (dy / d) * step,
        entityIds: siege.map((u) => u.id),
      });
    }
  }
}

export function decideScout(ctx: AiDecisionContext, config: AiStrategyConfig, army: UnitEntity[]): void {
  const { state, player: p, profile, cmds } = ctx;
  if (!profile.scout) return;
  const scouts = idleArmy(army).filter((u) => u.defId === config.production.scoutUnit || isAirEntity(ctx.services.registry, u));
  const scout = scouts[0];
  if (!scout) return;
  const waypoints = probePoints(ctx, scout.pos);
  if (!waypoints.length) return;
  const dest = waypoints[Math.floor(state.tick / 240) % waypoints.length]!;
  cmds.push({ type: 'attackMove', playerId: p.id, entityIds: [scout.id], x: dest.x, y: dest.y });
}

export function decideCombat(
  ctx: AiDecisionContext,
  config: AiStrategyConfig,
  sanctum: BuildingEntity,
  army: UnitEntity[],
): void {
  const { state, services, player: p, difficulty: diff, profile, cmds } = ctx;
  if (!army.length) return;

  const defendRadius = config.defendRadius * profile.defendRadiusScale;
  let threats = enemiesNear(state, p.id, sanctum.pos.x, sanctum.pos.y, defendRadius);
  if (profile.workerDefense) {
    for (const w of ownedBy(state, p.id)) {
      if (!isHarvester(w) || !isAlive(w)) continue;
      threats = mergeEntities(threats, enemiesNear(state, p.id, w.pos.x, w.pos.y, WORKER_THREAT_RADIUS + 40));
    }
  }

  const idle = idleArmy(army);
  const busy = army.filter((u) => !idle.includes(u));
  let defendPool = [...idle];
  if (profile.redirectDefense && threats.length >= 2) {
    defendPool = [...idle, ...busy];
  }

  if (threats.length > 0 && defendPool.length >= (profile.id === 'easy' ? 2 : 3)) {
    const fraction = Math.min(1, config.combat.defendFraction * profile.defendFractionScale);
    const defendCount = Math.min(Math.floor(defendPool.length * fraction), Math.max(2, threats.length + 1));
    const defenders = defendPool.slice(0, defendCount);
    const target = profile.focusFire ? pickFocusTarget(threats) : threats[0]!;
    cmds.push({ type: 'attack', playerId: p.id, entityIds: defenders.map((u) => u.id), targetId: target.id });
    const defendIds = new Set(defenders.map((u) => u.id));
    army = army.filter((u) => !defendIds.has(u.id));
  }

  if (maybeRetreat(ctx, config, sanctum, army)) return;

  const remainingIdle = idleArmy(army);
  const air = remainingIdle.filter((u) => u.defId === config.production.airUnit || isAirEntity(services.registry, u));
  if (profile.harass && air.length) {
    const workers = visibleEnemyWorkers(ctx);
    const prey = workers[0] ?? visibleEnemies(ctx).find((e) => e.defId === 'attunement_spire');
    if (prey) {
      cmds.push({ type: 'attack', playerId: p.id, entityIds: air.map((u) => u.id), targetId: prey.id });
      const airIds = new Set(air.map((u) => u.id));
      army = army.filter((u) => !airIds.has(u.id));
    }
  }

  const attackIdle = idleArmy(army);
  const minPush = Math.max(3, Math.floor(diff.armyThreshold * config.combat.minPushFactor * profile.minPushScale));
  if (army.length < minPush && attackIdle.length < 3) return;
  if (attackIdle.length < Math.max(2, Math.floor(minPush / 2))) return;

  const waveSize = Math.max(2, Math.floor(attackIdle.length * profile.waveFraction));
  let wave = attackIdle.slice(0, waveSize);

  const objective = pickAttackObjective(ctx, sanctum.pos, config.combat.attackBias);
  const siegeReady = wave.filter((u) => u.defId === config.combat.siegeUnit);
  const hq = profile.intel === 'omniscient' ? omniscientEnemyHq(ctx) : null;
  if (hq && siegeReady.length > 0) {
    const extra = Math.max(siegeReady.length + 3, minPush);
    wave = uniqueUnits([...siegeReady, ...wave]).slice(0, extra);
    cmds.push({ type: 'attackMove', playerId: p.id, entityIds: wave.map((u) => u.id), x: hq.pos.x, y: hq.pos.y });
    return;
  }
  if (objective) {
    cmds.push({
      type: 'attackMove',
      playerId: p.id,
      entityIds: wave.map((u) => u.id),
      x: objective.x,
      y: objective.y,
    });
  }
}

function maybeRetreat(
  ctx: AiDecisionContext,
  config: AiStrategyConfig,
  sanctum: BuildingEntity,
  army: UnitEntity[],
): boolean {
  const { player: p, profile, cmds } = ctx;
  if (profile.retreatHp <= 0 || army.length < 3) return false;
  const hq = omniscientEnemyHq(ctx);
  const objective = pickAttackObjective(ctx, sanctum.pos, config.combat.attackBias);
  const front = hq?.pos ?? (objective ? { x: objective.x, y: objective.y } : null);
  if (!front) return false;
  const inField = army.filter((u) => len(u.pos.x - front.x, u.pos.y - front.y) < RETREAT_ENEMY_RANGE);
  if (inField.length < 3) return false;
  const avg = inField.reduce((s, u) => s + u.hp / Math.max(1, u.maxHp), 0) / inField.length;
  if (avg > profile.retreatHp) return false;
  cmds.push({
    type: 'move',
    playerId: p.id,
    entityIds: inField.map((u) => u.id),
    x: sanctum.pos.x,
    y: sanctum.pos.y,
  });
  return true;
}

function mergeEntities(a: ReturnType<typeof enemiesNear>, b: ReturnType<typeof enemiesNear>) {
  const seen = new Set(a.map((e) => e.id));
  const out = [...a];
  for (const e of b) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.sort((x, y) => x.id - y.id);
}

function uniqueUnits(units: UnitEntity[]): UnitEntity[] {
  const seen = new Set<EntityId>();
  const out: UnitEntity[] = [];
  for (const u of units) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    out.push(u);
  }
  return out;
}
