// Continuous beam weapons for towers (Inferno Beacon, Frost Spire). Shared targeting, rotation, and damage.
import { TICK_HZ } from '../../core/constants';
import type { ArmorClass, BeamWeaponDef, WeaponDef } from '../../data/defs';
import type { StepContext } from '../context';
import type { BuildingEntity, UnitEntity } from '../entity-types';
import type { GameState, Entity, EntityId } from '../types';
import { applyDamage, applyOnHitStatus } from '../combat-util';
import { isVisibleTo } from '../fog';
import { buildingHasPower } from '../power';
import { entitiesSorted, isAlive, isEnemy } from '../queries';
import { isInBeamCone, rotateToward } from '../beam-util';
import { acquireTarget, inWeaponBand, sightOf } from './combat';

function weaponOf(ctx: StepContext, e: BuildingEntity): WeaponDef | null {
  return ctx.services.registry.buildings.get(e.defId)?.weapon ?? null;
}

function isBeamTarget(e: Entity): e is UnitEntity | BuildingEntity {
  return e.kind === 'unit' || e.kind === 'building';
}

function applyFrostExposure(state: GameState, target: UnitEntity | BuildingEntity, exposure: number, maxExposure: number): void {
  const t = Math.min(exposure, maxExposure) / maxExposure;
  const moveFactor = 1 - t * 0.8;
  const attackCooldownFactor = 1 + t * 1;
  const durationTicks = Math.max(8, Math.ceil(12 + exposure * 2));
  applyOnHitStatus(state, target, {
    kind: 'slow',
    durationTicks,
    moveFactor,
    attackCooldownFactor,
  });
}

function decayFrostExposure(state: GameState, target: UnitEntity | BuildingEntity): void {
  const exposure = target.frostExposure ?? 0;
  if (exposure <= 0) return;
  const next = exposure - 1;
  target.frostExposure = next > 0 ? next : undefined;
  if (next > 0) applyFrostExposure(state, target, next, 20);
}

function collectBeamHits(
  state: GameState,
  ctx: StepContext,
  tower: BuildingEntity,
  w: WeaponDef,
  beam: BeamWeaponDef,
): Entity[] {
  const hits: Entity[] = [];
  const facing = tower.beamAttack!.facing;
  for (const target of entitiesSorted(state)) {
    if (target.kind === 'resource_node' || target.kind === 'projectile' || !isAlive(target)) continue;
    if (target.kind === 'unit' && target.garrisonedIn !== undefined) continue;
    if (!isEnemy(state, tower.owner, target.owner)) continue;
    if (!isVisibleTo(state, tower.owner, target, ctx.services.nav)) continue;
    if (
      !isInBeamCone(
        tower.pos.x,
        tower.pos.y,
        facing,
        w.range,
        beam.startWidth,
        beam.endWidth,
        target.pos.x,
        target.pos.y,
        target.radius,
      )
    ) {
      continue;
    }
    hits.push(target);
  }
  return hits;
}

function applyBeamDamage(
  state: GameState,
  ctx: StepContext,
  tower: BuildingEntity,
  w: WeaponDef,
  beam: BeamWeaponDef,
): void {
  const hits = collectBeamHits(state, ctx, tower, w, beam);
  const hitIds = new Set(hits.map((h) => h.id));
  const maxExposure = beam.maxFrostExposure ?? 20;
  const lingerTicks = beam.lingerTicks ?? 6;
  const lingerFactor = beam.lingerDamageFactor ?? 0.3;

  for (const target of hits) {
    if (!isBeamTarget(target)) continue;
    if (w.damage > 0) applyDamage(state, ctx, target, w.damage, w.vs, tower.id);
    target.burnLinger = undefined;

    if (beam.kind === 'frost') {
      const exposure = Math.min(maxExposure, (target.frostExposure ?? 0) + 1);
      target.frostExposure = exposure;
      applyFrostExposure(state, target, exposure, maxExposure);
    }
  }

  if (beam.kind === 'flame') {
    const prev = tower.beamAttack!.lastHitIds;
    for (const id of prev) {
      if (hitIds.has(id)) continue;
      const target = state.entities.get(id);
      if (!target || !isBeamTarget(target) || !isAlive(target)) continue;
      if (target.burnLinger) continue;
      target.burnLinger = {
        remaining: lingerTicks,
        damagePerTick: w.damage * lingerFactor,
        vs: w.vs as Record<string, number>,
        sourceId: tower.id,
      };
    }
  } else {
    for (const target of entitiesSorted(state)) {
      if (!isBeamTarget(target) || !isAlive(target)) continue;
      if (target.kind === 'unit' && target.garrisonedIn !== undefined) continue;
      if (!isEnemy(state, tower.owner, target.owner)) continue;
      if (hitIds.has(target.id)) continue;
      decayFrostExposure(state, target);
    }
  }

  tower.beamAttack!.lastHitIds = [...hitIds].sort((a, b) => a - b);
}

