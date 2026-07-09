// Discriminated entity types — each kind owns only its relevant fields.
import type { Vec2 } from '../core/coords';
import type { EntityId, GameplayBuff, Order, PlayerId, ProductionItem, Stance, UnitState } from './types';
import type { EntityCapabilities } from './capabilities/types';

export interface EntityCore {
  id: EntityId;
  owner: PlayerId;
  defId: string;
  pos: Vec2;
  vel: Vec2;
  facing: number;
  hp: number;
  maxHp: number;
  radius: number;
}

export interface UnitEntity extends EntityCore {
  kind: 'unit';
  caps?: EntityCapabilities;
  orders: Order[];
  state: UnitState;
  stance: Stance;
  targetId?: EntityId;
  cooldowns: Record<string, number>;
  buffs: GameplayBuff[];
  carry?: number;
  carryMax?: number;
  homeSpireId?: EntityId;
  morphProgress?: number;
  morphAction?: 'deploy' | 'pack';
  morphTargetPos?: Vec2;
  morphTargetDefId?: string;
  channeling?: boolean;
  channelTicks?: number;
  garrisonedIn?: EntityId;
  frostExposure?: number;
  burnLinger?: BurnLinger;
}

/** Runtime state for a tower's continuous beam weapon. */
export interface TowerBeamState {
  targetId: EntityId;
  facing: number;
  ticksSinceDamage: number;
  wobblePhase: number;
  lastHitIds: EntityId[];
}

/** Short burn applied after leaving an inferno beam. */
export interface BurnLinger {
  remaining: number;
  damagePerTick: number;
  vs: Record<string, number>;
  sourceId: EntityId;
}

export interface BuildingEntity extends EntityCore {
  kind: 'building';
  caps?: EntityCapabilities;
  orders: Order[];
  state: UnitState;
  stance: Stance;
  cooldowns: Record<string, number>;
  buffs: GameplayBuff[];
  buildProgress?: number;
  productionQueue?: ProductionItem[];
  researchQueue?: ProductionItem[];
  rally?: Vec2;
  repairing?: boolean;
  morphProgress?: number;
  morphAction?: 'pack';
  garrisonedIds?: EntityId[];
  garrisonReservedIds?: EntityId[];
  chargingAttack?: { targetId: EntityId; remainingTicks: number };
  beamAttack?: TowerBeamState;
  frostExposure?: number;
  burnLinger?: BurnLinger;
}

/** Slim projectile entity — combat fields live in caps.projectile only. */
export interface ProjectileEntity extends EntityCore {
  kind: 'projectile';
  caps: EntityCapabilities & { projectile: import('./capabilities/types').ProjectileCapability };
}

export interface ResourceNodeEntity extends EntityCore {
  kind: 'resource_node';
  amount: number;
  amountMax: number;
}

export type Entity = UnitEntity | BuildingEntity | ProjectileEntity | ResourceNodeEntity;

export function isUnit(e: Entity): e is UnitEntity {
  return e.kind === 'unit';
}

export function isBuilding(e: Entity): e is BuildingEntity {
  return e.kind === 'building';
}

export function isProjectile(e: Entity): e is ProjectileEntity {
  return e.kind === 'projectile';
}

export function isResourceNode(e: Entity): e is ResourceNodeEntity {
  return e.kind === 'resource_node';
}

export function isHarvester(e: Entity): e is UnitEntity & { carryMax: number } {
  return e.kind === 'unit' && e.carryMax !== undefined;
}

export function isCombatUnit(e: Entity): e is UnitEntity {
  return e.kind === 'unit' && e.carryMax === undefined;
}
