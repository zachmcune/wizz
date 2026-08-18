// Ground vs air mobility. Air units ignore ground nav; they still use Vec2 positions.
import type { Registry } from '../data/registry';
import type { UnitDef, WeaponDef } from '../data/defs';
import type { Entity } from './types';

export type Mobility = 'ground' | 'air';

export function mobilityOf(def: UnitDef | undefined): Mobility {
  return def?.mobility === 'air' ? 'air' : 'ground';
}

export function isAirEntity(registry: Registry, e: Entity): boolean {
  if (e.kind !== 'unit') return false;
  return mobilityOf(registry.units.get(e.defId)) === 'air';
}

export type WeaponTargeting = Pick<WeaponDef, 'targetsAir' | 'targetsGround'>;

export function weaponHitsLayer(weapon: WeaponTargeting, targetIsAir: boolean): boolean {
  if (targetIsAir) return weapon.targetsAir === true;
  return weapon.targetsGround !== false;
}

export function weaponHitsEntity(registry: Registry, weapon: WeaponTargeting, target: Entity): boolean {
  return weaponHitsLayer(weapon, isAirEntity(registry, target));
}
