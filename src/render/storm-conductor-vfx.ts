// Storm Conductor presentation — charge sequence, chain lightning spectacle, idle/cooldown feedback.
// Reads sim state (chargingAttack, cooldowns) for continuous VFX; never affects gameplay.
import type { Registry } from '../data/registry';
import type { BuildingEntity } from '../sim/entity-types';
import type { GameState, PlayerId } from '../sim/types';
import { isVisibleTo, buildingHasPower, isAlive } from '../sim/views';
import type { NavGrid } from '../sim/nav-grid';
import type { GraphicsPool } from './graphics-pool';
import {
  detRand,
  drawDissipationTendril,
  drawGroundShockwave,
  drawLightningBolt,
  lerpColor,
} from './lightning-vfx';

export type StormDrawPosFn = (worldX: number, worldY: number) => { x: number; y: number };

const ACCENT = 0xb58cff;
const ACCENT_CYAN = 0x7fe3ff;
const HOT = 0xd9f3ff;
const HOT_CORE = 0xffffff;
const VIOLET = 0x8866cc;

interface ChainHit {
  targetId: number;
  x: number;
  y: number;
}

interface StormSequence {
  sourceX: number;
  sourceY: number;
  hits: ChainHit[];
  age: number;
  life: number;
  seed: number;
}

const activeSequences: StormSequence[] = [];
const MAX_SEQUENCES = 8;

interface HitReaction {
  targetId: number;
  x: number;
  y: number;
  intensity: number;
  age: number;
  life: number;
  seed: number;
}

const hitReactions: HitReaction[] = [];
const MAX_REACTIONS = 24;

/** Register a chain lightning strike for timed visual playback (called from EventBridge). */
export function spawnStormSequence(
  sourceX: number,
  sourceY: number,
  hits: ChainHit[],
): void {
  if (hits.length === 0) return;
  if (activeSequences.length >= MAX_SEQUENCES) activeSequences.shift();
  activeSequences.push({
    sourceX,
    sourceY,
    hits,
    age: 0,
    life: 28,
    seed: sourceX * 0.17 + sourceY * 0.23 + hits[0]!.targetId * 0.31,
  });
  for (let i = 0; i < hits.length; i++) {
    if (hitReactions.length >= MAX_REACTIONS) hitReactions.shift();
    hitReactions.push({
      targetId: hits[i]!.targetId,
      x: hits[i]!.x,
      y: hits[i]!.y,
      intensity: i === 0 ? 1 : 0.35 + (1 - i / Math.max(1, hits.length - 1)) * 0.25,
      age: 0,
      life: i === 0 ? 18 : 10,
      seed: hits[i]!.targetId * 0.41 + i * 7.3,
    });
  }
}

function crystalScreenPos(drawPos: StormDrawPosFn, bx: number, by: number): { x: number; y: number } {
  const p = drawPos(bx, by);
  return { x: p.x, y: p.y - 38 };
}

function drawTargetLockOn(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: StormDrawPosFn,
  tx: number,
  ty: number,
  chargeT: number,
  phase: number,
): void {
  const p = drawPos(tx, ty);
  const pulse = 0.5 + Math.sin(phase * 6 + chargeT * 8) * 0.5;
  const alpha = 0.25 + chargeT * 0.55;
  strokePool.acquire().ellipse(p.x, p.y, 14 + pulse * 4, 8 + pulse * 2).stroke({
    width: 1.5 + chargeT,
    color: ACCENT_CYAN,
    alpha: alpha * pulse,
  });
  fillPool.acquire().ellipse(p.x, p.y, 8, 5).fill({ color: HOT_CORE, alpha: alpha * 0.15 * pulse });
}

function drawConductorRings(
  strokePool: GraphicsPool,
  _fillPool: GraphicsPool,
  drawPos: StormDrawPosFn,
  bx: number,
  by: number,
  spinRate: number,
  ringSpread: number,
  phase: number,
  seed: number,
  glow: number,
): void {
  const p = drawPos(bx, by);
  const lift = 18;
  const bob = Math.sin(phase * 0.55) * 2;
  for (let ring = 0; ring < 2; ring++) {
    const ringR = 16 + ring * 9 - ringSpread * 4;
    const spin = phase * spinRate * (ring === 0 ? 1 : -0.85);
    const g = strokePool.acquire();
    const segments = 20;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2 + spin;
      const px = p.x + Math.cos(a) * ringR;
      const py = p.y - lift - ring * 6 + bob + Math.sin(a) * ringR * 0.22;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    const color = lerpColor(ACCENT, HOT, glow);
    g.stroke({ width: 1.2 + ring * 0.35, color, alpha: 0.3 + glow * 0.5 });
  }
  if (glow > 0.2 && detRand(seed + phase * 0.1) > 0.55) {
    const ang = phase * spinRate * 1.2;
    const ax = p.x + Math.cos(ang) * 10;
    const ay = p.y - lift + bob + Math.sin(ang) * 3;
    const bx2 = p.x + Math.cos(ang + Math.PI) * 12;
    const by2 = p.y - lift + bob + Math.sin(ang + Math.PI) * 3;
    strokePool.acquire().moveTo(ax, ay).lineTo(bx2, by2).stroke({ width: 1, color: ACCENT_CYAN, alpha: 0.35 + glow * 0.4 });
  }
}

