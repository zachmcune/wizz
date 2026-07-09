// Data-driven AI strategy driven by AiStrategyConfig JSON.
import type { BuildingEntity } from '../../sim/entity-types';
import { isHarvester, isCombatUnit } from '../../sim/types';
import { ownedBy, buildingsOf } from '../../sim/queries';
import { isPowerShort, buildingHasPower } from '../../sim/power';
import { getProductionQueue } from '../../sim/capabilities';
import type { AiDecisionContext, AiStrategy, AiStrategyConfig } from './types';
import {
  enemiesNear,
  findEnemySanctum,
  findPlacement,
  findSanctum,
  garrisonNearbyUnits,
  hasBuilding,
  idleCombat,
  nearestNode,
  pickAttackTarget,
} from '../shared';

export class ConfigDrivenStrategy implements AiStrategy {
  constructor(readonly config: AiStrategyConfig) {}

  decide(ctx: AiDecisionContext): void {
    const { state, services, player: p, difficulty: diff, cmds, skipCombat } = ctx;
    const reg = services.registry;
    const sanctum = findSanctum(state, p.id);
    if (!sanctum) return;

    const own = ownedBy(state, p.id);
    const wisps = own.filter(isHarvester);
    const combat = own.filter(isCombatUnit);
    const cfg = this.config;

    if (!skipCombat && p.unlockedTech.includes(cfg.superweapon.requiresBuilding)) {
      const beam = state.beams.find((b) => b.owner === p.id);
      const cd = p.spellCooldowns[cfg.superweapon.spellId] ?? 0;
      const target = findEnemySanctum(state, p.id) ?? pickAttackTarget(state, p.id, sanctum.pos, cfg.combat.attackBias);
      if (target) {
        if (beam && beam.state === 'firing') {
          cmds.push({ type: 'steerSuperweapon', playerId: p.id, x: target.pos.x, y: target.pos.y });
        } else if (!beam && cd === 0) {
          cmds.push({
            type: 'castSpell',
            playerId: p.id,
            spellId: cfg.superweapon.spellId,
            x: target.pos.x,
            y: target.pos.y,
          });
        }
      }
    }

    for (const w of wisps) {
      if (w.orders.length === 0 && w.state === 'idle') {
        const node = nearestNode(state, w);
        if (node) cmds.push({ type: 'harvest', playerId: p.id, entityIds: [w.id], nodeId: node.id });
      }
    }

    if (isPowerShort(state, p.id)) {
      const leyDef = reg.buildings.get('ley_conduit');
      if (leyDef && p.unlockedTech.includes('sanctum') && p.mana >= leyDef.cost) {
        const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, 'ley_conduit');
        if (spot) {
          cmds.push({ type: 'build', playerId: p.id, defId: 'ley_conduit', x: spot.x, y: spot.y });
          return;
        }
      }
    }

