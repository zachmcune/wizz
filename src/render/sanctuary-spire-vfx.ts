// Sanctuary Spire presentation — healing pulse, blessing, sanctuary field, buff tells.
// Reads sim state for aura radius and ally positions; never affects gameplay.
import type { Registry } from '../data/registry';
import type { BuildingEntity, UnitEntity } from '../sim/entity-types';
import type { EntityId, GameState, PlayerId } from '../sim/types';
import { isVisibleTo, buildingHasPower, isAlive, isAlly } from '../sim/views';
import type { NavGrid } from '../sim/nav-grid';
import { distSq, len } from '../sim/math';
import { garrisonedInId } from '../sim/capabilities';
import type { GraphicsPool } from './graphics-pool';
import type { AudioManager } from '../audio/audio';
import {
  auraTierFromUnitCount,
  detRand,
  drawExpandingRing,
  drawFloatingMotes,
  drawFootOrbitRing,
  drawGroundRuneCircle,
  drawInwardMist,
  easeIn,
  easeInOut,
  easeOut,
  lerpColor,
  tierBlend,
} from './support-aura-vfx';

export type SanctuaryDrawPosFn = (worldX: number, worldY: number) => { x: number; y: number };

const TEAL_FIELD = 0x8fffd2;
const TEAL_SOFT = 0x6bc4a8;
const GOLD_WARM = 0xffd166;
const GOLD_LIGHT = 0xffe8a8;
const GOLD_CORE = 0xfff4d0;
const WHITE_SOFT = 0xffffff;

/** Full pulse cycle length in sim ticks (~3.5s at 20 Hz). */
export const SANCTUARY_CYCLE_TICKS = 70;
const IDLE_TICKS = 10;
const ANTICIPATION_TICKS = 20;
const WAVE_TICKS = 14;
const AFTERGLOW_TICKS = 25;
const BLOOM_TICK = IDLE_TICKS + ANTICIPATION_TICKS;
const WAVE_START = BLOOM_TICK + 1;
const AFTERGLOW_START = WAVE_START + WAVE_TICKS;

const RUNE_ROTATION_PERIOD = 60;
const BLESSING_LIFE_TICKS = 8;
const BLESSING_RESET_TICKS = 70;
const PULSE_FLASH_LIFE = 18;
const ATTACK_TRAIL_LIFE = 10;

export type SanctuaryPulsePhase = 'idle' | 'anticipation' | 'bloom' | 'wave' | 'afterglow';

interface BlessingRibbon {
  spireId: EntityId;
  unitId: EntityId;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  age: number;
  life: number;
}

interface PulseFlash {
  unitId: EntityId;
  x: number;
  y: number;
  age: number;
  life: number;
}

interface AttackTrail {
  x: number;
  y: number;
  angle: number;
  age: number;
  life: number;
}

interface AfterimageRing {
  cx: number;
  cy: number;
  radius: number;
  age: number;
  life: number;
}

const blessingRibbons: BlessingRibbon[] = [];
const pulseFlashes: PulseFlash[] = [];
const attackTrails: AttackTrail[] = [];
const afterimageRings: AfterimageRing[] = [];

const blessedUnits = new Map<string, { inAura: boolean; leftAtTick: number }>();
const tierDisplay = new Map<EntityId, number>();
const bloomHold = new Map<EntityId, number>();
const bloomFlashFrames = new Map<EntityId, number>();
const lastAudioPhase = new Map<EntityId, SanctuaryPulsePhase>();
const lastAnticipationSample = new Map<EntityId, number>();

const MAX_BLESSINGS = 12;
const MAX_FLASHES = 32;
const MAX_TRAILS = 24;
const MAX_AFTERIMAGES = 8;

function cycleTick(buildingId: EntityId, tick: number): number {
  return (tick + buildingId * 17) % SANCTUARY_CYCLE_TICKS;
}

export function sanctuaryPulsePhase(buildingId: EntityId, tick: number): SanctuaryPulsePhase {
  const t = cycleTick(buildingId, tick);
  if (t < IDLE_TICKS) return 'idle';
  if (t < BLOOM_TICK) return 'anticipation';
  if (t === BLOOM_TICK) return 'bloom';
  if (t < AFTERGLOW_START) return 'wave';
  return 'afterglow';
}

