// Capability accessors — the supported way to read/write entity capability state.
import type { Vec2 } from '../../core/coords';
import type { ArmorClass } from '../../data/defs';
import type { Entity, EntityId, PlayerId, ProductionItem } from '../types';
import type { BuildingEntity, ProjectileEntity, UnitEntity } from '../entity-types';
import type {
  BeamWeaponCapability,
  BurnLingerCapability,
  ChannelerCapability,
  EntityCapabilities,
  FrostExposureCapability,
  GarrisonableCapability,
  GarrisonHostCapability,
  HarvesterCapability,
  MorphCapability,
  ProductionCapability,
  ProjectileCapability,
  TurretWeaponCapability,
} from './types';

export type {
  EntityCapabilities,
  ProjectileCapability,
  HarvesterCapability,
  ChannelerCapability,
  GarrisonableCapability,
  ProductionCapability,
  GarrisonHostCapability,
  BeamWeaponCapability,
  MorphCapability,
  FrostExposureCapability,
  BurnLingerCapability,
  TurretWeaponCapability,
  CapabilityKind,
} from './types';

export function getCapabilities(e: Entity): EntityCapabilities {
  if (e.kind === 'projectile') return e.caps;
  if (e.kind === 'unit' || e.kind === 'building') return e.caps ?? {};
  return {};
}

function ensureCaps(e: UnitEntity | BuildingEntity): EntityCapabilities {
  if (!e.caps) e.caps = {};
  return e.caps;
}

// --- Projectile ---

export function getProjectileCapability(e: Entity): ProjectileCapability | null {
  if (e.kind !== 'projectile') return null;
  return e.caps.projectile;
}

export function hasProjectileCapability(e: Entity): e is ProjectileEntity {
  return e.kind === 'projectile';
}

export function makeProjectileCapability(opts: {
  targetId: EntityId;
  damage: number;
  armorVs: Record<ArmorClass, number>;
  speed: number;
  sourceOwner: PlayerId;
  sourceId: EntityId;
  splashRadius?: number;
  impactRadius?: number;
  onHitStatus?: ProjectileCapability['onHitStatus'];
}): ProjectileCapability {
  return {
    targetId: opts.targetId,
    damage: opts.damage,
    armorVs: opts.armorVs,
    speed: opts.speed,
    sourceOwner: opts.sourceOwner,
    sourceId: opts.sourceId,
    splashRadius: opts.splashRadius,
    impactRadius: opts.impactRadius,
    onHitStatus: opts.onHitStatus,
  };
}

export function hashProjectileCapability(cap: ProjectileCapability): string {
  const splash = cap.splashRadius ?? 0;
  const impact = cap.impactRadius ?? 0;
  const status = cap.onHitStatus ? `${cap.onHitStatus.kind}:${cap.onHitStatus.durationTicks}` : '';
  return `PC${cap.targetId}:${cap.damage}:${cap.speed}:${cap.sourceOwner}:${cap.sourceId}:${splash}:${impact}:${status}`;
}

// --- Harvester ---

export function getHarvester(e: Entity): HarvesterCapability | null {
  if (e.kind !== 'unit') return null;
  return e.caps?.harvester ?? null;
}

export function hasHarvester(e: Entity): e is UnitEntity & { caps: EntityCapabilities & { harvester: HarvesterCapability } } {
  return e.kind === 'unit' && e.caps?.harvester !== undefined;
}

export function makeHarvesterCapability(carryMax: number, carry = 0): HarvesterCapability {
  return { carry, carryMax };
}

export function hashHarvesterCapability(cap: HarvesterCapability): string {
  const home = cap.homeSpireId ?? 0;
  return `HV${cap.carry}:${cap.carryMax}:${home}`;
}

// --- Channeler ---

export function getChanneler(e: Entity): ChannelerCapability | null {
  if (e.kind !== 'unit') return null;
  return e.caps?.channeler ?? null;
}

export function isChanneling(e: Entity): boolean {
  return getChanneler(e)?.channeling === true;
}

export function makeChannelerCapability(channeling = false, channelTicks?: number): ChannelerCapability {
  return { channeling, channelTicks };
}

export function hashChannelerCapability(cap: ChannelerCapability): string {
  return `CH${cap.channeling ? 1 : 0}:${cap.channelTicks ?? 0}`;
}

// --- Garrisonable ---

export function getGarrisonable(e: Entity): GarrisonableCapability | null {
  if (e.kind !== 'unit') return null;
  return e.caps?.garrisonable ?? null;
}

export function isGarrisoned(e: Entity): boolean {
  return getGarrisonable(e) !== null;
}

export function garrisonedInId(e: Entity): EntityId | undefined {
  return getGarrisonable(e)?.garrisonedIn;
}

export function setGarrisonedIn(e: UnitEntity, buildingId: EntityId): void {
  ensureCaps(e).garrisonable = { garrisonedIn: buildingId };
}

export function clearGarrisonedIn(e: UnitEntity): void {
  if (e.caps) delete e.caps.garrisonable;
}

export function hashGarrisonableCapability(cap: GarrisonableCapability): string {
  return `GI${cap.garrisonedIn}`;
}

// --- Production ---

export function getProduction(e: Entity): ProductionCapability | null {
  if (e.kind !== 'building') return null;
  return e.caps?.production ?? null;
}

export function ensureProduction(e: BuildingEntity): ProductionCapability {
  const caps = ensureCaps(e);
  if (!caps.production) caps.production = {};
  return caps.production;
}

export function getProductionQueue(e: Entity): ProductionItem[] | undefined {
  return getProduction(e)?.productionQueue;
}