function processBurnLinger(state: GameState, ctx: StepContext): void {
  for (const e of entitiesSorted(state)) {
    if (!isBeamTarget(e) || !isAlive(e)) continue;
    const burn = e.burnLinger;
    if (!burn) continue;
    if (burn.damagePerTick > 0) {
      applyDamage(state, ctx, e, burn.damagePerTick, burn.vs as Record<ArmorClass, number>, burn.sourceId);
    }
    burn.remaining--;
    if (burn.remaining <= 0) e.burnLinger = undefined;
  }
}

function stopBeam(tower: BuildingEntity, ctx: StepContext): void {
  if (tower.beamAttack) {
    tower.beamAttack = undefined;
    ctx.events.push({ type: 'beamStopped', sourceId: tower.id, x: tower.pos.x, y: tower.pos.y });
  }
}

function startBeam(tower: BuildingEntity, target: Entity, ctx: StepContext, beam: BeamWeaponDef): void {
  const facing = Math.atan2(target.pos.y - tower.pos.y, target.pos.x - tower.pos.x);
  tower.beamAttack = {
    targetId: target.id,
    facing,
    ticksSinceDamage: beam.damageIntervalTicks,
    wobblePhase: (tower.id % 97) * 0.11,
    lastHitIds: [],
  };
  tower.facing = facing;
  ctx.events.push({ type: 'beamStarted', sourceId: tower.id, x: tower.pos.x, y: tower.pos.y });
}

export function beamWeaponSystem(state: GameState, ctx: StepContext): void {
  const dt = 1 / TICK_HZ;

  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'building' || !isAlive(e)) continue;
    const w = weaponOf(ctx, e);
    if (!w?.beam) continue;
    const beam = w.beam;
    if (!buildingHasPower(state, ctx.services.registry, e)) {
      stopBeam(e, ctx);
      continue;
    }

    const target = acquireTarget(state, ctx, e, sightOf(ctx, e), w);
    if (!target || !inWeaponBand(e, target, w) || !isVisibleTo(state, e.owner, target, ctx.services.nav)) {
      stopBeam(e, ctx);
      continue;
    }

    if (!e.beamAttack) startBeam(e, target, ctx, beam);

    const aim = Math.atan2(target.pos.y - e.pos.y, target.pos.x - e.pos.x);
    const maxTurn = beam.rotationSpeed * dt;
    e.beamAttack!.facing = rotateToward(e.beamAttack!.facing, aim, maxTurn);
    e.beamAttack!.targetId = target.id;
    e.beamAttack!.wobblePhase += dt * 3.7;
    e.facing = e.beamAttack!.facing;

    e.beamAttack!.ticksSinceDamage++;
    if (e.beamAttack!.ticksSinceDamage >= beam.damageIntervalTicks) {
      e.beamAttack!.ticksSinceDamage = 0;
      applyBeamDamage(state, ctx, e, w, beam);
    }
  }

  processBurnLinger(state, ctx);
  decayFrostExposureGlobal(state);
}

function decayFrostExposureGlobal(state: GameState): void {
  const inFrost = new Set<EntityId>();
  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'building' || !e.beamAttack) continue;
    for (const id of e.beamAttack.lastHitIds) inFrost.add(id);
  }
  for (const e of entitiesSorted(state)) {
    if (!isBeamTarget(e) || !isAlive(e)) continue;
    if (!e.frostExposure || inFrost.has(e.id)) continue;
    decayFrostExposure(state, e);
  }
}
