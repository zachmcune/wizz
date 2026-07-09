// Target acquisition, firing (instant or projectile), chasing, cooldowns. Buildings can fire too.
import { TICK_HZ } from '../../core/constants';
import type { StepContext } from '../context';
import type { UnitEntity, BuildingEntity } from '../entity-types';
import type { GameState, Entity, EntityId } from '../types';
import { entitiesSorted, isAlive, isEnemy, getPlayer } from '../queries';
import { buildingHasPower } from '../power';
import { isVisibleTo } from '../fog';
import { len, distSq } from '../math';
import { applyChainDamage, applyDamage, applyOnHitStatus, applySplashDamage } from '../combat-util';
import { moveTowardGoal, makePathContext } from '../pathing';
import type { WeaponDef } from '../../data/defs';
import { resolveWeaponStat } from '../modifiers';
import { makeProjectileCapability, hasHarvester, isChanneling, garrisonedInId } from '../capabilities';
import { makeProjectile } from '../factory';

const scratch: EntityId[] = [];

function weaponOf(ctx: StepContext, e: Entity): WeaponDef | null {
  if (e.kind === 'unit') return ctx.services.registry.units.get(e.defId)?.weapon ?? null;
  if (e.kind === 'building') return ctx.services.registry.buildings.get(e.defId)?.weapon ?? null;
  return null;
}

export function sightOf(ctx: StepContext, e: Entity): number {
  if (e.kind === 'unit') return ctx.services.registry.units.get(e.defId)?.sight ?? 128;
  if (e.kind === 'building') return ctx.services.registry.buildings.get(e.defId)?.sight ?? 160;
  return 128;
}

export function inWeaponBand(attacker: Entity, target: Entity, w: WeaponDef): boolean {
  const d = len(target.pos.x - attacker.pos.x, target.pos.y - attacker.pos.y);
  const maxReach = w.range + attacker.radius + target.radius;
  const minReach = (w.minRange ?? 0) + attacker.radius + target.radius;
  return d <= maxReach && d >= minReach;
}

function swarmScore(state: GameState, ctx: StepContext, owner: string, target: Entity, radius: number): number {
  let score = 0;
  const r2 = radius * radius;
  for (const o of entitiesSorted(state)) {
    if (o.kind === 'resource_node' || o.kind === 'projectile' || !isAlive(o)) continue;
    if (!isEnemy(state, owner, o.owner)) continue;
    if (!isVisibleTo(state, owner, o, ctx.services.nav)) continue;
    if (distSq(target.pos.x, target.pos.y, o.pos.x, o.pos.y) <= r2) score++;
  }
  return score;
}

export function acquireTarget(state: GameState, ctx: StepContext, e: Entity, range: number, weapon?: WeaponDef): Entity | null {
  const ids = ctx.services.spatial.queryRadius(e.pos.x, e.pos.y, range, scratch);
  let best: Entity | null = null;
  let bestD = Infinity;
  let bestSwarm = -1;
  for (const id of ids) {
    const o = state.entities.get(id);
    if (!o || o.kind === 'resource_node' || o.kind === 'projectile' || !isAlive(o)) continue;
    if (o.kind === 'unit' && garrisonedInId(o) !== undefined) continue;
    if (!isEnemy(state, e.owner, o.owner)) continue;
    if (!isVisibleTo(state, e.owner, o, ctx.services.nav)) continue;
    const d = distSq(e.pos.x, e.pos.y, o.pos.x, o.pos.y);
    if (weapon) {
      const minReach = (weapon.minRange ?? 0) + e.radius + o.radius;
      if (d < minReach * minReach) continue;
      if (e.kind === 'building' && !inWeaponBand(e, o, weapon)) continue;
    }
    const swarm = weapon?.preferSwarms ? swarmScore(state, ctx, e.owner, o, weapon.splashRadius ?? 48) : 0;
    if (
      swarm > bestSwarm ||
      (swarm === bestSwarm && d < bestD) ||
      (swarm === bestSwarm && d === bestD && (best === null || o.id < best.id))
    ) {
      bestD = d;
      bestSwarm = swarm;
      best = o;
    }
  }
  return best;
}

