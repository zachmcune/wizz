// Capability accessors — the supported way to read/write entity capability state.
import type { ArmorClass } from '../../data/defs';
import type { Entity, EntityId, PlayerId } from '../types';
import type { ProjectileEntity } from '../entity-types';
import type { EntityCapabilities, ProjectileCapability } from './types';

export type { EntityCapabilities, ProjectileCapability, CapabilityKind } from './types';

export function getCapabilities(e: Entity): EntityCapabilities {
  if (e.kind === 'projectile') return e.caps;
  if (e.kind === 'unit' || e.kind === 'building') return e.caps ?? {};
  return {};
}

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

/** Stable hash segment for a projectile capability (lockstep / sync surface). */
export function hashProjectileCapability(cap: ProjectileCapability): string {
  const splash = cap.splashRadius ?? 0;
  const impact = cap.impactRadius ?? 0;
  const status = cap.onHitStatus ? `${cap.onHitStatus.kind}:${cap.onHitStatus.durationTicks}` : '';
  return `PC${cap.targetId}:${cap.damage}:${cap.speed}:${cap.sourceOwner}:${cap.sourceId}:${splash}:${impact}:${status}`;
}
