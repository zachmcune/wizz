// Unified stat modifier pipeline: resolves effective stats from base defs + research + buffs.
import type { Registry } from '../data/registry';
import type { BalanceData, BuildingDef, ResearchEffect, UnitDef, WeaponDef } from '../data/defs';
import type { Entity, Player } from './types';
import { hasResearch, applyResearchOperation } from './research-effects';
import { hasBuff, strongestSlowAttackCooldownFactor, strongestSlowMoveFactor } from './queries';

export type UnitStat = 'hp' | 'speed' | 'damage' | 'range' | 'cooldownTicks';
export type BuildingStat = 'hp' | 'sight' | 'powerUsed' | 'powerProduced';
export type EconomyStat = 'siphonPerSecond' | 'repairHpPerTick' | 'repairManaPerHp';

function matchesUnit(effect: ResearchEffect, def: UnitDef): boolean {
  if (effect.kind !== 'unitStatModifier') return false;
  if (effect.unitIds?.length && !effect.unitIds.includes(def.id)) return false;
  if (effect.roles?.length && !effect.roles.includes(def.role)) return false;
  return true;
}

function matchesBuilding(effect: ResearchEffect, def: BuildingDef): boolean {
  if (effect.kind !== 'buildingStatModifier') return false;
  if (effect.buildingIds?.length && !effect.buildingIds.includes(def.id)) return false;
  return true;
}

function applyResearchEffects(
  player: Player,
  registry: Registry,
  base: number,
  stat: string,
  match: (effect: ResearchEffect) => boolean,
): number {
  let value = base;
  for (const researchId of player.completedResearch) {
    const research = registry.research.get(researchId);
    if (!research) continue;
    for (const effect of research.effects) {
      if (!match(effect)) continue;
      if ('stat' in effect && effect.stat === stat) {
        value = applyResearchOperation(value, effect.operation, effect.value);
      }
    }
  }
  return value;
}

export function resolveUnitStat(
  registry: Registry,
  player: Player,
  def: UnitDef,
  stat: UnitStat,
  tick: number,
  entity?: Entity,
): number {
  let base: number;
  switch (stat) {
    case 'hp':
      base = def.hp;
      break;
    case 'speed':
      base = def.speed;
      if (entity?.kind === 'unit' && hasBuff(entity, 'haste', tick)) base *= 1.5;
      if (entity?.kind === 'unit') base *= strongestSlowMoveFactor(entity, tick);
      return applyResearchEffects(player, registry, base, stat, (e) => matchesUnit(e, def));
    case 'damage':
      base = def.weapon?.damage ?? 0;
      break;
    case 'range':
      base = def.weapon?.range ?? 0;
      break;
    case 'cooldownTicks':
      base = def.weapon?.cooldownTicks ?? 0;
      if (entity?.kind === 'unit') base *= strongestSlowAttackCooldownFactor(entity, tick);
      return applyResearchEffects(player, registry, base, stat, (e) => matchesUnit(e, def));
    default:
      base = 0;
  }
  return applyResearchEffects(player, registry, base, stat, (e) => matchesUnit(e, def));
}

export function resolveWeaponStat(
  registry: Registry,
  player: Player,
  ownerEntity: Entity,
  weapon: WeaponDef,
  stat: 'damage' | 'range' | 'cooldownTicks',
  tick: number,
): number {
  if (ownerEntity.kind === 'unit') {
    const def = registry.units.get(ownerEntity.defId);
    if (def) return resolveUnitStat(registry, player, def, stat === 'cooldownTicks' ? 'cooldownTicks' : stat, tick, ownerEntity);
  }
  if (ownerEntity.kind === 'building') {
    const def = registry.buildings.get(ownerEntity.defId);
    if (!def) return weapon[stat];
    let base = weapon[stat];
    base = applyResearchEffects(player, registry, base, stat, (e) => matchesBuilding(e, def));
    if (stat === 'cooldownTicks' && ownerEntity.kind === 'building') {
      base *= strongestSlowAttackCooldownFactor(ownerEntity, tick);
    }
    return base;
  }
  return weapon[stat];
}

export function resolveBuildingStat(
  registry: Registry,
  player: Player,
  def: BuildingDef,
  stat: BuildingStat,
): number {
  let base: number;
  switch (stat) {
    case 'hp':
      base = def.hp;
      break;
    case 'sight':
      base = def.sight;
      break;
    case 'powerUsed':
      base = def.powerUsed ?? 0;
      break;
    case 'powerProduced':
      base = def.powerProduced ?? 0;
      break;
    default:
      base = 0;
  }
  return applyResearchEffects(player, registry, base, stat, (e) => matchesBuilding(e, def));
}

export function resolveEconomyStat(
  registry: Registry,
  player: Player,
  balance: BalanceData,
  stat: EconomyStat,
): number {
  let base: number;
  switch (stat) {
    case 'siphonPerSecond':
      base = balance.siphonPerSecond;
      break;
    case 'repairHpPerTick':
      base = balance.repairHpPerTick;
      break;
    case 'repairManaPerHp':
      base = balance.repairManaPerHp;
      break;
    default:
      base = 0;
  }
  for (const researchId of player.completedResearch) {
    const research = registry.research.get(researchId);
    if (!research) continue;
    for (const effect of research.effects) {
      if (effect.kind === 'economyModifier' && effect.stat === stat) {
        base = applyResearchOperation(base, effect.operation, effect.value);
      }
    }
  }
  return base;
}

export function playerHasResearch(player: Player, researchId: string): boolean {
  return hasResearch(player, researchId);
}