export function sanctuaryAnticipationProgress(buildingId: EntityId, tick: number): number {
  const t = cycleTick(buildingId, tick);
  if (t < IDLE_TICKS || t >= BLOOM_TICK) return t >= BLOOM_TICK ? 1 : 0;
  return (t - IDLE_TICKS) / ANTICIPATION_TICKS;
}

export function sanctuaryWaveProgress(buildingId: EntityId, tick: number): number {
  const t = cycleTick(buildingId, tick);
  if (t < WAVE_START || t >= AFTERGLOW_START) return t >= AFTERGLOW_START ? 1 : 0;
  return (t - WAVE_START) / WAVE_TICKS;
}

function crystalScreenPos(drawPos: SanctuaryDrawPosFn, bx: number, by: number): { x: number; y: number } {
  const p = drawPos(bx, by);
  return { x: p.x, y: p.y - 36 };
}

function auraKey(spireId: EntityId, unitId: EntityId): string {
  return `${spireId}:${unitId}`;
}

function alliesInAura(state: GameState, spire: BuildingEntity, radius: number): UnitEntity[] {
  const radiusSq = radius * radius;
  const out: UnitEntity[] = [];
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || !isAlive(e)) continue;
    if (!isAlly(state, spire.owner, e.owner)) continue;
    if (garrisonedInId(e) !== undefined) continue;
    if (distSq(spire.pos.x, spire.pos.y, e.pos.x, e.pos.y) > radiusSq) continue;
    out.push(e);
  }
  return out;
}

/** Whether a unit is inside any powered Sanctuary Spire aura (for buff tell + attack trails). */
export function isUnitInSanctuaryAura(state: GameState, registry: Registry, unit: UnitEntity): boolean {
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.defId !== 'sanctuary_spire' || !isAlive(e)) continue;
    if (!buildingHasPower(state, registry, e)) continue;
    const aura = registry.buildings.get(e.defId)?.aura;
    if (!aura) continue;
    const r = aura.radius;
    if (distSq(e.pos.x, e.pos.y, unit.pos.x, unit.pos.y) <= r * r) return true;
  }
  return false;
}

function trackBlessings(spire: BuildingEntity, allies: UnitEntity[], tick: number): void {
  const inSet = new Set(allies.map((u) => u.id));
  for (const unit of allies) {
    const key = auraKey(spire.id, unit.id);
    const prev = blessedUnits.get(key);
    const wasIn = prev?.inAura ?? false;
    const leftLongEnough = prev && !prev.inAura && tick - prev.leftAtTick >= BLESSING_RESET_TICKS;
    if (!wasIn || leftLongEnough) {
      if (blessingRibbons.length >= MAX_BLESSINGS) blessingRibbons.shift();
      blessingRibbons.push({
        spireId: spire.id,
        unitId: unit.id,
        sx: spire.pos.x,
        sy: spire.pos.y,
        tx: unit.pos.x,
        ty: unit.pos.y,
        age: 0,
        life: BLESSING_LIFE_TICKS,
      });
    }
    blessedUnits.set(key, { inAura: true, leftAtTick: prev?.leftAtTick ?? tick });
  }
  for (const [key, val] of blessedUnits) {
    if (!key.startsWith(`${spire.id}:`)) continue;
    const unitId = Number(key.split(':')[1]) as EntityId;
    if (inSet.has(unitId)) continue;
    if (val.inAura) blessedUnits.set(key, { inAura: false, leftAtTick: tick });
  }
}

function checkPulseHits(
  spire: BuildingEntity,
  allies: UnitEntity[],
  waveT: number,
  radius: number,
): void {
  if (waveT <= 0 || waveT >= 1) return;
  for (const unit of allies) {
    const d = len(unit.pos.x - spire.pos.x, unit.pos.y - spire.pos.y);
    const arrivalT = d / radius;
    if (Math.abs(waveT - arrivalT) > 0.06) continue;
    const existing = pulseFlashes.find((f) => f.unitId === unit.id && f.age < 4);
    if (existing) continue;
    if (pulseFlashes.length >= MAX_FLASHES) pulseFlashes.shift();
    pulseFlashes.push({ unitId: unit.id, x: unit.pos.x, y: unit.pos.y, age: 0, life: PULSE_FLASH_LIFE });
  }
}

