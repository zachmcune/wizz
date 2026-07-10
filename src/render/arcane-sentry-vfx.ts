// Arcane Sentry presentation — orbiting crystals, sustained bolt stream, impact polish, idle animation.
// Reads sim state for aim and projectiles; never affects gameplay.
import type { Registry } from '../data/registry';
import type { BuildingEntity } from '../sim/entity-types';
import type { EntityId, GameState, PlayerId } from '../sim/types';
import { isVisibleTo, buildingHasPower, isAlive } from '../sim/views';
import type { NavGrid } from '../sim/nav-grid';
import { getProjectileCapability } from '../sim/capabilities';
import type { GraphicsPool } from './graphics-pool';
import type { AudioManager } from '../audio/audio';
import { detRand, drawFloatingMotes, easeOut, lerpColor } from './support-aura-vfx';

export type SentryDrawPosFn = (worldX: number, worldY: number) => { x: number; y: number };

const WHITE = 0xffffff;
const CYAN = 0x7fe3ff;
const BLUE = 0x4a9eff;
const SOFT_CYAN = 0xb8e8ff;

/** One full orbit every ~7s (within the 6–8s spec range). */
const ORBIT_PERIOD_SEC = 7;
const CRYSTAL_FLASH_SEC = 0.05;
const IMPACT_SPARK_SEC = 0.15;
const IMPACT_RING_SEC = 0.2;
const MAX_IMPACTS = 48;
const MAX_BOLTS_DRAWN = 64;
const IDLE_MOTE_COUNT = 4;

interface CrystalFlash {
  sentryId: EntityId;
  crystalIndex: number;
  age: number;
  life: number;
}

interface FilamentSnap {
  sentryId: EntityId;
  crystalIndex: number;
  facing: number;
  age: number;
  life: number;
}

interface BoltTrail {
  projId: EntityId;
  x: number;
  y: number;
  facing: number;
  age: number;
}

interface SentryImpact {
  x: number;
  y: number;
  targetId: EntityId;
  age: number;
  life: number;
  seed: number;
  playAudio: boolean;
}

const crystalFlashes: CrystalFlash[] = [];
const filamentSnaps: FilamentSnap[] = [];
const boltTrails: BoltTrail[] = [];
const impacts: SentryImpact[] = [];
const trackedBolts = new Map<EntityId, { x: number; y: number; targetId: EntityId }>();
const lastHadTarget = new Map<EntityId, boolean>();
const sentryCombatGlow = new Map<EntityId, number>();

/** Register a bolt launch for crystal flash + filament VFX (called from EventBridge). */
export function registerSentryBoltFired(
  sentryId: EntityId,
  crystalIndex: number,
  facing: number,
): void {
  crystalFlashes.push({
    sentryId,
    crystalIndex: crystalIndex % 3,
    age: 0,
    life: Math.ceil(CRYSTAL_FLASH_SEC * 60),
  });
  filamentSnaps.push({
    sentryId,
    crystalIndex: crystalIndex % 3,
    facing,
    age: 0,
    life: Math.ceil(CRYSTAL_FLASH_SEC * 60) + 2,
  });
  if (crystalFlashes.length > 96) crystalFlashes.shift();
  if (filamentSnaps.length > 96) filamentSnaps.shift();
}

function crystalOrbitAngle(tick: number, sentryId: EntityId, crystalIndex: number, phaseSec: number): number {
  const base = ((tick + sentryId * 0.37) / 20 + phaseSec) * (Math.PI * 2 / ORBIT_PERIOD_SEC);
  return base + crystalIndex * (Math.PI * 2 / 3);
}

function crystalWorldOffset(
  facing: number,
  orbitR: number,
  orbitAng: number,
): { x: number; y: number } {
  const localX = Math.cos(orbitAng) * orbitR;
  const localY = Math.sin(orbitAng) * orbitR * 0.55;
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  return {
    x: localX * cos - localY * sin,
    y: localX * sin + localY * cos,
  };
}

