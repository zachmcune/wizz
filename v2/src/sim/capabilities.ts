// Typed capability payloads attached to entities.
//
// v1 scattered behaviour-specific fields across the entity object (`productionQueue`,
// `garrisonedIn`, `repairing`, `chargingAttack`, ...). That made every entity type carry every
// other type's state and made it hard to tell which system owned what.
//
// v2 keeps variable-size state in a single `caps` bag on `EntityExtra`, but every field is
// strongly typed through the interfaces below and accessed only through the helpers in this file.
// The bag is empty for most entities, so the per-entity cost is one object allocation at spawn.

import type { ArmorClass } from '../data/defs';
import type { Buff, EntityId, Order, ProductionItem, Stance, UnitState } from './types';
import type { EntityExtra, EntityStore } from './entity-store';
import { STATE_CHANNELING, STATE_DEAD, STATE_GARRISONED, STATE_IDLE } from './entity-store';

// ---------------------------------------------------------------------------- capability shapes

/** In-flight projectile payload. */
export interface ProjectileCap {
  targetId: EntityId;
  damage: number;
  armorVs: Record<ArmorClass, number>;
  speed: number;
  sourceOwner: string;
  sourceId: EntityId;
  splashRadius?: number;
  impactRadius?: number;
  onHitStatus?: { kind: 'slow'; durationTicks: number; moveFactor: number; attackCooldownFactor: number };
  targetsAir?: boolean;
  targetsGround?: boolean;
}

/** Wisp-style harvester. `carryMax` comes from the unit def so upgrades can raise it. */
export interface HarvesterCap {
  carry: number;
  carryMax: number;
}

/** Mana Weaver conjure channel. */
export interface ChannelerCap {
  channeling: boolean;
  channelTicks: number;
}

/** Unit garrisoned inside a bunker. */
export interface GarrisonableCap {
  garrisonedIn: EntityId;
}

/** Producer building: unit/research queues and rally point. */
export interface ProductionCap {
  productionQueue?: ProductionItem[];
  researchQueue?: ProductionItem[];
  rally?: { x: number; y: number };
}

/** Building that hosts garrisoned units. */
export interface GarrisonHostCap {
  garrisonedIds: EntityId[];
  garrisonReservedIds: EntityId[];
}

/** Continuous beam runtime state (Inferno Beacon, Frost Spire). */
export interface BeamWeaponCap {
  targetId: EntityId;
  facing: number;
  ticksSinceDamage: number;
  wobblePhase: number;
  lastHitIds: EntityId[];
}

/** Smooth-tracking turret runtime state (Arcane Sentry). */
export interface TurretWeaponCap {
  angularVelocity: number;
  crystalIndex: number;
  hadTarget: boolean;
}

/** Mobile HQ deploy/pack progress. */
export interface MorphCap {
  progress: number;
  action: 'deploy' | 'pack';
  targetX?: number;
  targetY?: number;
}

/** Frost exposure buildup on a unit/building. */
export interface FrostExposureCap {
  exposure: number;
}

/** Lingering burn after leaving a flame beam. */
export interface BurnLingerCap {
  remaining: number;
  damagePerTick: number;
  vs: Record<ArmorClass, number>;
  sourceId: EntityId;
}

/** Building under construction / repair / charge-up state. */
export interface BuildingCap {
  /** 0..1 while under construction; undefined when complete. */
  buildProgress?: number;
  repairing?: boolean;
  chargingAttack?: { targetId: EntityId; remainingTicks: number };
}

// ------------------------------------------------------------------------------ accessor helpers

function caps(ex: EntityExtra): Record<string, unknown> {
  return ex.caps;
}

export function getCap<T>(ex: EntityExtra, key: string): T | undefined {
  return caps(ex)[key] as T | undefined;
}

export function setCap(ex: EntityExtra, key: string, value: unknown): void {
  caps(ex)[key] = value;
}

export function clearCap(ex: EntityExtra, key: string): void {
  delete caps(ex)[key];
}

// Projectiles ------------------------------------------------------------------------------
export function getProjectile(ex: EntityExtra): ProjectileCap | undefined {
  return getCap<ProjectileCap>(ex, 'projectile');
}
export function setProjectile(ex: EntityExtra, cap: ProjectileCap): void {
  setCap(ex, 'projectile', cap);
}

