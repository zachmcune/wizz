// Celestial Cannon presentation — altar-obelisk charge sequence, dead zone, impact aftermath.
// Reads sim state (chargingAttack, cooldowns) for continuous VFX; never affects gameplay.
import type { Registry } from '../data/registry';
import type { BuildingEntity } from '../sim/entity-types';
import type { GameState, PlayerId } from '../sim/types';
import { isVisibleTo, buildingHasPower, isAlive, isEnemy } from '../sim/views';
import type { NavGrid } from '../sim/nav-grid';
import type { GraphicsPool } from './graphics-pool';
import { distSq, len } from '../sim/math';

export type CelestialDrawPosFn = (worldX: number, worldY: number) => { x: number; y: number };

const ACCENT = 0xd9f3ff;
const ACCENT_VIOLET = 0xb8a0ff;
const HOT = 0xfff4d0;
const HOT_CORE = 0xffffff;
const SCORCH = 0x6a5a8a;

interface ScorchedMark {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
}

const scorchMarks: ScorchedMark[] = [];

interface SkyStrike {
  x: number;
  y: number;
  radius: number;
  age: number;
  life: number;
}

const skyStrikes: SkyStrike[] = [];

/** Register a ground scorch mark after an artillery impact (called from EventBridge). */
export function spawnCelestialScorch(x: number, y: number, radius: number): void {
  if (scorchMarks.length > 24) scorchMarks.shift();
  scorchMarks.push({ x, y, age: 0, life: 50, radius });
}

/** Sky-to-ground strike column on impact (Astral Lance-style payoff beam). */
export function spawnCelestialSkyStrike(x: number, y: number, radius: number): void {
  if (skyStrikes.length > 12) skyStrikes.shift();
  skyStrikes.push({ x, y, radius, age: 0, life: 22 });
}

function detRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 255;
  const g1 = (c1 >> 8) & 255;
  const b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255;
  const g2 = (c2 >> 8) & 255;
  const b2 = c2 & 255;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}

function enemyInDeadZone(
  state: GameState,
  b: BuildingEntity,
  minRange: number,
  nav: NavGrid | null,
): boolean {
  const minR = minRange + b.radius;
  const minR2 = minR * minR;
  for (const o of state.entities.values()) {
    if (o.kind === 'resource_node' || o.kind === 'projectile' || !isAlive(o)) continue;
    if (!isEnemy(state, b.owner, o.owner)) continue;
    if (nav && !isVisibleTo(state, b.owner, o, nav)) continue;
    if (distSq(b.pos.x, b.pos.y, o.pos.x, o.pos.y) <= minR2) return true;
  }
  return false;
}

function drawDeadZoneRing(
  strokePool: GraphicsPool,
  drawPos: CelestialDrawPosFn,
  bx: number,
  by: number,
  minRange: number,
  radius: number,
  phase: number,
): void {
  const p = drawPos(bx, by);
  const r = minRange + radius;
  const g = strokePool.acquire();
  g.circle(p.x, p.y, r).stroke({ width: 1.5, color: ACCENT_VIOLET, alpha: 0.22 + Math.sin(phase * 0.4) * 0.04 });
  g.circle(p.x, p.y, r * 0.98).stroke({ width: 1, color: ACCENT, alpha: 0.12 });
}

function drawBaseRunes(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: CelestialDrawPosFn,
  bx: number,
  by: number,
  runeProgress: number,
  footprintRadius: number,
  stutter: boolean,
  phase: number,
): void {
  const p = drawPos(bx, by);
  const runeCount = 6;
  // Runes ring the building base — centered on the structure, not the dead-zone radius.
  const ringR = Math.max(14, footprintRadius * 0.55);
  for (let i = 0; i < runeCount; i++) {
    const ang = (i / runeCount) * Math.PI * 2 - Math.PI / 2;
    const rx = p.x + Math.cos(ang) * ringR;
    const ry = p.y + Math.sin(ang) * ringR * 0.55;
    const lit = runeProgress >= (i + 1) / runeCount;
    const flicker = stutter && Math.sin(phase * 14 + i * 2.1) > 0.3 ? 0.35 : 1;
    const alpha = (lit ? 0.75 : 0.18) * flicker;
    const color = lit ? lerpColor(ACCENT, HOT, runeProgress) : ACCENT_VIOLET;
    strokePool.acquire().moveTo(rx - 3, ry).lineTo(rx + 3, ry).stroke({ width: 2, color, alpha });
    if (lit) fillPool.acquire().circle(rx, ry, 2).fill({ color: HOT_CORE, alpha: alpha * 0.6 });
  }
  // Inner base glow — reinforces that runes belong to the tower footprint.
  fillPool.acquire().circle(p.x, p.y, ringR * 0.35).fill({ color: ACCENT, alpha: 0.04 + runeProgress * 0.08 });
}

