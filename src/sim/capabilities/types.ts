// Typed capability payloads attached to entities. Incremental composition model —
// units/buildings/projectiles store behavior-specific state in caps slots.
import type { Vec2 } from '../../core/coords';
import type { EntityId, PlayerId, ProductionItem } from '../types';
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

/** Wisp-style harvester: carry mana from nodes to a refinery. */
export interface HarvesterCapability {
  carry: number;
  carryMax: number;
  homeSpireId?: EntityId;
}

/** Mana Weaver conjure-mana channeling. */
export interface ChannelerCapability {
  channeling: boolean;
  channelTicks?: number;
}

/** Unit garrisoned inside a bunker or transport. */
export interface GarrisonableCapability {
  garrisonedIn: EntityId;
}

/** Producer building: unit/research queues and rally point. */
export interface ProductionCapability {
  productionQueue?: ProductionItem[];
  researchQueue?: ProductionItem[];
  rally?: Vec2;
}

/** Building that hosts garrisoned units. */
export interface GarrisonHostCapability {
  garrisonedIds: EntityId[];
  garrisonReservedIds: EntityId[];
}

/** Continuous beam weapon runtime state (Inferno Beacon, Frost Spire). */
export interface BeamWeaponCapability {
  targetId: EntityId;
  facing: number;
  ticksSinceDamage: number;
  wobblePhase: number;
  lastHitIds: EntityId[];
}

/** Smooth-tracking turret runtime state (Arcane Sentry). */
export interface TurretWeaponCapability {
  angularVelocity: number;
  crystalIndex: number;
  hadTarget: boolean;
}

/** Mobile HQ deploy/pack progress. */
export interface MorphCapability {
  progress: number;
  action: 'deploy' | 'pack';
  targetPos?: Vec2;
  targetDefId?: string;
}

/** Frost spire slow buildup on a unit or building. */
export interface FrostExposureCapability {
  exposure: number;
}

/** Inferno beam burn that lingers after leaving the cone. */
export interface BurnLingerCapability {
  remaining: number;
  damagePerTick: number;
  vs: Record<string, number>;
  sourceId: EntityId;
}

/** Capability slots that may appear on any entity kind. */
export interface EntityCapabilities {
  projectile?: ProjectileCapability;
  harvester?: HarvesterCapability;
  channeler?: ChannelerCapability;
  garrisonable?: GarrisonableCapability;
  production?: ProductionCapability;
  garrisonHost?: GarrisonHostCapability;
  beamWeapon?: BeamWeaponCapability;
  turretWeapon?: TurretWeaponCapability;
  morph?: MorphCapability;
  frost?: FrostExposureCapability;
  burnLinger?: BurnLingerCapability;
}

export type CapabilityKind = keyof EntityCapabilities;
