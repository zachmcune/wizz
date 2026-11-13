// Target acquisition, firing (instant, projectile or chain), chasing, turret arcs, charge-up.
//
// Targeting order matters and is deterministic: prefer-swarm weapons rank by how many enemies are
// clumped around a candidate, then by distance, then by entity id. Everything else ranks by distance
// then id.

import type { Registry } from '../../data/registry';
import type { WeaponDef } from '../../data/defs';
import { HIGH_GROUND_RANGE_BONUS, TICK_HZ, TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, EntityId } from '../types';
import {
  EntityStore,
  KIND_BUILDING,
  KIND_PROJECTILE,
  KIND_RESOURCE_NODE,
  KIND_UNIT,
  STATE_ATTACKING,
  STATE_GARRISONED,
  STATE_IDLE,
  STANCE_AGGRESSIVE,
} from '../entity-store';
import { distSq, len, rotateToward, angleDelta } from '../../core/math';
import {
  applyChainDamage,
  applyDamage,
  applyOnHitStatus,
  applySplashDamage,
  isAirSlot,
  weaponHitsSlot,
} from '../combat-util';
import { buildingHasPower } from '../power';
import { isVisibleTo } from '../fog';
import { makePathContext, moveTowardGoal } from '../pathing';
import { resolveUnitStat, resolveWeaponStat } from '../modifiers';
import { getPlayer } from '../queries';
import {
  ensureTurret,
  garrisonedInId,
  getBuildingCap,
  getHarvester,
  isChanneling,
  setProjectile,
} from '../capabilities';

const scratch: number[] = [];

export function weaponOfSlot(registry: Registry, store: EntityStore, slot: number): WeaponDef | null {
  const ex = store.extras[slot]!;
  if (store.kind[slot] === KIND_UNIT) return registry.units.get(ex.defId)?.weapon ?? null;
  if (store.kind[slot] === KIND_BUILDING) return registry.buildings.get(ex.defId)?.weapon ?? null;
  return null;
}

export function sightOfSlot(registry: Registry, store: EntityStore, slot: number): number {
  const ex = store.extras[slot]!;
  if (store.kind[slot] === KIND_UNIT) return registry.units.get(ex.defId)?.sight ?? 128;
  if (store.kind[slot] === KIND_BUILDING) return registry.buildings.get(ex.defId)?.sight ?? 160;
  return 128;
}

/** Extra range when the attacker is on higher ground than the target. */
export function highGroundRangeBonus(
  state: GameState,
  ctx: StepContext,
  attackerSlot: number,
  targetSlot: number,
): number {
  const store = state.entities;
  const ah = ctx.services.nav.heightAtWorld(store.posX[attackerSlot]!, store.posY[attackerSlot]!);
  const th = ctx.services.nav.heightAtWorld(store.posX[targetSlot]!, store.posY[targetSlot]!);
  return ah > th ? HIGH_GROUND_RANGE_BONUS : 0;
}

/**
 * Ground fire cannot shoot up a cliff. Ramps and equal/lower heights are allowed, and flyers ignore
 * the rule entirely. This is the rule that makes high ground matter.
 */
export function heightBlocksGroundFire(
  state: GameState,
  ctx: StepContext,
  attackerSlot: number,
  targetSlot: number,
  flyingAttacker: boolean,
): boolean {
  if (flyingAttacker) return false;
  const store = state.entities;
  const nav = ctx.services.nav;
  const ax = store.posX[attackerSlot]!;
  const ay = store.posY[attackerSlot]!;
  const tx = store.posX[targetSlot]!;
  const ty = store.posY[targetSlot]!;
  const ah = nav.heightAtWorld(ax, ay);
  const th = nav.heightAtWorld(tx, ty);
  if (th <= ah) return false;
  if (nav.isRamp(Math.floor(ax / TILE), Math.floor(ay / TILE))) return false;
  if (nav.isRamp(Math.floor(tx / TILE), Math.floor(ty / TILE))) return false;
  return true;
}