export function getResearchQueue(e: Entity): ProductionItem[] | undefined {
  return getProduction(e)?.researchQueue;
}

export function getRally(e: Entity): Vec2 | undefined {
  return getProduction(e)?.rally;
}

export function hashProductionCapability(cap: ProductionCapability): string {
  const pq = (cap.productionQueue ?? []).map((q) => `${q.defId}:${q.progress}/${q.required}`).join(',');
  const rq = (cap.researchQueue ?? []).map((q) => `${q.defId}:${q.progress}/${q.required}`).join(',');
  const rally = cap.rally ? `${cap.rally.x},${cap.rally.y}` : '';
  return `PR${pq}/RQ${rq}/R${rally}`;
}

// --- Garrison host ---

export function getGarrisonHost(e: Entity): GarrisonHostCapability | null {
  if (e.kind !== 'building') return null;
  return e.caps?.garrisonHost ?? null;
}

export function ensureGarrisonHost(e: BuildingEntity): GarrisonHostCapability {
  const caps = ensureCaps(e);
  if (!caps.garrisonHost) caps.garrisonHost = { garrisonedIds: [], garrisonReservedIds: [] };
  return caps.garrisonHost;
}

export function garrisonedIds(e: Entity): EntityId[] {
  return getGarrisonHost(e)?.garrisonedIds ?? [];
}

export function garrisonReservedIds(e: Entity): EntityId[] {
  return getGarrisonHost(e)?.garrisonReservedIds ?? [];
}

export function hashGarrisonHostCapability(cap: GarrisonHostCapability): string {
  const ids = [...cap.garrisonedIds].sort((a, b) => a - b).join(',');
  const reserved = [...cap.garrisonReservedIds].sort((a, b) => a - b).join(',');
  return `GH${ids}/X${reserved}`;
}

// --- Beam weapon ---

export function getBeamWeapon(e: Entity): BeamWeaponCapability | null {
  if (e.kind !== 'building') return null;
  return e.caps?.beamWeapon ?? null;
}

export function setBeamWeapon(e: BuildingEntity, beam: BeamWeaponCapability): void {
  ensureCaps(e).beamWeapon = beam;
}

export function clearBeamWeapon(e: BuildingEntity): void {
  if (e.caps) delete e.caps.beamWeapon;
}

export function hashBeamWeaponCapability(cap: BeamWeaponCapability): string {
  const hits = [...cap.lastHitIds].sort((a, b) => a - b).join(',');
  return `BM${cap.targetId}:${cap.facing}:${cap.ticksSinceDamage}:${hits}`;
}

// --- Turret weapon ---

export function getTurretWeapon(e: Entity): TurretWeaponCapability | null {
  if (e.kind !== 'building') return null;
  return e.caps?.turretWeapon ?? null;
}

export function ensureTurretWeapon(e: BuildingEntity): TurretWeaponCapability {
  const caps = ensureCaps(e);
  if (!caps.turretWeapon) {
    caps.turretWeapon = { angularVelocity: 0, crystalIndex: 0, hadTarget: false };
  }
  return caps.turretWeapon;
}

export function clearTurretWeapon(e: BuildingEntity): void {
  if (e.caps) delete e.caps.turretWeapon;
}

export function hashTurretWeaponCapability(cap: TurretWeaponCapability): string {
  return `TW${cap.angularVelocity}:${cap.crystalIndex}:${cap.hadTarget ? 1 : 0}`;
}

// --- Morph ---

export function getMorph(e: Entity): MorphCapability | null {
  if (e.kind !== 'unit' && e.kind !== 'building') return null;
  return e.caps?.morph ?? null;
}

export function hasMorph(e: Entity): boolean {
  return getMorph(e) !== null;
}

export function ensureMorph(e: UnitEntity | BuildingEntity): MorphCapability {
  const caps = ensureCaps(e);
  if (!caps.morph) caps.morph = { progress: 0, action: 'pack' };
  return caps.morph;
}

export function clearMorph(e: UnitEntity | BuildingEntity): void {
  if (e.caps) delete e.caps.morph;
}

export function hashMorphCapability(cap: MorphCapability): string {
  const pos = cap.targetPos ? `${cap.targetPos.x},${cap.targetPos.y}` : '';
  const def = cap.targetDefId ?? '';
  return `MF${cap.progress}:${cap.action}:${pos}:${def}`;
}

// --- Frost exposure ---

export function getFrostExposure(e: Entity): number | undefined {
  if (e.kind !== 'unit' && e.kind !== 'building') return undefined;
  return e.caps?.frost?.exposure;
}

export function setFrostExposure(e: UnitEntity | BuildingEntity, exposure: number): void {
  if (exposure <= 0) {
    if (e.caps) delete e.caps.frost;
    return;
  }
  ensureCaps(e).frost = { exposure };
}

export function hashFrostCapability(cap: FrostExposureCapability): string {
  return `F${cap.exposure}`;
}

// --- Burn linger ---

export function getBurnLinger(e: Entity): BurnLingerCapability | null {
  if (e.kind !== 'unit' && e.kind !== 'building') return null;
  return e.caps?.burnLinger ?? null;
}

export function setBurnLinger(e: UnitEntity | BuildingEntity, burn: BurnLingerCapability): void {
  ensureCaps(e).burnLinger = burn;
}

export function clearBurnLinger(e: UnitEntity | BuildingEntity): void {
  if (e.caps) delete e.caps.burnLinger;
}

export function hashBurnLingerCapability(cap: BurnLingerCapability): string {
  return `L${cap.remaining}:${cap.damagePerTick}:${cap.sourceId}`;
}
