// Discriminated entity types — each kind owns only its relevant fields.
import type { Vec2 } from '../core/coords';
import type { EntityId, GameplayBuff, Order, PlayerId, Stance, UnitState } from './types';
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
  repairing?: boolean;
  chargingAttack?: { targetId: EntityId; remainingTicks: number };
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

export function isHarvester(e: Entity): e is UnitEntity & { caps: EntityCapabilities & { harvester: import('./capabilities/types').HarvesterCapability } } {
  return e.kind === 'unit' && e.caps?.harvester !== undefined;
}

export function isCombatUnit(e: Entity): e is UnitEntity {
  return e.kind === 'unit' && e.caps?.harvester === undefined;
}

/** @deprecated Use BurnLingerCapability from capabilities/types. */
export type { BurnLingerCapability as BurnLinger } from './capabilities/types';