export function fire(state: GameState, ctx: StepContext, e: UnitEntity | BuildingEntity, target: Entity, w: WeaponDef): void {
  const player = getPlayer(state, e.owner)!;
  const cooldownTicks = resolveWeaponStat(ctx.services.registry, player, e, w, 'cooldownTicks', state.tick);
  e.cooldowns.attack = Math.max(1, Math.ceil(cooldownTicks));
  e.facing = Math.atan2(target.pos.y - e.pos.y, target.pos.x - e.pos.x);
  ctx.events.push({ type: 'attackFired', sourceId: e.id, x: e.pos.x, y: e.pos.y });
  if (w.projectile) {
    const pdef = ctx.services.registry.projectile(w.projectile);
    const proj = makeProjectile(
      state.nextEntityId++,
      e.owner,
      w.projectile,
      e.pos.x,
      e.pos.y,
      e.facing,
      makeProjectileCapability({
        targetId: target.id,
        damage: w.damage,
        armorVs: w.vs,
        speed: pdef.speed,
        sourceOwner: e.owner,
        sourceId: e.id,
        splashRadius: w.splashRadius,
        impactRadius: w.impactRadius,
        onHitStatus: w.onHitStatus,
      }),
    );
    state.entities.set(proj.id, proj);
  } else if (w.chain) {
    applyChainDamage(state, ctx, e.owner, target, w, e.id);
  } else if (w.splashRadius !== undefined || w.impactRadius !== undefined) {
    applySplashDamage(state, ctx, e.owner, target.pos.x, target.pos.y, w.splashRadius ?? w.impactRadius ?? 0, w.damage, w.vs, e.id, w.onHitStatus);
  } else {
    applyDamage(state, ctx, target, w.damage, w.vs, e.id);
    applyOnHitStatus(state, target, w.onHitStatus);
  }
}

export function combatSystem(state: GameState, ctx: StepContext): void {
  const dt = 1 / TICK_HZ;
  for (const e of entitiesSorted(state)) {
    if (!isAlive(e) || e.kind === 'projectile' || e.kind === 'resource_node') continue;
    if (e.kind === 'building' && !buildingHasPower(state, ctx.services.registry, e)) continue;
    if (e.kind === 'unit' && (e.state === 'garrisoned' || garrisonedInId(e) !== undefined)) continue;
    if (e.cooldowns.attack && e.cooldowns.attack > 0) e.cooldowns.attack--;
    const w = weaponOf(ctx, e);
    if (!w) continue;
    if (e.kind === 'building' && w.beam) continue; // continuous beams handled by beamWeaponSystem
    if (e.kind === 'unit' && hasHarvester(e)) continue; // harvesters don't fight
    if (e.kind === 'unit' && isChanneling(e)) continue;

    if (e.kind === 'building' && e.chargingAttack) {
      const target = state.entities.get(e.chargingAttack.targetId);
      if (!isAlive(target) || !isVisibleTo(state, e.owner, target, ctx.services.nav) || !inWeaponBand(e, target, w)) {
        e.chargingAttack = undefined;
      } else if (--e.chargingAttack.remainingTicks <= 0) {
        e.chargingAttack = undefined;
        fire(state, ctx, e, target, w);
      }
      continue;
    }

    const order = e.orders[0];
    let target: Entity | null = null;

    if (order && order.type === 'attack') {
      target = state.entities.get(order.targetId) ?? null;
      if (!isAlive(target) || (target.kind === 'unit' && garrisonedInId(target) !== undefined) || !isVisibleTo(state, e.owner, target, ctx.services.nav)) {
        e.orders.shift();
        target = null;
        if (e.state === 'attacking') e.state = 'idle';
      }
    }

    const canRoam = e.stance !== 'standground' && e.kind === 'unit';
    if (!target && (e.stance === 'aggressive' || (order && order.type === 'attackMove') || e.kind === 'building')) {
      target = acquireTarget(state, ctx, e, sightOf(ctx, e), w);
    }
    if (!target) continue;

    const d = len(target.pos.x - e.pos.x, target.pos.y - e.pos.y);
    const reach = w.range + e.radius + target.radius;
    const minReach = (w.minRange ?? 0) + e.radius + target.radius;
    if (d <= reach && d >= minReach) {
      if ((e.cooldowns.attack ?? 0) <= 0) {
        if (e.kind === 'building' && w.chargeTicks && w.chargeTicks > 0) {
          e.chargingAttack = { targetId: target.id, remainingTicks: w.chargeTicks };
          ctx.events.push({ type: 'attackCharging', sourceId: e.id, x: e.pos.x, y: e.pos.y });
        } else {
          fire(state, ctx, e, target, w);
        }
      }
    } else if (order && order.type === 'attack' && e.kind === 'unit') {
      const udef = ctx.services.registry.unit(e.defId);
      const pathCtx = makePathContext(ctx.services.nav, ctx.services.flow, state.relations, e.owner);
      moveTowardGoal(pathCtx, e, target.pos, udef.speed, dt);
    } else if (!order && canRoam && d <= sightOf(ctx, e)) {
      const udef = ctx.services.registry.unit(e.defId);
      const pathCtx = makePathContext(ctx.services.nav, ctx.services.flow, state.relations, e.owner);
      moveTowardGoal(pathCtx, e, target.pos, udef.speed, dt);
    }
  }
}