function drawFloatingCrystal(
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  drawPos: StormDrawPosFn,
  bx: number,
  by: number,
  glow: number,
  phase: number,
): void {
  const p = drawPos(bx, by);
  const bob = Math.sin(phase * 0.6) * 2.5;
  const cx = p.x;
  const cy = p.y - 38 + bob;
  const flicker = 0.88 + Math.sin(phase * 3.2) * 0.12;
  const coreR = 6 + glow * 5;
  const color = lerpColor(VIOLET, lerpColor(ACCENT_CYAN, HOT_CORE, glow), glow);
  fillPool.acquire().circle(cx, cy, coreR * 1.5).fill({ color, alpha: (0.2 + glow * 0.4) * flicker });
  fillPool.acquire().circle(cx, cy, coreR).fill({ color: lerpColor(color, HOT_CORE, glow * 0.65), alpha: (0.6 + glow * 0.4) * flicker });
  strokePool.acquire()
    .moveTo(cx, cy - coreR * 1.3)
    .lineTo(cx + coreR * 0.65, cy)
    .lineTo(cx, cy + coreR * 1.3)
    .lineTo(cx - coreR * 0.65, cy)
    .closePath()
    .stroke({ width: 1.5, color: HOT_CORE, alpha: (0.45 + glow * 0.55) * flicker });
}

function drawLightningRods(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: StormDrawPosFn,
  bx: number,
  by: number,
  aimAngle: number,
  chargeT: number,
  glow: number,
  phase: number,
): void {
  const p = drawPos(bx, by);
  const tilt = (aimAngle - Math.PI / 2) * 0.15 * chargeT;
  const rods = [
    { ox: -14, lift: 28, h: 22 },
    { ox: 16, lift: 34, h: 28 },
  ];
  for (let i = 0; i < rods.length; i++) {
    const rod = rods[i]!;
    const rx = p.x + rod.ox;
    const ry = p.y - rod.lift;
    const tipX = rx + Math.sin(tilt + i * 0.08) * rod.h * 0.3;
    const tipY = ry - rod.h + Math.cos(tilt) * rod.h * 0.1;
    strokePool.acquire().moveTo(rx, ry).lineTo(tipX, tipY).stroke({ width: 2.5, color: lerpColor(VIOLET, ACCENT_CYAN, glow), alpha: 0.65 + glow * 0.35 });
    fillPool.acquire().circle(tipX, tipY, 2.5 + glow * 2).fill({ color: HOT, alpha: 0.5 + glow * 0.5 });
    if (chargeT > 0.3 && detRand(i + phase) > 0.6) {
      strokePool.acquire().moveTo(tipX, tipY).lineTo(p.x, p.y - 38).stroke({ width: 1, color: ACCENT_CYAN, alpha: chargeT * 0.5 });
    }
  }
}

function drawIdleParticles(
  fillPool: GraphicsPool,
  drawPos: StormDrawPosFn,
  bx: number,
  by: number,
  glow: number,
  phase: number,
  seed: number,
): void {
  for (let i = 0; i < 3; i++) {
    const t = detRand(seed + i * 4.1);
    const ang = phase * 0.3 + t * Math.PI * 2;
    const dist = 14 + detRand(seed + i) * 16;
    const p = drawPos(bx, by);
    const px = p.x + Math.cos(ang) * dist;
    const py = p.y - 22 + Math.sin(ang) * dist * 0.25 + Math.sin(phase + i) * 3;
    fillPool.acquire().circle(px, py, 1 + detRand(seed + i * 2) * 1.5).fill({ color: ACCENT_CYAN, alpha: 0.2 + glow * 0.35 });
  }
}

function forkCount(hits: ChainHit[]): number {
  if (hits.length < 2) return 0;
  if (hits.length === 2) return 1;
  return Math.min(4, Math.max(2, hits.length - 1));
}