function drawOrbitingRings(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: CelestialDrawPosFn,
  bx: number,
  by: number,
  spinRate: number,
  phase: number,
  seed: number,
  crystalGlow: number,
): void {
  const p = drawPos(bx, by);
  const lift = 22;
  for (let ring = 0; ring < 2; ring++) {
    const ringR = 18 + ring * 10;
    const spin = phase * spinRate * (ring === 0 ? 1 : -0.7);
    const g = strokePool.acquire();
    const segments = 24;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2 + spin;
      const px = p.x + Math.cos(a) * ringR;
      const py = p.y - lift - ring * 8 + Math.sin(a) * ringR * 0.25;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke({ width: 1.2 + ring * 0.4, color: lerpColor(ACCENT, HOT, crystalGlow), alpha: 0.35 + crystalGlow * 0.45 });
  }
  for (let i = 0; i < 4; i++) {
    const t = detRand(seed + i * 3.1);
    const ang = phase * spinRate * 1.3 + t * Math.PI * 2;
    const dist = 12 + detRand(seed + i) * 10;
    const fx = p.x + Math.cos(ang) * dist;
    const fy = p.y - lift + Math.sin(ang) * dist * 0.3;
    fillPool.acquire().poly([
      fx, fy - 3,
      fx + 2.5, fy,
      fx, fy + 3,
      fx - 2.5, fy,
    ]).fill({ color: lerpColor(ACCENT_VIOLET, HOT, crystalGlow), alpha: 0.5 + crystalGlow * 0.4 });
  }
}

function drawFloatingCrystal(
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  drawPos: CelestialDrawPosFn,
  bx: number,
  by: number,
  glow: number,
  stutter: boolean,
  phase: number,
): void {
  const p = drawPos(bx, by);
  const bob = Math.sin(phase * 0.6) * 2;
  const cx = p.x;
  const cy = p.y - 34 + bob;
  const flicker = stutter ? 0.55 + Math.sin(phase * 18) * 0.35 : 1;
  const coreR = 7 + glow * 4;
  const color = lerpColor(ACCENT, HOT, glow);
  fillPool.acquire().circle(cx, cy, coreR * 1.4).fill({ color, alpha: (0.25 + glow * 0.35) * flicker });
  fillPool.acquire().circle(cx, cy, coreR).fill({ color: lerpColor(color, HOT_CORE, glow * 0.6), alpha: (0.65 + glow * 0.35) * flicker });
  strokePool.acquire()
    .moveTo(cx, cy - coreR * 1.2)
    .lineTo(cx + coreR * 0.7, cy)
    .lineTo(cx, cy + coreR * 1.2)
    .lineTo(cx - coreR * 0.7, cy)
    .closePath()
    .stroke({ width: 1.5, color: HOT_CORE, alpha: (0.5 + glow * 0.5) * flicker });
}

function drawSkyBeam(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: CelestialDrawPosFn,
  bx: number,
  by: number,
  chargeT: number,
  phase: number,
): void {
  const p = drawPos(bx, by);
  const beamBaseY = p.y - 38;
  const width = 2 + chargeT * 8;
  const alpha = 0.25 + chargeT * 0.65;
  const color = lerpColor(ACCENT, HOT_CORE, chargeT);
  strokePool.acquire()
    .moveTo(p.x, beamBaseY)
    .lineTo(p.x, beamBaseY - 120 - chargeT * 80)
    .stroke({ width, color, alpha });
  strokePool.acquire()
    .moveTo(p.x, beamBaseY)
    .lineTo(p.x, beamBaseY - 80)
    .stroke({ width: width * 0.35, color: HOT_CORE, alpha: alpha * 0.7 });

  const vortexY = beamBaseY - 100;
  const vortexR = 14 + chargeT * 10;
  const vortex = strokePool.acquire();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2 + phase * 0.8;
    const r = vortexR * (0.6 + Math.sin(a * 3 + phase) * 0.15);
    const vx = p.x + Math.cos(a) * r;
    const vy = vortexY + Math.sin(a) * r * 0.35;
    if (i === 0) vortex.moveTo(vx, vy);
    else vortex.lineTo(vx, vy);
  }
  vortex.stroke({ width: 1.5, color: ACCENT_VIOLET, alpha: 0.2 + chargeT * 0.35 });
  fillPool.acquire().circle(p.x, vortexY, vortexR * 0.4).fill({ color: ACCENT, alpha: 0.08 + chargeT * 0.12 });
}