/** Is the target inside [minRange, range] including both radii, with the high-ground bonus? */
export function inWeaponBand(
  state: GameState,
  ctx: StepContext,
  attackerSlot: number,
  targetSlot: number,
  w: WeaponDef,
  applyHighGround: boolean,
): boolean {
  const store = state.entities;
  const d = len(store.posX[targetSlot]! - store.posX[attackerSlot]!, store.posY[targetSlot]! - store.posY[attackerSlot]!);
  const bonus = applyHighGround ? highGroundRangeBonus(state, ctx, attackerSlot, targetSlot) : 0;
  const range = w.range + bonus;
  const maxReach = range + store.radius[attackerSlot]! + store.radius[targetSlot]!;
  const minReach = (w.minRange ?? 0) + store.radius[attackerSlot]! + store.radius[targetSlot]!;
  return d <= maxReach && d >= minReach;
}

function isEnemyOwner(state: GameState, a: string, b: string): boolean {
  return state.relations[a]?.[b] === 'enemy';
}

/** Count visible enemies within `radius` of a target, for prefer-swarms weapons. */
function swarmScore(
  state: GameState,
  ctx: StepContext,
  owner: string,
  targetSlot: number,
  radius: number,
): number {
  const store = state.entities;
  const r2 = radius * radius;
  const tx = store.posX[targetSlot]!;
  const ty = store.posY[targetSlot]!;
  let score = 0;
  const ids = ctx.services.spatial.queryRadius(tx, ty, radius, scratch);
  for (const slot of ids) {
    if (store.dead[slot]) continue;
    const kind = store.kind[slot]!;
    if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
    if (!isEnemyOwner(state, owner, store.ownerId(store.ownerIndex[slot]!))) continue;
    if (!isVisibleTo(state, owner, slot, ctx.services.nav)) continue;
    if (distSq(tx, ty, store.posX[slot]!, store.posY[slot]!) > r2) continue;
    score++;
  }
  return score;
}

/**
 * Choose a target within `range` of the attacker. Returns a slot index, or -1.
 * Deterministic: ties break on distance then ascending entity id.
 */
export function acquireTarget(
  state: GameState,
  ctx: StepContext,
  attackerSlot: number,
  range: number,
  weapon: WeaponDef | null,
): number {
  const store = state.entities;
  const owner = store.ownerId(store.ownerIndex[attackerSlot]!);
  const ids = ctx.services.spatial.queryRadius(
    store.posX[attackerSlot]!,
    store.posY[attackerSlot]!,
    range + 64,
    scratch,
  );
  let best = -1;
  let bestD = Infinity;
  let bestSwarm = -1;
  let bestId = Infinity;
  const flyingAttacker = isAirSlot(ctx.services.registry, store, attackerSlot);

  for (const slot of ids) {
    if (store.dead[slot]) continue;
    const kind = store.kind[slot]!;
    if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
    if (kind === KIND_UNIT && garrisonedInId(store.extras[slot]!) !== undefined) continue;
    if (!isEnemyOwner(state, owner, store.ownerId(store.ownerIndex[slot]!))) continue;
    if (!isVisibleTo(state, owner, slot, ctx.services.nav)) continue;
    if (weapon && !weaponHitsSlot(ctx.services.registry, store, weapon, slot)) continue;
    if (heightBlocksGroundFire(state, ctx, attackerSlot, slot, flyingAttacker)) continue;

    const d = distSq(store.posX[attackerSlot]!, store.posY[attackerSlot]!, store.posX[slot]!, store.posY[slot]!);
    if (weapon) {
      const minReach = (weapon.minRange ?? 0) + store.radius[attackerSlot]! + store.radius[slot]!;
      if (d < minReach * minReach) continue;
      // Buildings must be able to actually reach the target; units may chase.
      if (kind === KIND_BUILDING && !inWeaponBand(state, ctx, attackerSlot, slot, weapon, true)) continue;
    }

    const swarm = weapon?.preferSwarms ? swarmScore(state, ctx, owner, slot, weapon.splashRadius ?? 48) : 0;
    const id = store.id[slot]!;
    const better =
      swarm > bestSwarm ||
      (swarm === bestSwarm && d < bestD) ||
      (swarm === bestSwarm && d === bestD && id < bestId);
    if (better) {
      bestD = d;
      bestSwarm = swarm;
      bestId = id;
      best = slot;
    }
  }
  return best;
}