    for (const defId of cfg.buildOrder) {
      if (hasBuilding(state, p.id, defId)) continue;
      const bdef = reg.buildings.get(defId);
      if (!bdef) continue;
      if (!bdef.requires.every((r) => p.unlockedTech.includes(r))) break;
      if (p.mana < bdef.cost) return;
      const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, defId);
      if (spot) {
        cmds.push({ type: 'build', playerId: p.id, defId, x: spot.x, y: spot.y });
        return;
      }
    }

    const spire = buildingsOf(state, p.id).find(
      (b) => b.defId === cfg.production.harvesterBuilding && b.buildProgress === undefined,
    );
    if (spire && buildingHasPower(state, reg, spire) && wisps.length < diff.wispTarget) {
      const q = getProductionQueue(spire)?.length ?? 0;
      const wdef = reg.units.get(cfg.production.harvesterUnit);
      if (q === 0 && wdef && p.mana >= wdef.cost) {
        cmds.push({ type: 'produce', playerId: p.id, buildingId: spire.id, defId: cfg.production.harvesterUnit });
      }
    }

    this.produceArmy(ctx, combat.length);
    garrisonNearbyUnits(state, services, p.id, cfg.combat.garrisonUnit, cfg.garrisonRadius, cmds);

    const turret = cfg.turret;
    const turretDef = reg.buildings.get(turret.defId);
    if (
      turretDef &&
      !hasBuilding(state, p.id, turret.defId) &&
      hasBuilding(state, p.id, turret.requiresBuilding) &&
      combat.length >= Math.floor(diff.armyThreshold * turret.armyThresholdFactor) &&
      p.mana >= turretDef.cost * turret.manaReserveFactor
    ) {
      const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, turret.defId);
      if (spot) {
        cmds.push({ type: 'build', playerId: p.id, defId: turret.defId, x: spot.x, y: spot.y });
        return;
      }
    }

    if (p.unlockedTech.includes('arcane_nexus')) {
      for (const defId of cfg.advancedDefenses) {
        if (hasBuilding(state, p.id, defId)) continue;
        const bdef = reg.buildings.get(defId);
        if (!bdef || !bdef.requires.every((r) => p.unlockedTech.includes(r))) continue;
        const reserve = defId === 'celestial_cannon' ? 1.6 : 1.25;
        if (p.mana < bdef.cost * reserve) continue;
        const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, defId);
        if (spot) {
          cmds.push({ type: 'build', playerId: p.id, defId, x: spot.x, y: spot.y });
          return;
        }
      }
    }

    if (skipCombat) return;
    this.decideCombat(ctx, sanctum, combat);
  }

  private produceArmy(ctx: AiDecisionContext, combatCount: number): void {
    const { state, services, player: p, difficulty: diff, cmds } = ctx;
    const reg = services.registry;
    const prod = this.config.production;
    const circle = buildingsOf(state, p.id).find((b) => b.defId === prod.armyBuilding && b.buildProgress === undefined);
    const forge = buildingsOf(state, p.id).find((b) => b.defId === prod.siegeBuilding && b.buildProgress === undefined);

    const tryProduce = (building: BuildingEntity | undefined, defId: string): boolean => {
      if (!building || !buildingHasPower(state, reg, building)) return false;
      if ((getProductionQueue(building)?.length ?? 0) >= 2) return false;
      const udef = reg.units.get(defId);
      if (!udef || p.mana < udef.cost) return false;
      if (!udef.requires.every((r) => p.unlockedTech.includes(r))) return false;
      cmds.push({ type: 'produce', playerId: p.id, buildingId: building.id, defId });
      return true;
    };

    if (circle) {
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

  private decideCombat(
    ctx: AiDecisionContext,
    sanctum: BuildingEntity,
    combat: ReturnType<typeof ownedBy>,
  ): void {
    const { state, player: p, difficulty: diff, cmds } = ctx;
    const cfg = this.config.combat;
    const combatUnits = combat.filter(isCombatUnit);

    let attackPool = idleCombat(combatUnits);
    const minPush = Math.max(4, Math.floor(diff.armyThreshold * cfg.minPushFactor));
    if (combatUnits.length < minPush && attackPool.length < 4) return;

    const threats = enemiesNear(state, p.id, sanctum.pos.x, sanctum.pos.y, this.config.defendRadius);
    if (threats.length > 0 && attackPool.length >= 4) {
      const defendCount = Math.min(Math.floor(attackPool.length * cfg.defendFraction), Math.max(2, threats.length + 1));
      const defenders = attackPool.slice(0, defendCount);
      attackPool = attackPool.slice(defendCount);
      cmds.push({ type: 'attack', playerId: p.id, entityIds: defenders, targetId: threats[0]!.id });
    }

    if (attackPool.length < Math.floor(minPush / 2)) return;

    const enemyHq = findEnemySanctum(state, p.id);
    const siegeIdle = combatUnits.filter((e) => e.defId === cfg.siegeUnit && e.orders.length === 0).map((e) => e.id);
    const siegeReady = siegeIdle.filter((id) => attackPool.includes(id));
    if (enemyHq && siegeReady.length > 0) {
      const push = [...new Set([...siegeReady, ...attackPool])].slice(0, Math.max(siegeReady.length + 3, minPush));
      cmds.push({ type: 'attackMove', playerId: p.id, entityIds: push, x: enemyHq.pos.x, y: enemyHq.pos.y });
      return;
    }

    const target = pickAttackTarget(state, p.id, sanctum.pos, cfg.attackBias);
    if (target) {
      cmds.push({ type: 'attackMove', playerId: p.id, entityIds: attackPool, x: target.pos.x, y: target.pos.y });
    }
  }
}
