// Data-driven troop attack tells. View-only: maps art.attackFx + combat events to
// pooled EffectsLayer bursts and render poses. Never imported by src/sim.
import type { AttackFxKind, ArtDef } from '../data/defs';
import type { Registry } from '../data/registry';
import type { Entity } from '../sim/types';
import type { EffectKind, EffectSpawnOpts } from './effects';
import { vfxDensity } from './vfx-quality';

export type { AttackFxKind };

export interface AttackFxBurst {
  kind: EffectKind;
  color: number;
  radius: number;
  angle?: number;
  /** Extra particles/rings; dropped when graphics quality is Low. */
  decorative?: boolean;
}

export interface AttackFxSink {
  spawn(kind: EffectKind, x: number, y: number, color: number, radius: number, opts?: EffectSpawnOpts): void;
}

export interface AttackPose {
  /** World-space sprite offset (lunge / wind-up / slam follow-through). */
  dx: number;
  dy: number;
  scale: number;
  /** Added to visual height (negative = slam into the ground). */
  lift: number;
}

const IDENTITY_POSE: AttackPose = { dx: 0, dy: 0, scale: 1, lift: 0 };

const IMP_SLASH = 0xff8a5c;
const IMP_SPARK = 0xffe08a;
const BOLT = 0xc9b8ff;
const BOLT_CORE = 0xffffff;
const SLAM_DUST = 0xc4b59a;
const SLAM_RING = 0x9a9080;

const ATTACK_FX_KINDS = new Set<AttackFxKind>(['lunge_slash', 'bolt', 'slam']);

export function isAttackFxKind(value: unknown): value is AttackFxKind {
  return typeof value === 'string' && ATTACK_FX_KINDS.has(value as AttackFxKind);
}

export function attackFxFromArt(art: ArtDef | undefined): AttackFxKind | undefined {
  const kind = art?.attackFx;
  return isAttackFxKind(kind) ? kind : undefined;
}

/** Units only — buildings keep their dedicated VFX modules. */
export function attackFxForEntity(registry: Registry, e: Entity | undefined): AttackFxKind | undefined {
  if (!e || e.kind !== 'unit') return undefined;
  return attackFxFromArt(registry.units.get(e.defId)?.art);
}

/** Muzzle / swing tell at the attacker (`attackFired`). */
export function attackFiredBursts(kind: AttackFxKind, facing: number): AttackFxBurst[] {
  if (kind === 'lunge_slash') {
    return [
      { kind: 'spark', color: IMP_SPARK, radius: 4, angle: facing, decorative: true },
    ];
  }
  if (kind === 'bolt') {
    return [
      { kind: 'flash', color: BOLT, radius: 5, angle: facing },
      { kind: 'spark', color: BOLT_CORE, radius: 3, angle: facing, decorative: true },
    ];
  }
  // Slam wind-up is a pose; fire kick is a small dust puff at the feet.
  return [
    { kind: 'puff', color: SLAM_DUST, radius: 10, angle: facing, decorative: true },
  ];
}

/** Impact tell at the target (`damageDealt`). Distinct per troop. */
export function attackHitBursts(kind: AttackFxKind, facing: number): AttackFxBurst[] {
  if (kind === 'lunge_slash') {
    return [
      { kind: 'strike', color: IMP_SLASH, radius: 12, angle: facing },
      { kind: 'spark', color: IMP_SPARK, radius: 5, angle: facing, decorative: true },
    ];
  }
  if (kind === 'bolt') {
    return [
      { kind: 'flash', color: BOLT, radius: 11, angle: facing },
      { kind: 'flash', color: BOLT_CORE, radius: 4, angle: facing },
      { kind: 'ring', color: BOLT, radius: 16, angle: facing, decorative: true },
    ];
  }
  return [
    { kind: 'shockwave', color: SLAM_RING, radius: 22, angle: facing },
    { kind: 'flash', color: SLAM_DUST, radius: 8, angle: facing },
  ];
}

export function applyAttackFxBursts(
  effects: AttackFxSink,
  bursts: AttackFxBurst[],
  x: number,
  y: number,
  facing: number,
  density = vfxDensity(),
): void {
  for (const b of bursts) {
    if (b.decorative && density < 0.4) continue;
    effects.spawn(b.kind, x, y, b.color, b.radius, { angle: b.angle ?? facing });
  }
}

/**
 * Render-only pose from attack cooldown. `progress` is 1 just after fire and 0 when ready.
 * Imp: snappy lunge toward facing on the first half of cooldown.
 * Golem: rear-up as cooldown ends, then slam-down follow-through after fire.
 */
export function attackPose(
  kind: AttackFxKind | undefined,
  facing: number,
  cooldown: number,
  cooldownTicks: number,
): AttackPose {
  if (!kind || cooldownTicks <= 0 || cooldown <= 0) return IDENTITY_POSE;
  const progress = Math.min(1, cooldown / cooldownTicks);
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);

  if (kind === 'lunge_slash') {
    const window = 0.55;
    if (progress < 1 - window) return IDENTITY_POSE;
    const t = (progress - (1 - window)) / window;
    const mag = 7 * t;
    return { dx: fx * mag, dy: fy * mag, scale: 1, lift: 0 };
  }

  if (kind === 'slam') {
    if (progress < 0.4) {
      const t = 1 - progress / 0.4;
      const mag = -6 * t;
      return { dx: fx * mag, dy: fy * mag, scale: 1 + 0.1 * t, lift: 0.18 * t };
    }
    if (progress > 0.62) {
      const t = (progress - 0.62) / 0.38;
      const mag = 5 * t;
      return { dx: fx * mag, dy: fy * mag, scale: 1 + 0.05 * t, lift: -0.28 * t };
    }
    return IDENTITY_POSE;
  }

  return IDENTITY_POSE;
}

export const identityAttackPose = IDENTITY_POSE;