function drawCentralCrystal(
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  cx: number,
  cy: number,
  radius: number,
  glow: number,
  shimmer: number,
  facing: number,
): void {
  const breathe = 0.55 + Math.sin(shimmer * 1.2) * 0.12;
  const combatBoost = glow * 0.45;
  const coreAlpha = 0.35 + breathe * 0.25 + combatBoost;
  const outerAlpha = 0.15 + glow * 0.35 + shimmer * 0.08;

  fillPool.acquire().circle(cx, cy, radius * (0.9 + glow * 0.15)).fill({ color: CYAN, alpha: outerAlpha * 0.5 });
  fillPool.acquire().circle(cx, cy, radius * (0.55 + breathe * 0.08)).fill({ color: WHITE, alpha: coreAlpha });
  strokePool.acquire().circle(cx, cy, radius * 0.7).stroke({ width: 1.2, color: SOFT_CYAN, alpha: 0.35 + glow * 0.4 });

  const barrelLen = radius * 1.1;
  const bx = cx + Math.cos(facing) * barrelLen * 0.35;
  const by = cy + Math.sin(facing) * barrelLen * 0.35;
  strokePool.acquire().moveTo(cx, cy).lineTo(bx, by).stroke({ width: 1.5, color: WHITE, alpha: 0.25 + glow * 0.55 });
}

function drawFocusingCrystal(
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  cx: number,
  cy: number,
  radius: number,
  flash: number,
  idleSpark: number,
): void {
  const flashBoost = flash > 0 ? 0.85 : 0;
  const alpha = 0.4 + flashBoost + idleSpark * 0.25;
  const color = flashBoost > 0.5 ? WHITE : lerpColor(CYAN, SOFT_CYAN, 0.35);
  fillPool.acquire().circle(cx, cy, radius * (1 + flashBoost * 0.35)).fill({ color, alpha });
  strokePool.acquire().circle(cx, cy, radius * 1.15).stroke({ width: 1, color: BLUE, alpha: alpha * 0.6 });
}

function drawFilament(
  strokePool: GraphicsPool,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  alpha: number,
): void {
  strokePool.acquire().moveTo(fromX, fromY).lineTo(toX, toY).stroke({ width: 1.2, color: WHITE, alpha });
  strokePool.acquire().moveTo(fromX, fromY).lineTo(toX, toY).stroke({ width: 2.5, color: CYAN, alpha: alpha * 0.35 });
}

function drawIdleSparkExchange(
  strokePool: GraphicsPool,
  cx: number,
  cy: number,
  facing: number,
  orbitR: number,
  orbitAng: number,
  phase: number,
  seed: number,
): void {
  if (detRand(seed + Math.floor(phase * 0.5)) > 0.92) {
    const off = crystalWorldOffset(facing, orbitR, orbitAng);
    const fx = cx + off.x;
    const fy = cy + off.y;
    strokePool.acquire().moveTo(fx, fy).lineTo(cx, cy).stroke({ width: 0.8, color: SOFT_CYAN, alpha: 0.35 });
  }
}

function drawArcaneBolt(
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  x: number,
  y: number,
  facing: number,
  waverPhase: number,
  seed: number,
): void {
  const waver = Math.sin(waverPhase * 8 + seed) * 1.5;
  const perpX = -Math.sin(facing);
  const perpY = Math.cos(facing);
  const px = x + perpX * waver;
  const py = y + perpY * waver;

  const trailLen = 14;
  const tx = px - Math.cos(facing) * trailLen;
  const ty = py - Math.sin(facing) * trailLen;
  strokePool.acquire().moveTo(tx, ty).lineTo(px, py).stroke({ width: 3, color: CYAN, alpha: 0.35 });
  strokePool.acquire().moveTo(tx, ty).lineTo(px, py).stroke({ width: 1.2, color: WHITE, alpha: 0.55 });
  fillPool.acquire().circle(px, py, 2.2).fill({ color: WHITE, alpha: 0.9 });
  fillPool.acquire().circle(px, py, 4).fill({ color: CYAN, alpha: 0.25 });
}