function drawStormSequences(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: StormDrawPosFn,
  phase: number,
): void {
  for (let si = activeSequences.length - 1; si >= 0; si--) {
    const seq = activeSequences[si]!;
    seq.age++;
    if (seq.age >= seq.life) {
      activeSequences.splice(si, 1);
      continue;
    }
    const { hits, seed } = seq;
    const crystal = crystalScreenPos(drawPos, seq.sourceX, seq.sourceY);

    // Phase 3 — primary strike (frames 0–4)
    if (seq.age <= 4) {
      const primary = drawPos(hits[0]!.x, hits[0]!.y);
      const width = 9 - seq.age * 0.5;
      drawLightningBolt(strokePool, fillPool, crystal.x, crystal.y, primary.x, primary.y, width, seed, {
        falloff: 0,
        phase: phase + seq.age,
        branch: 12,
      });
    }

    // Phase 4 — overload shockwave (frames 2–12)
    if (seq.age >= 2 && seq.age <= 12) {
      const primary = drawPos(hits[0]!.x, hits[0]!.y);
      const swT = (seq.age - 2) / 10;
      drawGroundShockwave(strokePool, fillPool, primary.x, primary.y, 28, swT, ACCENT_CYAN);
      if (seq.age <= 6) {
        fillPool.acquire().ellipse(primary.x, primary.y, 16, 10).fill({ color: HOT_CORE, alpha: 0.55 - seq.age * 0.08 });
        strokePool.acquire().ellipse(primary.x, primary.y, 20, 12).stroke({ width: 2, color: HOT_CORE, alpha: 0.4 - seq.age * 0.06 });
      }
    }

    // Phase 5 — eruption fork (frames 3–8)
    const forks = forkCount(hits);
    if (seq.age >= 3 && seq.age <= 8 && forks > 0) {
      const primary = drawPos(hits[0]!.x, hits[0]!.y);
      const forkTargets = forks === 1 ? 1 : Math.min(forks, hits.length - 1);
      for (let f = 0; f < forkTargets; f++) {
        const target = drawPos(hits[f + 1]!.x, hits[f + 1]!.y);
        const width = forks === 1 ? 5.5 : 3.5 - f * 0.4;
        drawLightningBolt(strokePool, fillPool, primary.x, primary.y, target.x, target.y, width, seed + f * 17, {
          falloff: 0.15 + f * 0.08,
          phase: phase + seq.age + f,
        });
      }
    }

    // Phase 6 — cascade (frames 5+)
    const cascadeStart = Math.max(1, forks === 1 ? 1 : forks);
    for (let i = cascadeStart; i < hits.length; i++) {
      const delay = 5 + (i - cascadeStart) * 2;
      if (seq.age < delay || seq.age > delay + 6) continue;
      const from = drawPos(hits[i - 1]!.x, hits[i - 1]!.y);
      const to = drawPos(hits[i]!.x, hits[i]!.y);
      const falloff = i / Math.max(1, hits.length - 1);
      const width = 4.5 * (1 - falloff * 0.18);
      drawLightningBolt(strokePool, fillPool, from.x, from.y, to.x, to.y, width, seed + i * 23, {
        falloff,
        phase: phase + seq.age + i,
      });
    }

    // Phase 7 — dissipation (last 4 frames)
    if (seq.age >= seq.life - 4) {
      const dissT = (seq.age - (seq.life - 4)) / 4;
      for (let i = 0; i < hits.length; i++) {
        const p = drawPos(hits[i]!.x, hits[i]!.y);
        drawDissipationTendril(strokePool, p.x, p.y, seed + i * 13, dissT);
      }
    }
  }
}

function drawHitReactions(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: StormDrawPosFn,
  phase: number,
): void {
  for (let i = hitReactions.length - 1; i >= 0; i--) {
    const r = hitReactions[i]!;
    r.age++;
    if (r.age >= r.life) {
      hitReactions.splice(i, 1);
      continue;
    }
    const t = r.age / r.life;
    const p = drawPos(r.x, r.y);
    const alpha = (1 - t) * r.intensity;
    if (r.intensity > 0.8) {
      fillPool.acquire().circle(p.x, p.y, 12 * (1 - t * 0.3)).fill({ color: HOT_CORE, alpha: alpha * 0.7 });
      for (let s = 0; s < 6; s++) {
        const ang = detRand(r.seed + s * 5) * Math.PI * 2 + phase;
        const dist = 8 + detRand(r.seed + s) * 14 * (1 - t);
        const sx = p.x + Math.cos(ang) * dist;
        const sy = p.y + Math.sin(ang) * dist * 0.55 - t * 6;
        fillPool.acquire().circle(sx, sy, 1.5 + detRand(r.seed + s * 2)).fill({ color: ACCENT_CYAN, alpha: alpha * 0.65 });
      }
      if (r.age <= 6) {
        for (let a = 0; a < 3; a++) {
          const ang = phase * 2 + a * 2.1;
          strokePool.acquire()
            .moveTo(p.x + Math.cos(ang) * 8, p.y + Math.sin(ang) * 5)
            .lineTo(p.x + Math.cos(ang + 0.8) * 14, p.y + Math.sin(ang + 0.8) * 8)
            .stroke({ width: 1, color: HOT_CORE, alpha: (1 - r.age / 6) * 0.5 });
        }
      }
    } else {
      fillPool.acquire().circle(p.x, p.y, 6 * (1 - t * 0.4)).fill({ color: HOT_CORE, alpha: alpha * 0.45 });
      fillPool.acquire().circle(p.x, p.y - 2, 4).fill({ color: ACCENT_CYAN, alpha: alpha * 0.35 });
    }
  }
}