/** Register a gold attack trail for a buffed unit strike (called from EventBridge). */
export function spawnSanctuaryAttackTrail(x: number, y: number, angle: number): void {
  if (attackTrails.length >= MAX_TRAILS) attackTrails.shift();
  attackTrails.push({ x, y, angle, age: 0, life: ATTACK_TRAIL_LIFE });
}

function drawTieredCrystal(
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  drawPos: SanctuaryDrawPosFn,
  bx: number,
  by: number,
  glow: number,
  phase: number,
  tier: number,
): void {
  const p = drawPos(bx, by);
  const bob = Math.sin(phase * 0.45) * 2.2;
  const cx = p.x;
  const cy = p.y - 36 + bob;
  const breathe = 0.08 + Math.sin(phase * 0.28) * 0.06;
  const restGlow = 0.14 + breathe + (tier - 1) * 0.12;
  const totalGlow = Math.min(1, restGlow + glow);
  const coreR = 5.5 + totalGlow * 5 + (tier >= 3 ? 1.5 : 0);
  const color = lerpColor(GOLD_WARM, WHITE_SOFT, totalGlow * 0.65);
  fillPool.acquire().circle(cx, cy, coreR * 1.6).fill({
    color: lerpColor(TEAL_SOFT, GOLD_LIGHT, totalGlow * 0.5),
    alpha: 0.15 + totalGlow * 0.35,
  });
  fillPool.acquire().circle(cx, cy, coreR).fill({
    color: lerpColor(color, GOLD_CORE, totalGlow * 0.7),
    alpha: 0.55 + totalGlow * 0.45,
  });
  strokePool.acquire()
    .moveTo(cx, cy - coreR * 1.25)
    .lineTo(cx + coreR * 0.55, cy - coreR * 0.15)
    .lineTo(cx + coreR * 0.35, cy + coreR * 0.85)
    .lineTo(cx - coreR * 0.35, cy + coreR * 0.85)
    .lineTo(cx - coreR * 0.55, cy - coreR * 0.15)
    .closePath()
    .stroke({ width: 1.4, color: lerpColor(GOLD_LIGHT, WHITE_SOFT, totalGlow), alpha: 0.45 + totalGlow * 0.5 });
}

function drawOrbitingHalos(
  strokePool: GraphicsPool,
  drawPos: SanctuaryDrawPosFn,
  bx: number,
  by: number,
  spinRate: number,
  alignment: number,
  phase: number,
  glow: number,
): void {
  const p = drawPos(bx, by);
  const lift = 16;
  const bob = Math.sin(phase * 0.45) * 2;
  for (let ring = 0; ring < 2; ring++) {
    const baseR = 14 + ring * 8;
    const alignOffset = alignment * (ring === 0 ? 1 : -0.85) * Math.PI * 0.5;
    const spin = phase * spinRate * (ring === 0 ? 1 : -0.75) + alignOffset;
    const g = strokePool.acquire();
    const segments = 24;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2 + spin;
      const squash = 0.28;
      const px = p.x + Math.cos(a) * baseR;
      const py = p.y - lift - ring * 5 + bob + Math.sin(a) * baseR * squash;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    const color = lerpColor(TEAL_FIELD, GOLD_LIGHT, glow);
    g.stroke({ width: 1.2 + ring * 0.3, color, alpha: 0.28 + glow * 0.52 });
  }
}

function drawBloomFlash(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  cx: number,
  cy: number,
  holdT: number,
): void {
  const t = easeOut(Math.min(1, holdT));
  const alpha = (1 - t) * 0.85;
  const r = 10 + t * 18;
  fillPool.acquire().circle(cx, cy, r * 0.55).fill({ color: WHITE_SOFT, alpha: alpha * 0.55 });
  fillPool.acquire().circle(cx, cy, r * 0.3).fill({ color: GOLD_CORE, alpha: alpha * 0.75 });
  strokePool.acquire().circle(cx, cy, r).stroke({ width: 2.5 - t, color: GOLD_LIGHT, alpha: alpha * 0.7 });
  strokePool.acquire().circle(cx, cy, r * 1.15).stroke({ width: 1.5, color: TEAL_FIELD, alpha: alpha * 0.35 });
}