function drawTargetRune(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: CelestialDrawPosFn,
  tx: number,
  ty: number,
  impactRadius: number,
  chargeT: number,
  phase: number,
): void {
  const p = drawPos(tx, ty);
  const pulse = 0.5 + Math.sin(phase * (4 + chargeT * 12)) * 0.5;
  const r = impactRadius * (0.55 + pulse * 0.12);
  const alpha = 0.35 + chargeT * 0.55;
  const color = lerpColor(ACCENT_VIOLET, HOT, chargeT);

  strokePool.acquire().circle(p.x, p.y, r).stroke({ width: 2 + chargeT * 2, color, alpha });
  strokePool.acquire().circle(p.x, p.y, r * 0.72).stroke({ width: 1.5, color: HOT, alpha: alpha * 0.7 });

  const rune = strokePool.acquire();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + phase * 0.2;
    const inner = r * 0.35;
    const outer = r * 0.85;
    rune.moveTo(p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner * 0.55)
      .lineTo(p.x + Math.cos(a) * outer, p.y + Math.sin(a) * outer * 0.55);
  }
  rune.stroke({ width: 1.5, color: HOT_CORE, alpha: alpha * 0.85 });

  fillPool.acquire().circle(p.x, p.y, r * 0.15).fill({ color: HOT, alpha: alpha * 0.4 * pulse });
}

function drawProjectileTrail(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: CelestialDrawPosFn,
  px: number,
  py: number,
  facing: number,
  phase: number,
): void {
  const p = drawPos(px, py);
  const tail = 24;
  const tx = p.x - Math.cos(facing) * tail;
  const ty = p.y - Math.sin(facing) * tail;
  strokePool.acquire().moveTo(tx, ty).lineTo(p.x, p.y).stroke({ width: 4, color: ACCENT, alpha: 0.55 });
  strokePool.acquire().moveTo(tx, ty).lineTo(p.x, p.y).stroke({ width: 1.5, color: HOT_CORE, alpha: 0.75 });
  fillPool.acquire().circle(p.x, p.y, 5 + Math.sin(phase * 8) * 1.5).fill({ color: HOT, alpha: 0.7 });
}

function drawSkyStrikes(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: CelestialDrawPosFn,
  phase: number,
): void {
  for (let i = skyStrikes.length - 1; i >= 0; i--) {
    const s = skyStrikes[i]!;
    s.age++;
    const t = s.age / s.life;
    if (t >= 1) {
      skyStrikes.splice(i, 1);
      continue;
    }
    const p = drawPos(s.x, s.y);
    const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    const beamTop = p.y - 420 - s.radius * 0.4;
    const width = 6 + s.radius * 0.12 * (1 - t * 0.35);

    strokePool.acquire()
      .moveTo(p.x, beamTop)
      .lineTo(p.x, p.y)
      .stroke({ width: width * 1.6, color: ACCENT, alpha: alpha * 0.35 });
    strokePool.acquire()
      .moveTo(p.x, beamTop)
      .lineTo(p.x, p.y)
      .stroke({ width, color: HOT_CORE, alpha: alpha * 0.82 });
    strokePool.acquire()
      .moveTo(p.x, beamTop)
      .lineTo(p.x, p.y)
      .stroke({ width: width * 0.35, color: HOT, alpha: alpha * 0.95 });

    fillPool.acquire().circle(p.x, p.y, s.radius * (0.22 + t * 0.08)).fill({ color: HOT, alpha: alpha * 0.55 });
    fillPool.acquire().circle(p.x, p.y, s.radius * 0.12).fill({ color: HOT_CORE, alpha: alpha * 0.75 });
    strokePool.acquire().circle(p.x, p.y, s.radius * (0.35 + t * 0.5)).stroke({
      width: 3 - t * 1.5,
      color: ACCENT,
      alpha: alpha * 0.7,
    });

    // Brief aurora patch at the top of the beam (matches charge-up sky connection).
    const vortexY = beamTop + 28;
    const vortexR = 16 + Math.sin(phase * 2 + s.x) * 3;
    strokePool.acquire().circle(p.x, vortexY, vortexR).stroke({ width: 1.5, color: ACCENT_VIOLET, alpha: alpha * 0.35 });
  }
}

function drawScorchMarks(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: CelestialDrawPosFn,
): void {
  for (let i = scorchMarks.length - 1; i >= 0; i--) {
    const m = scorchMarks[i]!;
    m.age++;
    const t = m.age / m.life;
    if (t >= 1) {
      scorchMarks.splice(i, 1);
      continue;
    }
    const p = drawPos(m.x, m.y);
    const alpha = (1 - t) * 0.45;
    fillPool.acquire().circle(p.x, p.y, m.radius * 0.35).fill({ color: SCORCH, alpha: alpha * 0.35 });
    strokePool.acquire().circle(p.x, p.y, m.radius * 0.5 * (1 - t * 0.3)).stroke({ width: 1.5, color: ACCENT_VIOLET, alpha });
    for (let j = 0; j < 3; j++) {
      const ang = detRand(m.x + j) * Math.PI * 2;
      const dist = m.radius * 0.25 * detRand(m.y + j);
      strokePool.acquire()
        .moveTo(p.x, p.y)
        .lineTo(p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist * 0.55)
        .stroke({ width: 1, color: SCORCH, alpha: alpha * 0.6 });
    }
  }
}

