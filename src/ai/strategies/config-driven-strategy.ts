// Data-driven AI strategy: build order from JSON, tactics scaled by difficulty profile.
import { ownedBy } from '../../sim/queries';
import { isPowerShort, buildingHasPower } from '../../sim/power';
import { getProductionQueue, getRally } from '../../sim/capabilities';
import { len } from '../../sim/math';
import type { AiDecisionContext, AiStrategy, AiStrategyConfig } from './types';
import {
  assignHarvesters,
  channelWeavers,
  decideCombat,
  decideScout,
  decideSpells,
  fleeThreatenedWorkers,
  produceArmy,
  repairOwnBuildings,
  trainWeavers,
} from '../behaviors';
import { decideExpansion } from '../expand';
import { roll } from '../chance';
import { omniscientEnemyHq, pickAttackObjective } from '../intel';
import {
  countBuildings,
  findPlacement,
  findSanctum,
  garrisonNearbyUnits,
  hasBuilding,
  isArmyUnit,
  remainingMana,
  stagingPoint,
} from '../shared';

export class ConfigDrivenStrategy implements AiStrategy {
  constructor(readonly config: AiStrategyConfig) {}

  decide(ctx: AiDecisionContext): void {
    const { state, services, player: p, difficulty: diff, profile, cmds, skipCombat } = ctx;
    const reg = services.registry;
    const sanctum = findSanctum(state, p.id);
    if (!sanctum) return;

    const own = ownedBy(state, p.id);
    const army = own.filter((e) => isArmyUnit(reg, e));
    const cfg = this.config;

    assignHarvesters(ctx, sanctum);
    fleeThreatenedWorkers(ctx, sanctum);

    if (isPowerShort(state, p.id)) {
      const pendingLey = own.some(
        (e) => e.kind === 'building' && e.defId === 'ley_conduit' && e.buildProgress !== undefined,
      );
      const leyDef = reg.buildings.get('ley_conduit');
      if (
        !pendingLey &&
        leyDef &&
        leyDef.requires.every((r) => p.unlockedTech.includes(r)) &&
        remainingMana(ctx) >= leyDef.cost
      ) {
        const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, 'ley_conduit');
        if (spot) cmds.push({ type: 'build', playerId: p.id, defId: 'ley_conduit', x: spot.x, y: spot.y });
      }
    }

    const spire = own.find(
      (e) => e.kind === 'building' && e.defId === cfg.production.harvesterBuilding && e.buildProgress === undefined,
    );
    const wisps = own.filter((e) => e.kind === 'unit' && e.defId === cfg.production.harvesterUnit);
    if (spire && spire.kind === 'building' && wisps.length < diff.wispTarget) {
      if (buildingHasPower(state, reg, spire)) {
        const q = getProductionQueue(spire)?.length ?? 0;
        const wdef = reg.units.get(cfg.production.harvesterUnit);
        if (q === 0 && wdef && remainingMana(ctx) >= wdef.cost) {
          cmds.push({ type: 'produce', playerId: p.id, buildingId: spire.id, defId: cfg.production.harvesterUnit });
        }
      }
    }

    trainWeavers(ctx, cfg, army.length);
    channelWeavers(ctx, cfg, sanctum);

    const nextBuild = nextBuildOrderItem(ctx, cfg);
    const spireDef = reg.buildings.get(cfg.superweapon.requiresBuilding);
    const armyReady = army.length >= Math.floor(diff.armyThreshold * 0.6);
    const savingForSpire =
      profile.id !== 'easy' &&
      nextBuild === cfg.superweapon.requiresBuilding &&
      armyReady &&
      !!spireDef &&
      remainingMana(ctx) < spireDef.cost;

    if (!savingForSpire) produceArmy(ctx, cfg, army.length);
    if (!savingForSpire) decideExpansion(ctx, cfg, sanctum, army.length);
    garrisonNearbyUnits(state, services, p.id, cfg.combat.garrisonUnit, cfg.garrisonRadius, cmds);
    repairOwnBuildings(ctx);
    setArmyRally(ctx, cfg, sanctum);

