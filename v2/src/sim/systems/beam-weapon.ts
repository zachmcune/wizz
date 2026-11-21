// Continuous beam weapons for towers (Inferno Beacon, Frost Spire).
//
// A beam tower tracks a target, rotates at a finite speed toward it, and damages everything inside
// the beam *cone* each `damageIntervalTicks`. Because the cone is a volume, a beam can hit several
// units — that is the whole point of these towers.
//
// Frost accumulates exposure and slows; flame applies a short lingering burn to anything that
// leaves the stream.

import { TICK_HZ, TILE } from '../../core/constants';
import type { BeamWeaponDef } from '../../data/defs';
import type { WeaponDef } from '../../data/defs';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { KIND_BUILDING, KIND_PROJECTILE, KIND_RESOURCE_NODE, KIND_UNIT } from '../entity-store';
import { applyDamage, applyOnHitStatus, isAirSlot, weaponHitsSlot } from '../combat-util';
import { buildingHasPower } from '../power';
import { garrisonedInId } from '../capabilities';
import {
  clearBeamWeapon,
  clearBurnLinger,
  getBeamWeapon,
  getFrostExposure,
  getBurnLinger,
  setBeamWeapon,
  setBurnLinger,
  setFrostExposure,
} from '../capabilities';
import { rotateToward } from '../../core/math';
import { acquireTarget, inWeaponBand, sightOfSlot, weaponOfSlot } from './combat';
import { isVisibleTo } from '../fog';

/** Is a point inside the beam cone from (ox,oy) with heading `facing`, widening with distance? */
export function isInBeamCone(
  ox: number,
  oy: number,
  facing: number,
  range: number,
  startWidth: number,
  endWidth: number,
  px: number,
  py: number,
  targetRadius: number,
): boolean {
  const dx = px - ox;
  const dy = py - oy;
  const dist = Math.hypot(dx, dy);
  if (dist > range + targetRadius) return false;
  if (dist < 1e-6) return true;
  // Angle between the beam heading and the target direction.
  const cos = (dx * Math.cos(facing) + dy * Math.sin(facing)) / dist;
  const clamped = cos > 1 ? 1 : cos < -1 ? -1 : cos;
  const angle = Math.acos(clamped);
  // Half-width of the cone at this distance, plus the target's own radius.
  const t = range > 0 ? Math.min(1, dist / range) : 1;
  const halfWidth = (startWidth + (endWidth - startWidth) * t) / 2;
  const maxAngle = Math.atan2(halfWidth + targetRadius, Math.max(dist, 1));
  return angle <= maxAngle;
}

function applyFrostExposureOn(state: GameState, slot: number, exposure: number, maxExposure: number): void {
  const t = Math.min(exposure, maxExposure) / maxExposure;
  const moveFactor = 1 - t * 0.8;
  const attackCooldownFactor = 1 + t;
  const durationTicks = Math.max(8, Math.ceil(12 + exposure * 2));
  applyOnHitStatus(state, slot, { kind: 'slow', durationTicks, moveFactor, attackCooldownFactor });
}

function collectBeamHits(
  state: GameState,
  ctx: StepContext,
  towerSlot: number,
  w: WeaponDef,
  beam: BeamWeaponDef,
  facing: number,
): number[] {
  const store = state.entities;
  const owner = store.ownerId(store.ownerIndex[towerSlot]!);
  const hits: number[] = [];
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    const kind = store.kind[slot]!;
    if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
    if (kind === KIND_UNIT && garrisonedInId(store.extras[slot]!) !== undefined) continue;
    if (state.relations[owner]?.[store.ownerId(store.ownerIndex[slot]!)] !== 'enemy') continue;
    if (!isVisibleTo(state, owner, slot, ctx.services.nav)) continue;
    if (!weaponHitsSlot(ctx.services.registry, store, w, slot)) continue;
    if (
      !isInBeamCone(
        store.posX[towerSlot]!,
        store.posY[towerSlot]!,
        facing,
        w.range,
        beam.startWidth,
        beam.endWidth,
        store.posX[slot]!,
        store.posY[slot]!,
        store.radius[slot]!,
      )
    ) {
      continue;
    }
    hits.push(slot);
  }
  return hits;
}