function drawImpact(
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  drawPos: SentryDrawPosFn,
  impact: SentryImpact,
  dtSec: number,
): void {
  impact.age += dtSec * 60;
  const t = impact.age / impact.life;
  if (t >= 1) return;

  const p = drawPos(impact.x, impact.y);
  const burstAlpha = (1 - t * 2) * 0.7;
  if (burstAlpha > 0) {
    fillPool.acquire().circle(p.x, p.y, 4 + t * 3).fill({ color: WHITE, alpha: burstAlpha });
    fillPool.acquire().circle(p.x, p.y, 7 + t * 5).fill({ color: CYAN, alpha: burstAlpha * 0.35 });
  }

  const sparkT = impact.age / (IMPACT_SPARK_SEC * 60);
  if (sparkT < 1) {
    const sparkCount = 4;
    for (let i = 0; i < sparkCount; i++) {
      const ang = detRand(impact.seed + i) * Math.PI * 2;
      const dist = easeOut(sparkT) * (10 + detRand(impact.seed + i * 2) * 8);
      const sx = p.x + Math.cos(ang) * dist;
      const sy = p.y + Math.sin(ang) * dist * 0.6;
      const a = (1 - sparkT) * 0.65;
      fillPool.acquire().circle(sx, sy, 1.2).fill({ color: SOFT_CYAN, alpha: a });
    }
  }

  const ringT = impact.age / (IMPACT_RING_SEC * 60);
  if (ringT < 1) {
    const ringR = 6 + easeOut(ringT) * 14;
    strokePool.acquire().ellipse(p.x, p.y, ringR, ringR * 0.45).stroke({
      width: 1.2,
      color: CYAN,
      alpha: (1 - ringT) * 0.5,
    });
  }
}

function sentryHasTarget(state: GameState, registry: Registry, sentry: BuildingEntity): boolean {
  const w = registry.building(sentry.defId).weapon;
  if (!w) return false;
  const reach = w.range + sentry.radius;
  for (const o of state.entities.values()) {
    if (o.kind === 'resource_node' || o.kind === 'projectile' || !isAlive(o)) continue;
    if (o.owner === sentry.owner || o.owner === 'neutral') continue;
    const d = Math.hypot(o.pos.x - sentry.pos.x, o.pos.y - sentry.pos.y);
    if (d <= reach + o.radius) return true;
  }
  return false;
}

function updateBoltTracking(state: GameState): void {
  const active = new Set<EntityId>();
  let drawn = 0;

  for (const e of state.entities.values()) {
    if (e.kind !== 'projectile' || e.defId !== 'arcane_bolt') continue;
    const cap = getProjectileCapability(e);
    if (!cap) continue;
    const src = state.entities.get(cap.sourceId);
    if (!src || src.defId !== 'ward_turret') continue;

    active.add(e.id);
    trackedBolts.set(e.id, { x: e.pos.x, y: e.pos.y, targetId: cap.targetId });
    if (drawn < MAX_BOLTS_DRAWN) {
      boltTrails.push({ projId: e.id, x: e.pos.x, y: e.pos.y, facing: e.facing, age: 0 });
      drawn++;
    }
  }

  for (const [id, bolt] of trackedBolts) {
    if (active.has(id)) continue;
    const target = state.entities.get(bolt.targetId);
    const ix = target?.pos.x ?? bolt.x;
    const iy = target?.pos.y ?? bolt.y;
    if (impacts.length >= MAX_IMPACTS) impacts.shift();
    impacts.push({
      x: ix,
      y: iy,
      targetId: bolt.targetId,
      age: 0,
      life: Math.ceil(IMPACT_RING_SEC * 60),
      seed: id * 0.31 + ix * 0.17,
      playAudio: true,
    });
    trackedBolts.delete(id);
  }

  if (boltTrails.length > MAX_BOLTS_DRAWN * 2) boltTrails.splice(0, boltTrails.length - MAX_BOLTS_DRAWN);
}