// Harvesters -------------------------------------------------------------------------------
export function getHarvester(ex: EntityExtra): HarvesterCap | undefined {
  return getCap<HarvesterCap>(ex, 'harvester');
}
export function ensureHarvester(ex: EntityExtra, carryMax: number): HarvesterCap {
  const existing = getHarvester(ex);
  if (existing) return existing;
  const created: HarvesterCap = { carry: 0, carryMax };
  setCap(ex, 'harvester', created);
  return created;
}

// Channeling -------------------------------------------------------------------------------
export function getChanneler(ex: EntityExtra): ChannelerCap | undefined {
  return getCap<ChannelerCap>(ex, 'channeler');
}
export function ensureChanneler(ex: EntityExtra): ChannelerCap {
  const existing = getChanneler(ex);
  if (existing) return existing;
  const created: ChannelerCap = { channeling: false, channelTicks: 0 };
  setCap(ex, 'channeler', created);
  return created;
}
export function isChanneling(ex: EntityExtra): boolean {
  return getChanneler(ex)?.channeling === true;
}

// Garrison ---------------------------------------------------------------------------------
export function getGarrisonable(ex: EntityExtra): GarrisonableCap | undefined {
  return getCap<GarrisonableCap>(ex, 'garrisonable');
}
export function garrisonedInId(ex: EntityExtra): EntityId | undefined {
  return getGarrisonable(ex)?.garrisonedIn;
}
export function setGarrisonedIn(ex: EntityExtra, buildingId: EntityId): void {
  setCap(ex, 'garrisonable', { garrisonedIn: buildingId });
}
export function clearGarrisonedIn(ex: EntityExtra): void {
  clearCap(ex, 'garrisonable');
}

export function getGarrisonHost(ex: EntityExtra): GarrisonHostCap | undefined {
  return getCap<GarrisonHostCap>(ex, 'garrisonHost');
}
export function ensureGarrisonHost(ex: EntityExtra): GarrisonHostCap {
  const existing = getGarrisonHost(ex);
  if (existing) return existing;
  const created: GarrisonHostCap = { garrisonedIds: [], garrisonReservedIds: [] };
  setCap(ex, 'garrisonHost', created);
  return created;
}
export function clearGarrisonHost(ex: EntityExtra): void {
  clearCap(ex, 'garrisonHost');
}
export function garrisonedIds(ex: EntityExtra): EntityId[] {
  return getGarrisonHost(ex)?.garrisonedIds ?? EMPTY_IDS;
}
export function garrisonReservedIds(ex: EntityExtra): EntityId[] {
  return getGarrisonHost(ex)?.garrisonReservedIds ?? EMPTY_IDS;
}
const EMPTY_IDS: EntityId[] = [];

// Production -------------------------------------------------------------------------------
export function getProduction(ex: EntityExtra): ProductionCap | undefined {
  return getCap<ProductionCap>(ex, 'production');
}
export function ensureProduction(ex: EntityExtra): ProductionCap {
  const existing = getProduction(ex);
  if (existing) return existing;
  const created: ProductionCap = { productionQueue: [], researchQueue: [] };
  setCap(ex, 'production', created);
  return created;
}
export function getProductionQueue(ex: EntityExtra): ProductionItem[] | undefined {
  return getProduction(ex)?.productionQueue;
}
export function getResearchQueue(ex: EntityExtra): ProductionItem[] | undefined {
  return getProduction(ex)?.researchQueue;
}
export function getRally(ex: EntityExtra): { x: number; y: number } | undefined {
  return getProduction(ex)?.rally;
}

// Beam weapons -----------------------------------------------------------------------------
export function getBeamWeapon(ex: EntityExtra): BeamWeaponCap | undefined {
  return getCap<BeamWeaponCap>(ex, 'beamWeapon');
}
export function setBeamWeapon(ex: EntityExtra, cap: BeamWeaponCap): void {
  setCap(ex, 'beamWeapon', cap);
}
export function clearBeamWeapon(ex: EntityExtra): void {
  clearCap(ex, 'beamWeapon');
}

// Turrets ----------------------------------------------------------------------------------
export function ensureTurret(ex: EntityExtra): TurretWeaponCap {
  const existing = getCap<TurretWeaponCap>(ex, 'turret');
  if (existing) return existing;
  const created: TurretWeaponCap = { angularVelocity: 0, crystalIndex: 0, hadTarget: false };
  setCap(ex, 'turret', created);
  return created;
}

