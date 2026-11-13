// Unified stat modification: base def → research → buffs.
//
// This is the single place where "what is this unit's actual speed/damage/HP right now" is
// answered. Keeping it in one function is what makes the research tree (Phase 1 content) actually
// take effect, and it is where the two accepted rule changes would have gone had they needed stat
// plumbing.

import type { Registry } from '../data/registry';
import type { BuildingDef, ResearchEffect, UnitDef, WeaponDef } from '../data/defs';
import type { Player } from './types';
import { hasBuff, strongestSlowAttackCooldownFactor, strongestSlowMoveFactor } from './queries';
import type { GameState } from './types';

export type UnitStat = 'hp' | 'speed' | 'damage' | 'range' | 'cooldownTicks';
export type BuildingStat = 'hp' | 'sight' | 'powerUsed' | 'powerProduced';
export type EconomyStat = 'siphonPerSecond' | 'repairHpPerTick' | 'repairManaPerHp';

export function applyResearchOperation(value: number, operation: 'add' | 'multiply', amount: number): number {
  return operation === 'add' ? value + amount : value * amount;
}

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

/** Fold every completed research into a base value. */
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
  state: GameState,
  registry: Registry,
  player: Player,
  def: UnitDef,
  stat: UnitStat,
  slot?: number,
): number {
  switch (stat) {
    case 'hp':
      return applyResearchEffects(player, registry, def.hp, stat, (e) => matchesUnit(e, def));
    case 'speed': {
      let base = def.speed;
      if (slot !== undefined) {
        if (hasBuff(state, slot, 'haste')) base *= 1.5;
        base *= strongestSlowMoveFactor(state, slot);
      }
      return applyResearchEffects(player, registry, base, stat, (e) => matchesUnit(e, def));
    }
    case 'damage':
      return applyResearchEffects(player, registry, def.weapon?.damage ?? 0, stat, (e) => matchesUnit(e, def));
    case 'range':
      return applyResearchEffects(player, registry, def.weapon?.range ?? 0, stat, (e) => matchesUnit(e, def));
    case 'cooldownTicks': {
      let base = def.weapon?.cooldownTicks ?? 0;
      if (slot !== undefined) base *= strongestSlowAttackCooldownFactor(state, slot);
      return applyResearchEffects(player, registry, base, stat, (e) => matchesUnit(e, def));
    }
  }
}

export function resolveWeaponStat(
  state: GameState,
  registry: Registry,
  player: Player,
  slot: number,
  weapon: WeaponDef,
  stat: 'damage' | 'range' | 'cooldownTicks',
): number {
  const store = state.entities;
  const defId = store.extras[slot]!.defId;
  if (store.kind[slot] === 0) {
    const def = registry.units.get(defId);
    if (def) return resolveUnitStat(state, registry, player, def, stat, slot);
  }
  if (store.kind[slot] === 1) {
    const def = registry.buildings.get(defId);
    let base = weapon[stat];
    if (def) base = applyResearchEffects(player, registry, base, stat, (e) => matchesBuilding(e, def));
    if (stat === 'cooldownTicks') base *= strongestSlowAttackCooldownFactor(state, slot);
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
  const base =
    stat === 'hp'
      ? def.hp
      : stat === 'sight'
        ? def.sight
        : stat === 'powerUsed'
          ? (def.powerUsed ?? 0)
          : (def.powerProduced ?? 0);
  return applyResearchEffects(player, registry, base, stat, (e) => matchesBuilding(e, def));
}

export function resolveEconomyStat(
  registry: Registry,
  player: Player,
  stat: EconomyStat,
): number {
  const base =
    stat === 'siphonPerSecond'
      ? registry.balance.siphonPerSecond
      : stat === 'repairHpPerTick'
        ? registry.balance.repairHpPerTick
        : registry.balance.repairManaPerHp;
  let value = base;
  for (const researchId of player.completedResearch) {
    const research = registry.research.get(researchId);
    if (!research) continue;
    for (const effect of research.effects) {
      if (effect.kind === 'economyModifier' && effect.stat === stat) {
        value = applyResearchOperation(value, effect.operation, effect.value);
      }
    }
  }
  return value;
}