export function renderStormConductors(
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid | null,
  revealAll: boolean,
  drawPos: StormDrawPosFn,
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  animPhase: number,
): void {
  const phase = animPhase;

  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.defId !== 'storm_conductor') continue;
    if (!buildingHasPower(state, registry, e)) continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;

    const def = registry.buildings.get(e.defId);
    const w = def?.weapon;
    if (!w) continue;

    const chargeTicks = w.chargeTicks ?? 10;
    const cooldownTicks = w.cooldownTicks ?? 45;

    let chargeT = 0;
    let cooldownT = 0;
    let spinRate = 0.35;
    let ringSpread = 0;
    let crystalGlow = 0.12;
    let aimAngle = e.facing;
    let targetX = 0;
    let targetY = 0;
    let hasTarget = false;

    if (e.chargingAttack) {
      chargeT = 1 - e.chargingAttack.remainingTicks / chargeTicks;
      spinRate = 0.35 + chargeT * 3.2;
      ringSpread = chargeT * 0.65;
      crystalGlow = 0.12 + chargeT * 0.88;
      const target = state.entities.get(e.chargingAttack.targetId);
      if (target && isAlive(target)) {
        targetX = target.pos.x;
        targetY = target.pos.y;
        hasTarget = true;
        aimAngle = Math.atan2(target.pos.y - e.pos.y, target.pos.x - e.pos.x);
      }
    } else if ((e.cooldowns.attack ?? 0) > 0) {
      cooldownT = 1 - (e.cooldowns.attack ?? 0) / cooldownTicks;
      spinRate = 0.08 + cooldownT * 0.3;
      ringSpread = (1 - cooldownT) * 0.5;
      crystalGlow = 0.04 + cooldownT * 0.14;
    } else {
      spinRate = 0.35;
      crystalGlow = 0.12 + Math.sin(phase * 0.4) * 0.06;
    }

    const seed = e.id * 0.31 + state.tick * 0.02;
    drawConductorRings(strokePool, fillPool, drawPos, e.pos.x, e.pos.y, spinRate, ringSpread, phase, seed, crystalGlow);
    drawFloatingCrystal(fillPool, strokePool, drawPos, e.pos.x, e.pos.y, crystalGlow, phase);
    drawLightningRods(strokePool, fillPool, drawPos, e.pos.x, e.pos.y, aimAngle, chargeT, crystalGlow, phase);
    drawIdleParticles(fillPool, drawPos, e.pos.x, e.pos.y, crystalGlow, phase, seed);

    if (hasTarget && e.chargingAttack) {
      drawTargetLockOn(strokePool, fillPool, drawPos, targetX, targetY, chargeT, phase);
    }
  }

  drawStormSequences(strokePool, fillPool, drawPos, phase);
  drawHitReactions(strokePool, fillPool, drawPos, phase);
}

/** Charge progress 0–1 for a building (used by audio layer). */
export function stormChargeProgress(b: BuildingEntity, chargeTicks: number): number {
  if (!b.chargingAttack) return 0;
  return 1 - b.chargingAttack.remainingTicks / chargeTicks;
}

/** Cooldown recovery 0–1. */
export function stormCooldownProgress(b: BuildingEntity, cooldownTicks: number): number {
  const cd = b.cooldowns.attack ?? 0;
  if (cd <= 0) return 1;
  return 1 - cd / cooldownTicks;
}

/** Whether idle crackle should play (tower ready, powered). */
export function stormIdleCrackleReady(b: BuildingEntity): boolean {
  return !b.chargingAttack && (b.cooldowns.attack ?? 0) <= 0;
}

/** Number of active bolt segments for mobile budget checks. */
export function stormActiveBoltCount(): number {
  return activeSequences.length;
}