    if (nextBuild && (!savingForSpire || remainingMana(ctx) >= (spireDef?.cost ?? Infinity))) {
      tryPlace(ctx, nextBuild, sanctum.pos.x, sanctum.pos.y);
    }

    if (!savingForSpire && profile.extraFactories > 0) {
      const circles = countBuildings(state, p.id, cfg.production.armyBuilding);
      if (circles < 1 + profile.extraFactories && army.length >= 4) {
        tryPlace(ctx, cfg.production.armyBuilding, sanctum.pos.x, sanctum.pos.y);
      }
    }

    if (!savingForSpire && !roll(state.tick, p.id, 'defense-build', profile.missChance)) {
      const turret = cfg.turret;
      const turretDef = reg.buildings.get(turret.defId);
      if (
        turretDef &&
        !hasBuilding(state, p.id, turret.defId) &&
        hasBuilding(state, p.id, turret.requiresBuilding) &&
        army.length >= Math.floor(diff.armyThreshold * turret.armyThresholdFactor) &&
        remainingMana(ctx) >= turretDef.cost * turret.manaReserveFactor
      ) {
        tryPlace(ctx, turret.defId, sanctum.pos.x, sanctum.pos.y);
      }

      if (p.unlockedTech.includes('arcane_nexus')) {
        for (const defId of cfg.advancedDefenses) {
          if (hasBuilding(state, p.id, defId)) continue;
          const bdef = reg.buildings.get(defId);
          if (!bdef || !bdef.requires.every((r) => p.unlockedTech.includes(r))) continue;
          const reserve = defId === 'celestial_cannon' ? 1.6 : 1.25;
          if (remainingMana(ctx) < bdef.cost * reserve) continue;
          if (tryPlace(ctx, defId, sanctum.pos.x, sanctum.pos.y)) break;
        }
      }
    }

    if (skipCombat) return;
    decideSpells(ctx, cfg, army);
    decideScout(ctx, cfg, army);
    decideCombat(ctx, cfg, sanctum, army);
  }
}

function nextBuildOrderItem(ctx: AiDecisionContext, cfg: AiStrategyConfig): string | null {
  const { state, services, player: p } = ctx;
  for (const defId of cfg.buildOrder) {
    if (hasBuilding(state, p.id, defId)) continue;
    const bdef = services.registry.buildings.get(defId);
    if (!bdef) continue;
    if (!bdef.requires.every((r) => p.unlockedTech.includes(r))) return defId;
    return defId;
  }
  return null;
}

function tryPlace(ctx: AiDecisionContext, defId: string, x: number, y: number): boolean {
  const { state, services, player: p, cmds } = ctx;
  if (cmds.some((c) => c.type === 'build')) return false;
  const bdef = services.registry.buildings.get(defId);
  if (!bdef) return false;
  if (!bdef.requires.every((r) => p.unlockedTech.includes(r))) return false;
  if (remainingMana(ctx) < bdef.cost) return false;
  const spot = findPlacement(state, services, p.id, x, y, defId);
  if (!spot) return false;
  cmds.push({ type: 'build', playerId: p.id, defId, x: spot.x, y: spot.y });
  return true;
}

function setArmyRally(ctx: AiDecisionContext, cfg: AiStrategyConfig, home: { pos: { x: number; y: number } }): void {
  const { state, player: p, cmds } = ctx;
  const toward =
    pickAttackObjective(ctx, home.pos, cfg.combat.attackBias) ??
    omniscientEnemyHq(ctx)?.pos ?? { x: home.pos.x + 240, y: home.pos.y };
  const staging = stagingPoint(home.pos, toward, 200);
  for (const b of ownedBy(state, p.id)) {
    if (b.kind !== 'building' || b.buildProgress !== undefined) continue;
    if (b.defId !== cfg.production.armyBuilding && b.defId !== cfg.production.siegeBuilding) continue;
    const rally = getRally(b);
    if (rally && len(rally.x - staging.x, rally.y - staging.y) < 48) continue;
    cmds.push({ type: 'setRally', playerId: p.id, buildingId: b.id, x: staging.x, y: staging.y });
  }
}
