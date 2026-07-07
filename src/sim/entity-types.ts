// Discriminated entity types — each kind owns only its relevant fields.
import type { Vec2 } from '../core/coords';
import type { Buff, EntityId, Order, PlayerId, ProductionItem, Stance, UnitState } from './types';

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
  orders: Order[];
  state: UnitState;
  stance: Stance;
  targetId?: EntityId;
  cooldowns: Record<string, number>;
  buffs: Buff[];
  carry?: number;
  carryMax?: number;
  homeSpireId?: EntityId;
  morphProgress?: number;
  morphAction?: 'deploy' | 'pack';
  morphTargetPos?: Vec2;
  morphTargetDefId?: string;
  channeling?: boolean;
  channelTicks?: number;
}

export interface BuildingEntity extends EntityCore {
  kind: 'building';
  orders: Order[];
  state: UnitState;
  stance: Stance;
  cooldowns: Record<string, number>;
  buffs: Buff[];
  buildProgress?: number;
  productionQueue?: ProductionItem[];
  rally?: Vec2;
  repairing?: boolean;
  morphProgress?: number;
  morphAction?: 'pack';
}

export interface ProjectileEntity extends EntityCore {
  kind: 'projectile';
  orders: Order[];
  state: UnitState;
  stance: Stance;
  cooldowns: Record<string, number>;
  buffs: Buff[];
  projTargetId?: EntityId;
  projDamage?: number;
  projArmorVs?: Record<string, number>;
  projSpeed?: number;
  projSourceOwner?: PlayerId;
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