function drawFeedingParticles(
  fillPool: GraphicsPool,
  drawPos: SanctuaryDrawPosFn,
  bx: number,
  by: number,
  density: number,
  phase: number,
  seed: number,
  progress: number,
): void {
  const p = drawPos(bx, by);
  const count = Math.max(2, Math.floor(density * (0.5 + progress * 0.8)));
  for (let i = 0; i < count; i++) {
    const ang = detRand(seed + i * 4.1) * Math.PI * 2 + phase * 0.2;
    const dist = 18 + detRand(seed + i) * 22;
    const rise = progress * 14 + Math.sin(phase + i) * 2;
    const px = p.x + Math.cos(ang) * dist;
    const py = p.y + 8 + Math.sin(ang) * dist * 0.2 - rise;
    fillPool.acquire().circle(px, py, 1 + detRand(seed + i * 2)).fill({ color: TEAL_FIELD, alpha: 0.15 + progress * 0.35 });
  }
}

function drawBlessingRibbons(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  drawPos: SanctuaryDrawPosFn,
): void {
  for (let i = blessingRibbons.length - 1; i >= 0; i--) {
    const b = blessingRibbons[i]!;
    b.age++;
    if (b.age >= b.life) {
      blessingRibbons.splice(i, 1);
      continue;
    }
    const t = easeInOut(b.age / b.life);
    const sc = crystalScreenPos(drawPos, b.sx, b.sy);
    const tp = drawPos(b.tx, b.ty);
    const headX = sc.x + (tp.x - sc.x) * t;
    const headY = sc.y + (tp.y - sc.y) * t - 18 * Math.sin(t * Math.PI);
    const alpha = t < 0.85 ? 0.7 : ((1 - t) / 0.15) * 0.7;
    strokePool.acquire()
      .moveTo(sc.x, sc.y)
      .quadraticCurveTo((sc.x + tp.x) * 0.5, (sc.y + tp.y) * 0.5 - 28, headX, headY)
      .stroke({ width: 2, color: GOLD_LIGHT, alpha });
    if (t > 0.55) {
      const runeT = (t - 0.55) / 0.45;
      const runeAlpha = easeOut(runeT) * (1 - runeT * 0.6);
      const rx = tp.x;
      const ry = tp.y - 22;
      strokePool.acquire().circle(rx, ry, 6 + runeT * 4).stroke({ width: 1.5, color: GOLD_WARM, alpha: runeAlpha * 0.8 });
      fillPool.acquire().circle(rx, ry, 3).fill({ color: WHITE_SOFT, alpha: runeAlpha * 0.5 });
    }
  }
}

function drawPulseFlashes(strokePool: GraphicsPool, fillPool: GraphicsPool, drawPos: SanctuaryDrawPosFn): void {
  for (let i = pulseFlashes.length - 1; i >= 0; i--) {
    const f = pulseFlashes[i]!;
    f.age++;
    if (f.age >= f.life) {
      pulseFlashes.splice(i, 1);
      continue;
    }
    const t = f.age / f.life;
    const alpha = (1 - easeOut(t)) * 0.75;
    const r = 10 + t * 8;
    const p = drawPos(f.x, f.y);
    fillPool.acquire().circle(p.x, p.y, r).fill({ color: TEAL_FIELD, alpha: alpha * 0.35 });
    strokePool.acquire().circle(p.x, p.y, r * 0.85).stroke({ width: 2, color: WHITE_SOFT, alpha });
  }
}

function drawAttackTrails(strokePool: GraphicsPool, drawPos: SanctuaryDrawPosFn): void {
  for (let i = attackTrails.length - 1; i >= 0; i--) {
    const tr = attackTrails[i]!;
    tr.age++;
    if (tr.age >= tr.life) {
      attackTrails.splice(i, 1);
      continue;
    }
    const t = tr.age / tr.life;
    const alpha = (1 - t) * 0.65;
    const p = drawPos(tr.x, tr.y);
    const lenTrail = 14 * (1 - t * 0.4);
    const x2 = p.x + Math.cos(tr.angle) * lenTrail;
    const y2 = p.y + Math.sin(tr.angle) * lenTrail * 0.55;
    strokePool.acquire().moveTo(p.x, p.y).lineTo(x2, y2).stroke({ width: 2.5 - t, color: GOLD_WARM, alpha });
    strokePool.acquire().moveTo(p.x, p.y).lineTo(x2, y2).stroke({ width: 1, color: GOLD_CORE, alpha: alpha * 0.8 });
  }
}