export function renderCelestialCannons(
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid | null,
  revealAll: boolean,
  drawPos: CelestialDrawPosFn,
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  animPhase: number,
): void {
  const phase = animPhase;

  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.defId !== 'celestial_cannon') continue;
    if (!buildingHasPower(state, registry, e)) continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;

    const def = registry.buildings.get(e.defId);
    const w = def?.weapon;
    if (!w) continue;

    const chargeTicks = w.chargeTicks ?? 60;
    const cooldownTicks = w.cooldownTicks ?? 100;
    const minRange = w.minRange ?? 0;
    const impactRadius = w.impactRadius ?? w.splashRadius ?? 90;

    const stutter = enemyInDeadZone(state, e, minRange, nav);
    drawDeadZoneRing(strokePool, drawPos, e.pos.x, e.pos.y, minRange, e.radius, phase);

    let chargeT = 0;
    let cooldownT = 0;
    let spinRate = 0.4;
    let crystalGlow = 0.15;
    let runeProgress = 0;
    let targetX = 0;
    let targetY = 0;
    let hasTarget = false;

    if (e.chargingAttack) {
      chargeT = 1 - e.chargingAttack.remainingTicks / chargeTicks;
      spinRate = 0.4 + chargeT * 2.8;
      crystalGlow = 0.15 + chargeT * 0.85;
      runeProgress = chargeT;
      const target = state.entities.get(e.chargingAttack.targetId);
      if (target && isAlive(target)) {
        targetX = target.pos.x;
        targetY = target.pos.y;
        hasTarget = true;
      }
    } else if ((e.cooldowns.attack ?? 0) > 0) {
      cooldownT = 1 - (e.cooldowns.attack ?? 0) / cooldownTicks;
      spinRate = 0.15 + cooldownT * 0.25;
      crystalGlow = 0.08 + cooldownT * 0.12;
      runeProgress = cooldownT;
      if (cooldownT > 0.92 && Math.sin(phase * 6) > 0.85) crystalGlow = 0.35;
    } else {
      spinRate = 0.4;
      crystalGlow = 0.15;
    }

    const seed = e.id * 0.31 + state.tick * 0.02;
    drawBaseRunes(strokePool, fillPool, drawPos, e.pos.x, e.pos.y, runeProgress, e.radius, stutter, phase);
    drawOrbitingRings(strokePool, fillPool, drawPos, e.pos.x, e.pos.y, spinRate, phase, seed, crystalGlow);
    drawFloatingCrystal(fillPool, strokePool, drawPos, e.pos.x, e.pos.y, crystalGlow, stutter && !e.chargingAttack, phase);

    if (e.chargingAttack && chargeT > 0.15) {
      drawSkyBeam(strokePool, fillPool, drawPos, e.pos.x, e.pos.y, chargeT, phase);
    }
    if (hasTarget && e.chargingAttack) {
      drawTargetRune(strokePool, fillPool, drawPos, targetX, targetY, impactRadius, chargeT, phase);
    }
  }

  for (const e of state.entities.values()) {
    if (e.kind !== 'projectile' || e.defId !== 'celestial_shot') continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;
    drawProjectileTrail(strokePool, fillPool, drawPos, e.pos.x, e.pos.y, e.facing, phase);
  }

  drawSkyStrikes(strokePool, fillPool, drawPos, phase);
  drawScorchMarks(strokePool, fillPool, drawPos);
}

/** Charge progress 0–1 for a building (used by audio layer). */
export function celestialChargeProgress(b: BuildingEntity, chargeTicks: number): number {
  if (!b.chargingAttack) return 0;
  return 1 - b.chargingAttack.remainingTicks / chargeTicks;
}

/** Whether the building is in post-fire cooldown. */
export function celestialInCooldown(b: BuildingEntity): boolean {
  return !b.chargingAttack && (b.cooldowns.attack ?? 0) > 0;
}

/** Cooldown recovery 0–1. */
export function celestialCooldownProgress(b: BuildingEntity, cooldownTicks: number): number {
  const cd = b.cooldowns.attack ?? 0;
  if (cd <= 0) return 1;
  return 1 - cd / cooldownTicks;
}

/** Distance from cannon to target during charge (world units). */
export function celestialTargetDistance(state: GameState, b: BuildingEntity): number {
  if (!b.chargingAttack) return 0;
  const target = state.entities.get(b.chargingAttack.targetId);
  if (!target) return 0;
  return len(target.pos.x - b.pos.x, target.pos.y - b.pos.y);
}