/** Fire one shot from `attackerSlot` at `targetSlot`. Handles projectile / chain / splash / direct. */
export function fire(
  state: GameState,
  ctx: StepContext,
  attackerSlot: number,
  targetSlot: number,
  w: WeaponDef,
  opts?: { crystalIndex?: number },
): void {
  const store = state.entities;
  const owner = store.ownerId(store.ownerIndex[attackerSlot]!);
  const player = getPlayer(state, owner);
  if (!player) return;

  const cooldown = resolveWeaponStat(state, ctx.services.registry, player, attackerSlot, w, 'cooldownTicks');
  store.extras[attackerSlot]!.cooldowns.attack = Math.max(1, Math.ceil(cooldown));

  const tx = store.posX[targetSlot]!;
  const ty = store.posY[targetSlot]!;
  const ax = store.posX[attackerSlot]!;
  const ay = store.posY[attackerSlot]!;
  if (!w.turret) {
    store.facing[attackerSlot] = Math.atan2(ty - ay, tx - ax);
  }

  ctx.events.push({
    type: 'attackFired',
    sourceId: store.id[attackerSlot]!,
    x: ax,
    y: ay,
    ...(opts?.crystalIndex !== undefined ? { crystalIndex: opts.crystalIndex } : {}),
  });

  const damage = resolveWeaponStat(state, ctx.services.registry, player, attackerSlot, w, 'damage');

  if (w.projectile) {
    const pdef = ctx.services.registry.projectile(w.projectile);
    const id = state.nextEntityId++;
    const slot = store.spawnProjectile(id, store.ownerIndex[attackerSlot]!, w.projectile, -1, ax, ay, store.facing[attackerSlot]!);
    setProjectile(store.extras[slot]!, {
      targetId: store.id[targetSlot]!,
      damage,
      armorVs: w.vs,
      speed: pdef.speed,
      sourceOwner: owner,
      sourceId: store.id[attackerSlot]!,
      ...(w.splashRadius !== undefined ? { splashRadius: w.splashRadius } : {}),
      ...(w.impactRadius !== undefined ? { impactRadius: w.impactRadius } : {}),
      ...(w.onHitStatus !== undefined ? { onHitStatus: w.onHitStatus } : {}),
      ...(w.targetsAir !== undefined ? { targetsAir: w.targetsAir } : {}),
      ...(w.targetsGround !== undefined ? { targetsGround: w.targetsGround } : {}),
    });
    return;
  }

  if (w.chain) {
    applyChainDamage(state, ctx, owner, targetSlot, { ...w, damage }, store.id[attackerSlot]!);
    return;
  }

  if (w.splashRadius !== undefined || w.impactRadius !== undefined) {
    const radius = w.splashRadius ?? w.impactRadius ?? 0;
    applySplashDamage(
      state,
      ctx,
      owner,
      tx,
      ty,
      radius,
      damage,
      w.vs,
      store.id[attackerSlot]!,
      w.onHitStatus,
      { targetsAir: w.targetsAir, targetsGround: w.targetsGround },
    );
    if (w.impactRadius !== undefined) {
      ctx.events.push({ type: 'artilleryImpact', x: tx, y: ty, radius: w.impactRadius, sourceId: store.id[attackerSlot]! });
    }
    return;
  }

  applyDamage(state, ctx, targetSlot, damage, w.vs, store.id[attackerSlot]!);
  applyOnHitStatus(state, targetSlot, w.onHitStatus);
}