// Morph (mobile HQ) ------------------------------------------------------------------------
export function getMorph(ex: EntityExtra): MorphCap | undefined {
  return getCap<MorphCap>(ex, 'morph');
}
export function hasMorph(ex: EntityExtra): boolean {
  return getMorph(ex) !== undefined;
}
export function ensureMorph(ex: EntityExtra, action: 'deploy' | 'pack' = 'deploy'): MorphCap {
  const existing = getMorph(ex);
  if (existing) return existing;
  const created: MorphCap = { progress: 0, action };
  setCap(ex, 'morph', created);
  return created;
}

// Status effects ---------------------------------------------------------------------------
export function getFrostExposure(ex: EntityExtra): number {
  return getCap<FrostExposureCap>(ex, 'frostExposure')?.exposure ?? 0;
}
export function setFrostExposure(ex: EntityExtra, exposure: number): void {
  if (exposure <= 0) clearCap(ex, 'frostExposure');
  else setCap(ex, 'frostExposure', { exposure });
}
export function getBurnLinger(ex: EntityExtra): BurnLingerCap | undefined {
  return getCap<BurnLingerCap>(ex, 'burnLinger');
}
export function setBurnLinger(ex: EntityExtra, cap: BurnLingerCap): void {
  setCap(ex, 'burnLinger', cap);
}
export function clearBurnLinger(ex: EntityExtra): void {
  clearCap(ex, 'burnLinger');
}

// Building construction / repair -----------------------------------------------------------
export function getBuildingCap(ex: EntityExtra): BuildingCap | undefined {
  return getCap<BuildingCap>(ex, 'building');
}
export function ensureBuildingCap(ex: EntityExtra): BuildingCap {
  const existing = getBuildingCap(ex);
  if (existing) return existing;
  const created: BuildingCap = {};
  setCap(ex, 'building', created);
  return created;
}
export function buildProgressOf(ex: EntityExtra): number | undefined {
  return getBuildingCap(ex)?.buildProgress;
}
export function isUnderConstruction(ex: EntityExtra): boolean {
  return getBuildingCap(ex)?.buildProgress !== undefined;
}

// ------------------------------------------------------------------------------------ orders

/** The active order, or undefined. */
export function activeOrder<T extends Order['type']>(ex: EntityExtra, type: T): Extract<Order, { type: T }> | undefined {
  const o = ex.orders[0] as Order | undefined;
  return o?.type === type ? (o as Extract<Order, { type: T }>) : undefined;
}

export function pushOrder(ex: EntityExtra, order: Order): void {
  ex.orders.push(order);
}

export function clearOrders(ex: EntityExtra): void {
  ex.orders.length = 0;
}

// ------------------------------------------------------------------------------------ views

/**
 * A read/write view over one entity slot. Constructing one per unit per tick would allocate, so
 * systems take the indices they need directly instead; this view exists for command handlers and
 * tests where clarity beats raw speed.
 */
export interface EntityView {
  slot: number;
  id: EntityId;
  kind: number;
  state: UnitState;
  stance: Stance;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  owner: string;
  defId: string;
  extra: EntityExtra;
  orders: unknown[];
  buffs: Buff[];
}

export function viewOf(store: EntityStore, slot: number): EntityView {
  const ex = store.extras[slot]!;
  return {
    slot,
    id: store.id[slot]!,
    kind: store.kind[slot]!,
    state: UNIT_STATE_NAME(store.state[slot]!),
    stance: STANCE_NAME(store.stance[slot]!),
    x: store.posX[slot]!,
    y: store.posY[slot]!,
    hp: store.hp[slot]!,
    maxHp: store.maxHp[slot]!,
    radius: store.radius[slot]!,
    owner: store.ownerId(store.ownerIndex[slot]!),
    defId: ex.defId,
    extra: ex,
    orders: ex.orders,
    buffs: ex.buffs as Buff[],
  };
}

function UNIT_STATE_NAME(code: number): UnitState {
  switch (code) {
    case 1:
      return 'moving';
    case 2:
      return 'attacking';
    case 3:
      return 'harvesting';
    case 4:
      return 'returning';
    case STATE_CHANNELING:
      return 'channeling';
    case 6:
      return 'producing';
    case 7:
      return 'building';
    case STATE_GARRISONED:
      return 'garrisoned';
    case STATE_DEAD:
      return 'dead';
    default:
      return 'idle';
  }
}

function STANCE_NAME(code: number): Stance {
  return code === 1 ? 'hold' : code === 2 ? 'standground' : 'aggressive';
}

export { STATE_IDLE };