export function beamWeaponSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;
  const dt = 1 / TICK_HZ;

  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    const w = weaponOfSlot(registry, store, slot);
    const beam = w?.beam;
    if (!w || !beam) continue;
    const ex = store.extras[slot]!;
    if (!buildingHasPower(state, registry, slot)) {
      if (getBeamWeapon(ex)) {
        clearBeamWeapon(ex);
        ctx.events.push({ type: 'beamStopped', sourceId: store.id[slot]!, x: store.posX[slot]!, y: store.posY[slot]! });
      }
      continue;
    }

    const targetSlot = acquireTarget(state, ctx, slot, sightOfSlot(registry, store, slot), w);
    const owner = store.ownerId(store.ownerIndex[slot]!);
    const valid =
      targetSlot >= 0 &&
      inWeaponBand(state, ctx, slot, targetSlot, w, true) &&
      isVisibleTo(state, owner, targetSlot, ctx.services.nav);

    if (!valid) {
      if (getBeamWeapon(ex)) {
        clearBeamWeapon(ex);
        ctx.events.push({ type: 'beamStopped', sourceId: store.id[slot]!, x: store.posX[slot]!, y: store.posY[slot]! });
      }
      continue;
    }

    let beamState = getBeamWeapon(ex);
    if (!beamState) {
      const facing = Math.atan2(
        store.posY[targetSlot]! - store.posY[slot]!,
        store.posX[targetSlot]! - store.posX[slot]!,
      );
      beamState = {
        targetId: store.id[targetSlot]!,
        facing,
        ticksSinceDamage: beam.damageIntervalTicks,
        wobblePhase: (store.id[slot]! % 97) * 0.11,
        lastHitIds: [],
      };
      setBeamWeapon(ex, beamState);
      store.facing[slot] = facing;
      ctx.events.push({ type: 'beamStarted', sourceId: store.id[slot]!, x: store.posX[slot]!, y: store.posY[slot]! });
    }

    const aim = Math.atan2(
      store.posY[targetSlot]! - store.posY[slot]!,
      store.posX[targetSlot]! - store.posX[slot]!,
    );
    beamState.facing = rotateToward(beamState.facing, aim, beam.rotationSpeed * dt);
    beamState.targetId = store.id[targetSlot]!;
    beamState.wobblePhase += dt * 3.7;
    store.facing[slot] = beamState.facing;

    beamState.ticksSinceDamage++;
    if (beamState.ticksSinceDamage < beam.damageIntervalTicks) continue;
    beamState.ticksSinceDamage = 0;

    const hits = collectBeamHits(state, ctx, slot, w, beam, beamState.facing);
    const hitSet = new Set(hits);
    const maxExposure = beam.maxFrostExposure ?? 20;
    const lingerTicks = beam.lingerTicks ?? 6;
    const lingerFactor = beam.lingerDamageFactor ?? 0.3;

    for (const hitSlot of hits) {
      if (w.damage > 0) applyDamage(state, ctx, hitSlot, w.damage, w.vs, store.id[slot]!);
      clearBurnLinger(store.extras[hitSlot]!);
      if (beam.kind === 'frost') {
        const exposure = Math.min(maxExposure, getFrostExposure(store.extras[hitSlot]!) + 1);
        setFrostExposure(store.extras[hitSlot]!, exposure);
        applyFrostExposureOn(state, hitSlot, exposure, maxExposure);
      }
    }

    if (beam.kind === 'flame') {
      // Anything that was in the beam last tick but is not now starts burning.
      for (const prevId of beamState.lastHitIds) {
        if (hitSet.has(store.slotOf(prevId))) continue;
        const prevSlot = store.slotOf(prevId);
        if (prevSlot < 0 || store.dead[prevSlot]) continue;
        const kind = store.kind[prevSlot]!;
        if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
        if (getBurnLinger(store.extras[prevSlot]!)) continue;
        setBurnLinger(store.extras[prevSlot]!, {
          remaining: lingerTicks,
          damagePerTick: w.damage * lingerFactor,
          vs: w.vs,
          sourceId: store.id[slot]!,
        });
      }
    }

    beamState.lastHitIds = hits.map((s) => store.id[s]!).sort((a, b) => a - b);
  }

  // Burn ticks and frost decay run once, after every tower has acted.
  processBurnLinger(state, ctx);
  decayFrostExposure(state);
}

function processBurnLinger(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    const kind = store.kind[slot]!;
    if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
    const burn = getBurnLinger(store.extras[slot]!);
    if (!burn) continue;
    if (burn.damagePerTick > 0) {
      applyDamage(state, ctx, slot, burn.damagePerTick, burn.vs, burn.sourceId);
    }
    burn.remaining--;
    if (burn.remaining <= 0) clearBurnLinger(store.extras[slot]!);
  }
}

function decayFrostExposure(state: GameState): void {
  const store = state.entities;
  const inBeam = new Set<number>();
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    const beamState = getBeamWeapon(store.extras[slot]!);
    if (!beamState) continue;
    for (const id of beamState.lastHitIds) inBeam.add(id);
  }
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    const kind = store.kind[slot]!;
    if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
    const exposure = getFrostExposure(store.extras[slot]!);
    if (exposure <= 0) continue;
    if (inBeam.has(store.id[slot]!)) continue;
    const next = exposure - 1;
    setFrostExposure(store.extras[slot]!, next);
    if (next > 0) applyFrostExposureOn(state, slot, next, 20);
  }
}

export { isAirSlot, TILE };