function updateTurretFacing(store: EntityStore, slot: number, w: WeaponDef, aim: number | null, dt: number): void {
  const turret = w.turret!;
  const turretState = ensureTurret(store.extras[slot]!);
  const maxStep = turret.rotationSpeed * dt;

  if (aim !== null) {
    const prevFacing = store.facing[slot]!;
    const nextFacing = rotateToward(prevFacing, aim, maxStep);
    turretState.angularVelocity = dt > 0 ? (nextFacing - prevFacing) / dt : 0;
    store.facing[slot] = nextFacing;
    turretState.hadTarget = true;
    return;
  }

  if (Math.abs(turretState.angularVelocity) > 0.001) {
    const decay = Math.pow(0.15, dt);
    turretState.angularVelocity *= decay;
    if (Math.abs(turretState.angularVelocity) < 0.05) turretState.angularVelocity = 0;
    store.facing[slot] = store.facing[slot]! + turretState.angularVelocity * dt;
  }
  turretState.hadTarget = false;
}

function canTurretFire(store: EntityStore, slot: number, w: WeaponDef, aim: number): boolean {
  return Math.abs(angleDelta(store.facing[slot]!, aim)) <= w.turret!.fireArcRadians;
}

export function combatSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;
  const dt = 1 / TICK_HZ;

  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    const kind = store.kind[slot]!;
    if (kind === KIND_PROJECTILE || kind === KIND_RESOURCE_NODE) continue;
    if (kind === KIND_BUILDING && !buildingHasPower(state, registry, slot)) continue;
    const ex = store.extras[slot]!;
    if (kind === KIND_UNIT) {
      if (garrisonedInId(ex) !== undefined || store.state[slot] === STATE_GARRISONED) continue;
      if (isChanneling(ex)) continue;
      // Harvesters (and wagons) do not fight.
      const udef = registry.units.get(ex.defId);
      if (!udef?.weapon) continue;
      if (getHarvester(ex) || udef.deploysAs) continue;
    }

    if (ex.cooldowns.attack && ex.cooldowns.attack > 0) ex.cooldowns.attack--;

    const w = weaponOfSlot(registry, store, slot);
    if (!w) continue;
    // Continuous beams are owned by beamWeaponSystem.
    if (kind === KIND_BUILDING && w.beam) continue;

    const bcap = kind === KIND_BUILDING ? getBuildingCap(ex) : undefined;
    if (bcap?.chargingAttack) {
      const targetSlot = store.slotOf(bcap.chargingAttack.targetId);
      const valid =
        targetSlot >= 0 &&
        !store.dead[targetSlot] &&
        isVisibleTo(state, store.ownerId(store.ownerIndex[slot]!), targetSlot, ctx.services.nav) &&
        !heightBlocksGroundFire(state, ctx, slot, targetSlot, isAirSlot(registry, store, slot)) &&
        inWeaponBand(state, ctx, slot, targetSlot, w, true);
      if (!valid) {
        bcap.chargingAttack = undefined;
      } else if (--bcap.chargingAttack.remainingTicks <= 0) {
        bcap.chargingAttack = undefined;
        fire(state, ctx, slot, targetSlot, w);
      }
      continue;
    }

    const owner = store.ownerId(store.ownerIndex[slot]!);
    const order = ex.orders[0] as { type: string; targetId?: EntityId; x?: number; y?: number } | undefined;
    let targetSlot = -1;

    // An explicit attack order supplies the target, and drops it if the target dies or vanishes.
    if (order && order.type === 'attack' && order.targetId !== undefined) {
      const candidate = store.slotOf(order.targetId);
      const stillValid =
        candidate >= 0 &&
        !store.dead[candidate] &&
        !(store.kind[candidate] === KIND_UNIT && garrisonedInId(store.extras[candidate]!) !== undefined) &&
        isVisibleTo(state, owner, candidate, ctx.services.nav);
      if (stillValid) targetSlot = candidate;
      else {
        ex.orders.shift();
        if (store.state[slot] === STATE_ATTACKING) store.state[slot] = STATE_IDLE;
      }
    }

    const stance = store.stance[slot]!;
    if (targetSlot < 0 && (stance === STANCE_AGGRESSIVE || order?.type === 'attackMove' || kind === KIND_BUILDING)) {
      targetSlot = acquireTarget(state, ctx, slot, sightOfSlot(registry, store, slot), w);
    }

    if (kind === KIND_BUILDING && w.turret) {
      const aim =
        targetSlot >= 0 && isVisibleTo(state, owner, targetSlot, ctx.services.nav)
          ? Math.atan2(store.posY[targetSlot]! - store.posY[slot]!, store.posX[targetSlot]! - store.posX[slot]!)
          : null;
      updateTurretFacing(store, slot, w, aim, dt);
    }

    if (targetSlot < 0) continue;

    // Ground fire cannot cross a cliff; a unit ordered to attack will walk to a legal angle.
    if (heightBlocksGroundFire(state, ctx, slot, targetSlot, isAirSlot(registry, store, slot))) {
      if (order?.type === 'attack' && kind === KIND_UNIT) {
        chase(state, ctx, slot, targetSlot);
      }
      continue;
    }

    if (inWeaponBand(state, ctx, slot, targetSlot, w, true)) {
      if (!weaponHitsSlot(registry, store, w, targetSlot)) continue;
      const aim = Math.atan2(
        store.posY[targetSlot]! - store.posY[slot]!,
        store.posX[targetSlot]! - store.posX[slot]!,
      );
      const turretReady = !w.turret || (kind === KIND_BUILDING && canTurretFire(store, slot, w, aim));
      if ((ex.cooldowns.attack ?? 0) > 0 || !turretReady) continue;

      if (kind === KIND_BUILDING && w.chargeTicks && w.chargeTicks > 0) {
        const bcapNow = getBuildingCap(ex) ?? {};
        bcapNow.chargingAttack = { targetId: store.id[targetSlot]!, remainingTicks: w.chargeTicks };
        ex.caps.building = bcapNow;
        ctx.events.push({ type: 'attackCharging', sourceId: store.id[slot]!, x: store.posX[slot]!, y: store.posY[slot]! });
      } else if (kind === KIND_BUILDING && w.turret) {
        const turret = ensureTurret(ex);
        const crystalIndex = turret.crystalIndex;
        turret.crystalIndex = (crystalIndex + 1) % 3;
        fire(state, ctx, slot, targetSlot, w, { crystalIndex });
      } else {
        fire(state, ctx, slot, targetSlot, w);
      }
      continue;
    }

    // Out of range: an explicit attack order chases; aggressive auto-acquire does not (units would
    // otherwise run across the map chasing a scout they glimpsed).
    if (order?.type === 'attack' && kind === KIND_UNIT) {
      chase(state, ctx, slot, targetSlot);
    }
  }

  // Expire stale buffs once per tick, in a single pass.
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    const buffs = store.extras[slot]!.buffs;
    if (!buffs.length) continue;
    let write = 0;
    for (let read = 0; read < buffs.length; read++) {
      const b = buffs[read]!;
      if (b.expiresTick > state.tick) buffs[write++] = b;
    }
    buffs.length = write;
  }

}

function chase(state: GameState, ctx: StepContext, slot: number, targetSlot: number): void {
  const store = state.entities;
  const owner = store.ownerId(store.ownerIndex[slot]!);
  const ex = store.extras[slot]!;
  const udef = ctx.services.registry.units.get(ex.defId);
  const player = getPlayer(state, owner);
  if (!udef || !player) return;
  const speed = resolveUnitStat(state, ctx.services.registry, player, udef, 'speed', slot);
  const flying = isAirSlot(ctx.services.registry, store, slot);
  const pathCtx = makePathContext(ctx.services.nav, ctx.services.flow, state.relations, owner, flying);
  const res = moveTowardGoal(
    store.posX[slot]!,
    store.posY[slot]!,
    pathCtx,
    { x: store.posX[targetSlot]!, y: store.posY[targetSlot]! },
    speed,
    1 / TICK_HZ,
    store.radius[slot]!,
  );
  if (res.result.moved) {
    store.posX[slot] = res.result.x;
    store.posY[slot] = res.result.y;
    if (res.result.facing !== 0) store.facing[slot] = res.result.facing;
  }
}

export { isEnemyOwner };
