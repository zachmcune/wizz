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
import { LATE_GAME_TICK } from './difficulty';
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
  approachPoints,
  constructionYards,
  enemiesNear,
  idleArmy,
  isDefenseBuilding,
  nearestNode,
  remainingMana,
  stagingPoint,
} from './shared';
import type { AiDecisionContext, AiStrategyConfig } from './strategies/types';

const HOME_NODE_RADIUS = 460;
const EXPAND_NODE_RADIUS = 780;
const WORKER_THREAT_RADIUS = 110;
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
    if (profile.workerFlee && enemiesNear(state, p.id, w.pos.x, w.pos.y, WORKER_THREAT_RADIUS).length) continue;
    const node = profile.expandNodes
      ? (pickSpreadNode(ctx, w, sanctum, assignments) ?? nearestHomeNode(state, w, sanctum) ?? nearestNode(state, w))
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
    if (home > EXPAND_NODE_RADIUS) continue;
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

export function trainWeavers(ctx: AiDecisionContext, config: AiStrategyConfig, armySize: number): void {
  const { state, services, player: p, profile, cmds } = ctx;
  if (profile.weaverTarget <= 0) return;
  if (armySize < 5) return;
  if (roll(state.tick, p.id, 'weaver', profile.missChance)) return;
  const weavers = ownedBy(state, p.id).filter((e) => e.kind === 'unit' && e.defId === config.production.weaverUnit);
  if (weavers.length >= profile.weaverTarget) return;
  const vault = buildingsOf(state, p.id).find(
    (b) => b.defId === config.production.weaverBuilding && b.buildProgress === undefined,
  );
  if (!vault || !buildingHasPower(state, services.registry, vault)) return;
  if ((getProductionQueue(vault)?.length ?? 0) >= profile.maxQueue) return;
  const udef = services.registry.units.get(config.production.weaverUnit);
  if (!udef || remainingMana(ctx) < udef.cost) return;
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
  const circles = buildingsOf(state, p.id).filter((b) => b.defId === prod.armyBuilding && b.buildProgress === undefined);
  const forges = buildingsOf(state, p.id).filter((b) => b.defId === prod.siegeBuilding && b.buildProgress === undefined);

  const tryProduce = (building: BuildingEntity | undefined, defId: string): boolean => {
    if (!building || !buildingHasPower(state, reg, building)) return false;
    const queued = getProductionQueue(building)?.length ?? 0;
    const pending = cmds.filter((c) => c.type === 'produce' && c.buildingId === building.id).length;
    if (queued + pending >= profile.maxQueue) return false;
    const udef = reg.units.get(defId);
    if (!udef || remainingMana(ctx) < udef.cost) return false;
    if (!udef.requires.every((r) => p.unlockedTech.includes(r))) return false;
    const wispDef = reg.units.get(prod.harvesterUnit);
    const wispCount = ownedBy(state, p.id).filter((e) => e.kind === 'unit' && e.defId === prod.harvesterUnit).length;
    if (wispDef && wispCount < diff.wispTarget && remainingMana(ctx) - udef.cost < wispDef.cost) return false;
    cmds.push({ type: 'produce', playerId: p.id, buildingId: building.id, defId });
    return true;
  };

  const airCount = ownedBy(state, p.id).filter((e) => e.kind === 'unit' && e.defId === prod.airUnit).length;
  for (const circle of circles) {
    if (profile.airTarget > 0 && combatCount >= 5 && airCount < profile.airTarget && tryProduce(circle, prod.airUnit)) {
      continue;
    }
    if (p.unlockedTech.includes('arcane_nexus') && combatCount >= 6 && tryProduce(circle, prod.nexusUnit)) continue;
    const phase = Math.floor(state.tick / 40) % prod.armyRotation.length;
    const rotated = [...prod.armyRotation.slice(phase), ...prod.armyRotation.slice(0, phase)];
    for (const uid of rotated) {
      if (tryProduce(circle, uid)) break;
    }
  }

  if (combatCount >= Math.floor(diff.armyThreshold * prod.forgeArmyThresholdFactor)) {
    for (const forge of forges) {
      for (const uid of prod.siegeUnits) {
        if (tryProduce(forge, uid)) break;
      }
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
  const from = army[0]?.pos ?? hq?.pos ?? { x: 0, y: 0 };
  const defense = pickAttackObjective(ctx, from, config.combat.attackBias);
  const lanceTarget =
    cluster && cluster.count >= (profile.id === 'easy' ? 99 : 3)
      ? { x: cluster.x, y: cluster.y }
      : defense
        ? { x: defense.x, y: defense.y }
        : hq
          ? { x: hq.pos.x, y: hq.pos.y }
          : null;

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
  const dest = defense ?? (hq ? { x: hq.pos.x, y: hq.pos.y } : lanceTarget);
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
  if (!profile.scout || state.tick >= LATE_GAME_TICK) return;
  const scouts = idleArmy(army).filter((u) => u.defId === config.production.scoutUnit);
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

  const yards = constructionYards(state, p.id);
  const defendRadius = config.defendRadius * profile.defendRadiusScale;
  let threats: ReturnType<typeof enemiesNear> = [];
  for (const yard of yards.length ? yards : [sanctum]) {
    threats = mergeEntities(threats, enemiesNear(state, p.id, yard.pos.x, yard.pos.y, defendRadius));
  }
  if (profile.workerDefense) {
    for (const w of ownedBy(state, p.id)) {
      if (!isHarvester(w) || !isAlive(w)) continue;
      threats = mergeEntities(threats, enemiesNear(state, p.id, w.pos.x, w.pos.y, WORKER_THREAT_RADIUS + 40));
    }
  }

  const late = state.tick >= LATE_GAME_TICK;
  const idle = idleArmy(army);
  const busy = army.filter((u) => !idle.includes(u));
  let defendPool = [...idle];
  if (!late && profile.redirectDefense && threats.length >= 2) {
    defendPool = [...idle, ...busy];
  }

  if (threats.length > 0 && defendPool.length >= (profile.id === 'easy' ? 2 : 3)) {
    const fraction = late ? 0.25 : Math.min(1, config.combat.defendFraction * profile.defendFractionScale);
    const defendCount = Math.min(
      defendPool.length,
      Math.max(2, Math.floor(defendPool.length * fraction)),
    );
    const defenders = defendPool.slice(0, defendCount);
    const target = profile.focusFire ? pickFocusTarget(threats) : threats[0]!;
    cmds.push({ type: 'attack', playerId: p.id, entityIds: defenders.map((u) => u.id), targetId: target.id });
    const defendIds = new Set(defenders.map((u) => u.id));
    army = army.filter((u) => !defendIds.has(u.id));
  }

  army = peelHoldGuards(ctx, config, army, yards);

  pullWoundedHome(ctx, sanctum, army, late);

  const remainingIdle = idleArmy(army);
  const air = remainingIdle.filter((u) => u.defId === config.production.airUnit || isAirEntity(services.registry, u));
  if (!late && profile.harass && air.length) {
    const workers = visibleEnemyWorkers(ctx);
    const prey = workers[0] ?? visibleEnemies(ctx).find((e) => e.defId === 'attunement_spire');
    if (prey) {
      cmds.push({ type: 'attack', playerId: p.id, entityIds: air.map((u) => u.id), targetId: prey.id });
      const airIds = new Set(air.map((u) => u.id));
      army = army.filter((u) => !airIds.has(u.id));
    }
  }

  const healthyIdle = idleArmy(army).filter((u) => fitForPush(u, profile.retreatHp, late));
  const pushScale = late ? 0.45 : profile.minPushScale;
  const minPush = Math.max(3, Math.floor(diff.armyThreshold * config.combat.minPushFactor * pushScale));
  const massing = !late && profile.id !== 'easy';
  const toward =
    pickAttackObjective(ctx, sanctum.pos, config.combat.attackBias) ?? omniscientEnemyHq(ctx)?.pos ?? { x: sanctum.pos.x + 200, y: sanctum.pos.y };
  const staging = stagingPoint(sanctum.pos, toward, 220);

  const canGrow =
    remainingMana(ctx) >= 140 ||
    buildingsOf(state, p.id).some((b) => (getProductionQueue(b)?.length ?? 0) > 0);
  if (massing && healthyIdle.length < minPush && canGrow) {
    rallyToStaging(ctx, healthyIdle, staging);
    return;
  }
  if (!late && army.length < minPush && healthyIdle.length < 3) return;
  if (healthyIdle.length < (late ? 1 : Math.max(2, Math.floor(minPush / 2)))) return;

  const waveFrac = late ? 1 : profile.waveFraction;
  const minWave = massing ? minPush : late ? 1 : 2;
  const keep = late || profile.id === 'easy'
    ? 0
    : Math.min(Math.max(2, profile.holdCount), Math.max(0, healthyIdle.length - minPush));
  const sorted = [...healthyIdle].sort((a, b) => {
    const da = len(a.pos.x - sanctum.pos.x, a.pos.y - sanctum.pos.y);
    const db = len(b.pos.x - sanctum.pos.x, b.pos.y - sanctum.pos.y);
    return db - da || a.id - b.id;
  });
  const waveSize = Math.max(minWave, Math.floor(sorted.length * waveFrac) - keep);
  const wave = uniqueUnits(sorted.slice(0, Math.max(0, sorted.length - keep)).slice(0, waveSize));
  issuePush(ctx, config, sanctum, wave);
}

function rallyToStaging(
  ctx: AiDecisionContext,
  units: UnitEntity[],
  staging: { x: number; y: number },
): void {
  const need = units.filter((u) => len(u.pos.x - staging.x, u.pos.y - staging.y) > 80);
  if (!need.length) return;
  ctx.cmds.push({
    type: 'move',
    playerId: ctx.player.id,
    entityIds: need.map((u) => u.id),
    x: staging.x,
    y: staging.y,
  });
}

function peelHoldGuards(
  ctx: AiDecisionContext,
  config: AiStrategyConfig,
  army: UnitEntity[],
  yards: BuildingEntity[],
): UnitEntity[] {
  const { state, player: p, profile, cmds } = ctx;
  if (profile.holdCount <= 0) return army;
  if (ctx.state.tick >= LATE_GAME_TICK) return army;
  const camps = yards.filter((b) => b.defId === config.production.expandBuilding);
  if (!camps.length) return army;
  const taken = new Set<EntityId>();
  let remaining = [...army];
  for (const camp of camps.sort((a, b) => a.id - b.id)) {
    if (enemiesNear(state, p.id, camp.pos.x, camp.pos.y, 140).length) continue;
    const nearby = remaining.filter((u) => len(u.pos.x - camp.pos.x, u.pos.y - camp.pos.y) <= 180);
    const missing = profile.holdCount - nearby.length;
    if (missing <= 0) {
      for (const u of nearby.slice(0, profile.holdCount)) taken.add(u.id);
      continue;
    }
    const idle = idleArmy(remaining)
      .filter((u) => !nearby.includes(u))
      .sort((a, b) => len(a.pos.x - camp.pos.x, a.pos.y - camp.pos.y) - len(b.pos.x - camp.pos.x, b.pos.y - camp.pos.y));
    const guards = [...nearby, ...idle.slice(0, missing)].slice(0, profile.holdCount);
    const movers = guards.filter((u) => u.orders.length === 0 && len(u.pos.x - camp.pos.x, u.pos.y - camp.pos.y) > 90);
    if (movers.length) {
      cmds.push({ type: 'move', playerId: p.id, entityIds: movers.map((u) => u.id), x: camp.pos.x, y: camp.pos.y });
    }
    for (const u of guards) taken.add(u.id);
    remaining = remaining.filter((u) => !taken.has(u.id));
  }
  return remaining;
}

function issuePush(
  ctx: AiDecisionContext,
  config: AiStrategyConfig,
  sanctum: BuildingEntity,
  wave: UnitEntity[],
): void {
  const { player: p, profile, cmds, services } = ctx;
  if (!wave.length) return;
  if (lateGame(ctx)) {
    const hq = omniscientEnemyHq(ctx);
    const dest = hq ?? pickAttackObjective(ctx, sanctum.pos, config.combat.attackBias);
    if (!dest) return;
    const x = 'pos' in dest ? dest.pos.x : dest.x;
    const y = 'pos' in dest ? dest.pos.y : dest.y;
    cmds.push({ type: 'attackMove', playerId: p.id, entityIds: wave.map((u) => u.id), x, y });
    return;
  }
  const from = {
    x: wave.reduce((s, u) => s + u.pos.x, 0) / wave.length,
    y: wave.reduce((s, u) => s + u.pos.y, 0) / wave.length,
  };
  const objective = pickAttackObjective(ctx, from, config.combat.attackBias);
  if (!objective) return;

  const siege = wave.filter((u) => u.defId === config.combat.siegeUnit);
  const rest = wave.filter((u) => u.defId !== config.combat.siegeUnit);
  const target = objective.entityId ? ctx.state.entities.get(objective.entityId) : undefined;
  const smashDefense = target && target.kind === 'building' && isDefenseBuilding(services.registry, target.defId);

  if (siege.length && smashDefense && target) {
    cmds.push({ type: 'attack', playerId: p.id, entityIds: siege.map((u) => u.id), targetId: target.id });
  } else if (siege.length) {
    cmds.push({ type: 'attackMove', playerId: p.id, entityIds: siege.map((u) => u.id), x: objective.x, y: objective.y });
  }

  const flankers = rest.length ? rest : siege.length ? [] : wave;
  if (!flankers.length) return;

  const axes = lateGame(ctx) ? 1 : profile.attackAxes;
  const points = approachPoints(sanctum.pos, { x: objective.x, y: objective.y }, axes);
  const groups = splitUnits(rest.length ? rest : wave, points.length);
  for (let i = 0; i < groups.length; i++) {
    const dest = points[i] ?? points[0]!;
    cmds.push({
      type: 'attackMove',
      playerId: p.id,
      entityIds: groups[i]!.map((u) => u.id),
      x: dest.x,
      y: dest.y,
    });
  }
}

function lateGame(ctx: AiDecisionContext): boolean {
  return ctx.state.tick >= LATE_GAME_TICK;
}

function splitUnits(units: UnitEntity[], parts: number): UnitEntity[][] {
  const n = Math.max(1, parts);
  const groups: UnitEntity[][] = Array.from({ length: n }, () => []);
  const sorted = [...units].sort((a, b) => a.id - b.id);
  for (let i = 0; i < sorted.length; i++) groups[i % n]!.push(sorted[i]!);
  return groups.filter((g) => g.length > 0);
}

function fitForPush(unit: UnitEntity, retreatHp: number, late: boolean): boolean {
  if (late || retreatHp <= 0) return true;
  return unit.hp / Math.max(1, unit.maxHp) > retreatHp;
}

function pullWoundedHome(
  ctx: AiDecisionContext,
  sanctum: BuildingEntity,
  army: UnitEntity[],
  late: boolean,
): void {
  const { player: p, profile, cmds } = ctx;
  if (late || profile.retreatHp <= 0) return;
  const wounded = army.filter((u) => !fitForPush(u, profile.retreatHp, late) && u.orders.length === 0);
  if (!wounded.length) return;
  cmds.push({
    type: 'move',
    playerId: p.id,
    entityIds: wounded.map((u) => u.id),
    x: sanctum.pos.x,
    y: sanctum.pos.y,
  });
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
