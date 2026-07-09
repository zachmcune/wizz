// Typed capability payloads attached to entities. Incremental composition model —
// start with projectiles; units/buildings keep flat fields until migrated.
import type { EntityId, PlayerId } from '../types';
import type { ArmorClass, WeaponDef } from '../../data/defs';

/** In-flight projectile behavior — replaces scattered proj* fields on ProjectileEntity. */
export interface ProjectileCapability {
  targetId: EntityId;
  damage: number;
  armorVs: Record<ArmorClass, number>;
  speed: number;
  sourceOwner: PlayerId;
  sourceId: EntityId;
  splashRadius?: number;
  impactRadius?: number;
  onHitStatus?: WeaponDef['onHitStatus'];
}

/** Capability slots that may appear on any entity kind. */
export interface EntityCapabilities {
  projectile?: ProjectileCapability;
}

export type CapabilityKind = keyof EntityCapabilities;
