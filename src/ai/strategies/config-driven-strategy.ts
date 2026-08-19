// Data-driven AI strategy: build order from JSON, tactics scaled by difficulty profile.
import { ownedBy } from '../../sim/queries';
import { isPowerShort, buildingHasPower } from '../../sim/power';
import { getProductionQueue } from '../../sim/capabilities';
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
import { roll } from '../chance';
import { findPlacement, findSanctum, garrisonNearbyUnits, hasBuilding, isArmyUnit } from '../shared';

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
        p.mana >= leyDef.cost
      ) {
        const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, 'ley_conduit');
        if (spot) cmds.push({ type: 'build', playerId: p.id, defId: 'ley_conduit', x: spot.x, y: spot.y });
      }
    }

    for (const defId of cfg.buildOrder) {
      if (hasBuilding(state, p.id, defId)) continue;
      const bdef = reg.buildings.get(defId);
      if (!bdef) continue;
      if (!bdef.requires.every((r) => p.unlockedTech.includes(r))) break;
      if (p.mana < bdef.cost) break;
      const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, defId);
      if (spot) {
        cmds.push({ type: 'build', playerId: p.id, defId, x: spot.x, y: spot.y });
        return;
      }
      break;
    }

    const spire = own.find(
      (e) => e.kind === 'building' && e.defId === cfg.production.harvesterBuilding && e.buildProgress === undefined,
    );
    const wisps = own.filter((e) => e.kind === 'unit' && e.defId === cfg.production.harvesterUnit);
    if (spire && spire.kind === 'building' && wisps.length < diff.wispTarget) {
      if (buildingHasPower(state, reg, spire)) {
        const q = getProductionQueue(spire)?.length ?? 0;
        const wdef = reg.units.get(cfg.production.harvesterUnit);
        if (q === 0 && wdef && p.mana >= wdef.cost) {
          cmds.push({ type: 'produce', playerId: p.id, buildingId: spire.id, defId: cfg.production.harvesterUnit });
        }
      }
    }

    trainWeavers(ctx, cfg, army.length);
    channelWeavers(ctx, cfg, sanctum);
    produceArmy(ctx, cfg, army.length);
    garrisonNearbyUnits(state, services, p.id, cfg.combat.garrisonUnit, cfg.garrisonRadius, cmds);
    repairOwnBuildings(ctx);

    if (!roll(state.tick, p.id, 'defense-build', profile.missChance)) {
      const turret = cfg.turret;
      const turretDef = reg.buildings.get(turret.defId);
      if (
        turretDef &&
        !hasBuilding(state, p.id, turret.defId) &&
        hasBuilding(state, p.id, turret.requiresBuilding) &&
        army.length >= Math.floor(diff.armyThreshold * turret.armyThresholdFactor) &&
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
    }

    if (skipCombat) return;
    decideSpells(ctx, cfg, army);
    decideScout(ctx, cfg, army);
    decideCombat(ctx, cfg, sanctum, army);
  }
}