function drawAfterimages(strokePool: GraphicsPool, drawPos: SanctuaryDrawPosFn): void {
  for (let i = afterimageRings.length - 1; i >= 0; i--) {
    const a = afterimageRings[i]!;
    a.age++;
    if (a.age >= a.life) {
      afterimageRings.splice(i, 1);
      continue;
    }
    const t = a.age / a.life;
    const p = drawPos(a.cx, a.cy);
    strokePool.acquire().circle(p.x, p.y, a.radius * (1 + t * 0.05)).stroke({
      width: 1.5,
      color: TEAL_SOFT,
      alpha: (1 - easeOut(t)) * 0.28,
    });
  }
}

function drawBuffedUnits(
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid | null,
  revealAll: boolean,
  drawPos: SanctuaryDrawPosFn,
  strokePool: GraphicsPool,
  phase: number,
): void {
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || !isAlive(e)) continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;
    if (!isUnitInSanctuaryAura(state, registry, e)) continue;
    const def = registry.units.get(e.defId);
    const r = def?.radius ?? 12;
    const p = drawPos(e.pos.x, e.pos.y);
    drawFootOrbitRing(strokePool, p.x, p.y + 4, r, phase + e.id * 0.1, GOLD_WARM, 0.55);
  }
}

export function renderSanctuarySpires(
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid | null,
  revealAll: boolean,
  drawPos: SanctuaryDrawPosFn,
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  animPhase: number,
  dtSec: number,
): void {
  const phase = animPhase;

  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.defId !== 'sanctuary_spire') continue;
    if (!buildingHasPower(state, registry, e)) continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;

    const def = registry.buildings.get(e.defId);
    const aura = def?.aura;
    if (!aura) continue;

    const radius = aura.radius;
    const allies = alliesInAura(state, e, radius);
    const targetTier = auraTierFromUnitCount(allies.length);
    const prevTier = tierDisplay.get(e.id) ?? 1;
    const displayTier = tierBlend(prevTier, targetTier, dtSec);
    tierDisplay.set(e.id, displayTier);

    const pulsePhase = sanctuaryPulsePhase(e.id, state.tick);
    const anticipationT = sanctuaryAnticipationProgress(e.id, state.tick);
    const waveT = sanctuaryWaveProgress(e.id, state.tick);

    let ringSpin = 0.22;
    let ringAlign = 0;
    let crystalGlow = 0;
    if (pulsePhase === 'anticipation') {
      ringSpin = 0.22 + easeIn(anticipationT) * 2.4;
      ringAlign = easeIn(anticipationT);
      crystalGlow = easeIn(anticipationT) * 0.82;
    } else if (pulsePhase === 'bloom') {
      ringAlign = 1;
      crystalGlow = 1;
      if (!bloomHold.has(e.id)) {
        bloomHold.set(e.id, state.tick);
        bloomFlashFrames.set(e.id, 0);
        if (displayTier >= 3) {
          if (afterimageRings.length >= MAX_AFTERIMAGES) afterimageRings.shift();
          afterimageRings.push({ cx: e.pos.x, cy: e.pos.y, radius, age: 0, life: 35 });
        }
      }
    } else if (pulsePhase === 'afterglow') {
      const afterT = (cycleTick(e.id, state.tick) - AFTERGLOW_START) / AFTERGLOW_TICKS;
      crystalGlow = (1 - easeOut(afterT)) * 0.45;
      ringAlign = (1 - afterT) * 0.3;
    } else if (pulsePhase === 'wave') {
      crystalGlow = 0.35;
      ringAlign = 0.15;
    } else {
      crystalGlow = 0.05 + Math.sin(phase * 0.35) * 0.04;
    }

    const bloomFrame = bloomFlashFrames.get(e.id);
    if (bloomFrame !== undefined && bloomFrame < 3) {
      const crystal = crystalScreenPos(drawPos, e.pos.x, e.pos.y);
      drawBloomFlash(strokePool, fillPool, crystal.x, crystal.y, (bloomFrame + 1) / 3);
      strokePool.acquire().circle(crystal.x, crystal.y, 22).stroke({ width: 2, color: GOLD_LIGHT, alpha: 0.55 });
      bloomFlashFrames.set(e.id, bloomFrame + 1);
    } else if (bloomFrame !== undefined && bloomFrame >= 3) {
      bloomFlashFrames.delete(e.id);
      bloomHold.delete(e.id);
    }

    const tier = Math.round(displayTier) as 1 | 2 | 3;
    const fieldAlpha = 0.12 + (tier - 1) * 0.06;
    const moteCount = tier === 1 ? 4 : tier === 2 ? 6 : 5;
    const mistDensity = tier === 1 ? 4 : tier === 2 ? 7 : 6;
    const runeRotation = (phase / RUNE_ROTATION_PERIOD) * Math.PI * 2;

    const sp = drawPos(e.pos.x, e.pos.y);
    drawGroundRuneCircle(strokePool, fillPool, sp.x, sp.y, radius, runeRotation, TEAL_SOFT, fieldAlpha);
    drawInwardMist(strokePool, sp.x, sp.y, radius, mistDensity, phase, e.id * 0.31, TEAL_FIELD, fieldAlpha * 1.8);
    drawFloatingMotes(fillPool, sp.x, sp.y, radius, moteCount, phase, e.id * 0.47, TEAL_FIELD, fieldAlpha * 2.2);

    if (pulsePhase === 'anticipation') {
      drawFeedingParticles(fillPool, drawPos, e.pos.x, e.pos.y, moteCount, phase, e.id, anticipationT);
    }

    drawOrbitingHalos(strokePool, drawPos, e.pos.x, e.pos.y, ringSpin, ringAlign, phase, crystalGlow);
    drawTieredCrystal(fillPool, strokePool, drawPos, e.pos.x, e.pos.y, crystalGlow, phase, tier);

    if (waveT > 0) {
      drawExpandingRing(strokePool, sp.x, sp.y, radius, waveT, lerpColor(TEAL_FIELD, WHITE_SOFT, 0.35), 2.5, 0.55);
      if (tier >= 2) {
        const lagT = Math.max(0, waveT - 0.12);
        if (lagT > 0) drawExpandingRing(strokePool, sp.x, sp.y, radius, lagT, TEAL_SOFT, 1.8, 0.35);
      }
      checkPulseHits(e, allies, waveT, radius);
    }

    trackBlessings(e, allies, state.tick);
  }

  drawBlessingRibbons(strokePool, fillPool, drawPos);
  drawPulseFlashes(strokePool, fillPool, drawPos);
  drawAttackTrails(strokePool, drawPos);
  drawAfterimages(strokePool, drawPos);
  drawBuffedUnits(state, registry, viewerId, nav, revealAll, drawPos, strokePool, phase);
}