export function renderArcaneSentries(
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid | null,
  revealAll: boolean,
  drawPos: SentryDrawPosFn,
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  phaseSec: number,
  dtSec: number,
): void {
  updateBoltTracking(state);

  for (let i = impacts.length - 1; i >= 0; i--) {
    const imp = impacts[i]!;
    drawImpact(fillPool, strokePool, drawPos, imp, dtSec);
    if (imp.age >= imp.life) impacts.splice(i, 1);
  }

  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.defId !== 'ward_turret') continue;
    if (!buildingHasPower(state, registry, e)) continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;

    const p = drawPos(e.pos.x, e.pos.y);
    const facing = e.facing;
    const orbitR = 14;
    const centerLift = 22;
    const cx = p.x;
    const cy = p.y - centerLift;
    const hasTarget = sentryHasTarget(state, registry, e);
    const prevGlow = sentryCombatGlow.get(e.id) ?? 0;
    const targetGlow = hasTarget ? 1 : 0;
    const glow = prevGlow + (targetGlow - prevGlow) * Math.min(1, dtSec * 30);
    sentryCombatGlow.set(e.id, glow);

    drawFloatingMotes(fillPool, p.x, p.y + 6, 16, IDLE_MOTE_COUNT, phaseSec, e.id * 0.13, SOFT_CYAN, 0.35);

    for (let ci = 0; ci < 3; ci++) {
      const orbitAng = crystalOrbitAngle(state.tick, e.id, ci, phaseSec);
      const off = crystalWorldOffset(facing, orbitR, orbitAng);
      const fcx = cx + off.x;
      const fcy = cy + off.y;

      let flash = 0;
      for (const f of crystalFlashes) {
        if (f.sentryId !== e.id || f.crystalIndex !== ci) continue;
        f.age += dtSec * 60;
        if (f.age < f.life) flash = Math.max(flash, 1 - f.age / f.life);
      }

      const idleSpark = !hasTarget ? Math.max(0, Math.sin(phaseSec * 2.1 + ci * 2.4) * 0.5 + 0.5) * 0.4 : 0;
      drawFocusingCrystal(fillPool, strokePool, fcx, fcy, 3.5, flash, idleSpark);

      if (!hasTarget) {
        drawIdleSparkExchange(strokePool, cx, cy, facing, orbitR, orbitAng, phaseSec, e.id + ci * 7);
      }
    }

    for (let i = filamentSnaps.length - 1; i >= 0; i--) {
      const snap = filamentSnaps[i]!;
      if (snap.sentryId !== e.id) continue;
      snap.age += dtSec * 60;
      if (snap.age >= snap.life) {
        filamentSnaps.splice(i, 1);
        continue;
      }
      const orbitAng = crystalOrbitAngle(state.tick, e.id, snap.crystalIndex, phaseSec);
      const off = crystalWorldOffset(snap.facing, orbitR, orbitAng);
      const alpha = 1 - snap.age / snap.life;
      drawFilament(strokePool, cx + off.x, cy + off.y, cx, cy, alpha * 0.85);
    }

    const shimmer = phaseSec * (hasTarget ? 14 : 2);
    drawCentralCrystal(fillPool, strokePool, cx, cy, 9, glow, shimmer, facing);
  }

  for (const trail of boltTrails) {
    const seed = trail.projId * 0.23;
    drawArcaneBolt(fillPool, strokePool, trail.x, trail.y, trail.facing, phaseSec + trail.age * 0.1, seed);
    trail.age += dtSec * 60;
  }
  boltTrails.length = 0;

  for (let i = crystalFlashes.length - 1; i >= 0; i--) {
    const f = crystalFlashes[i]!;
    f.age += dtSec * 60;
    if (f.age >= f.life) crystalFlashes.splice(i, 1);
  }
}

export function tickArcaneSentryAudio(
  audio: AudioManager,
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid | null,
  revealAll: boolean,
): void {
  let anyVisible = false;
  let anyCombat = false;

  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.defId !== 'ward_turret') continue;
    if (!buildingHasPower(state, registry, e)) continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;
    anyVisible = true;

    const hasTarget = sentryHasTarget(state, registry, e);
    if (hasTarget) anyCombat = true;

    const prev = lastHadTarget.get(e.id) ?? false;
    if (!prev && hasTarget) audio.playSentryAcquire();
    lastHadTarget.set(e.id, hasTarget);
  }

  for (const imp of impacts) {
    if (imp.playAudio && imp.age < 1) {
      audio.playSentryImpact();
      imp.playAudio = false;
    }
  }

  if (anyVisible) {
    audio.tickSentryIdle(anyCombat);
  } else {
    audio.stopSentryIdle();
  }
}

/** Reset presentation state (match teardown / preview reset). */
export function resetArcaneSentryVfx(): void {
  crystalFlashes.length = 0;
  filamentSnaps.length = 0;
  boltTrails.length = 0;
  impacts.length = 0;
  trackedBolts.clear();
  lastHadTarget.clear();
  sentryCombatGlow.clear();
}