/** Per-frame audio driver for visible Sanctuary Spires. */
export function tickSanctuarySpireAudio(
  audio: AudioManager,
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid | null,
  revealAll: boolean,
): void {
  let anyVisible = false;
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.defId !== 'sanctuary_spire') continue;
    if (!buildingHasPower(state, registry, e)) continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;
    anyVisible = true;

    const phase = sanctuaryPulsePhase(e.id, state.tick);
    const prev = lastAudioPhase.get(e.id);
    if (prev !== phase) {
      if (phase === 'bloom') audio.playSanctuaryPulse();
      lastAudioPhase.set(e.id, phase);
    }

    if (phase === 'anticipation') {
      const t = sanctuaryAnticipationProgress(e.id, state.tick);
      const bucket = Math.floor(t * 8);
      const lastBucket = lastAnticipationSample.get(e.id) ?? -1;
      if (bucket > lastBucket) {
        audio.playSanctuaryAnticipation(t);
        lastAnticipationSample.set(e.id, bucket);
      }
    } else {
      lastAnticipationSample.delete(e.id);
    }

    for (const b of blessingRibbons) {
      if (b.spireId === e.id && b.age === 1) audio.playSanctuaryBlessing();
    }
  }
  if (anyVisible) audio.tickSanctuaryIdle();
  else audio.stopSanctuaryIdle();
}

/** Reset presentation state (match teardown / preview reset). */
export function resetSanctuaryVfx(): void {
  blessingRibbons.length = 0;
  pulseFlashes.length = 0;
  attackTrails.length = 0;
  afterimageRings.length = 0;
  blessedUnits.clear();
  tierDisplay.clear();
  bloomHold.clear();
  bloomFlashFrames.clear();
  lastAudioPhase.clear();
  lastAnticipationSample.clear();
}
