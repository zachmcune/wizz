// Target acquisition, firing (instant or projectile), chasing, cooldowns. Buildings can fire too.
import { TICK_HZ } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, Entity, EntityId } from '../types';
import { entitiesSorted, isAlive, isEnemy } from '../queries';
import { buildingHasPower } from '../power';
import { len, distSq } from '../math';
import { applyDamage } from '../combat-util';
import { moveTowardGoal } from '../pathing';
import type { WeaponDef } from '../../data/defs';

const scratch: EntityId[] = [];

function weaponOf(ctx: StepContext, e: Entity): WeaponDef | null {
  if (e.kind === 'unit') return ctx.services.registry.units.get(e.defId)?.weapon ?? null;
  if (e.kind === 'building') return ctx.services.registry.buildings.get(e.defId)?.weapon ?? null;
  return null;
}

function sightOf(ctx: StepContext, e: Entity): number {
  if (e.kind === 'unit') return ctx.services.registry.units.get(e.defId)?.sight ?? 128;
  if (e.kind === 'building') return ctx.services.registry.buildings.get(e.defId)?.sight ?? 160;
  return 128;
}

function acquireTarget(state: GameState, ctx: StepContext, e: Entity, range: number): Entity | null {
  const ids = ctx.services.spatial.queryRadius(e.pos.x, e.pos.y, range, scratch);
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const id of ids) {
    const o = state.entities.get(id);
    if (!o || o.kind === 'resource_node' || o.kind === 'projectile' || !isAlive(o)) continue;
    if (!isEnemy(state, e.owner, o.owner)) continue;
    const d = distSq(e.pos.x, e.pos.y, o.pos.x, o.pos.y);
    if (d < bestD || (d === bestD && (best === null || o.id < best.id))) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function fire(state: GameState, ctx: StepContext, e: Entity, target: Entity, w: WeaponDef): void {
  e.cooldowns.attack = w.cooldownTicks;
  e.facing = Math.atan2(target.pos.y - e.pos.y, target.pos.x - e.pos.x);
  ctx.events.push({ type: 'attackFired', sourceId: e.id, x: e.pos.x, y: e.pos.y });
  if (w.projectile) {
    const pdef = ctx.services.registry.projectile(w.projectile);
    const id = state.nextEntityId++;
    const proj: Entity = {
      id,
      owner: e.owner,
      defId: w.projectile,
      kind: 'projectile',
      pos: { x: e.pos.x, y: e.pos.y },
      vel: { x: 0, y: 0 },
      facing: e.facing,
      hp: 1,
      maxHp: 1,
      radius: 3,
      orders: [],
      state: 'moving',
      stance: 'hold',
      cooldowns: {},
      buffs: [],
      projTargetId: target.id,
      projDamage: w.damage,
      projArmorVs: w.vs,
      projSpeed: pdef.speed,
      projSourceOwner: e.owner,
    };
    state.entities.set(id, proj);
  } else {
    applyDamage(state, ctx, target, w.damage, w.vs, e.id);
  }
}

export function combatSystem(state: GameState, ctx: StepContext): void {
  const dt = 1 / TICK_HZ;
  for (const e of entitiesSorted(state)) {
    if (!isAlive(e) || e.kind === 'projectile' || e.kind === 'resource_node') continue;
    if (e.kind === 'building' && !buildingHasPower(state, ctx.services.registry, e)) continue;
    if (e.cooldowns.attack && e.cooldowns.attack > 0) e.cooldowns.attack--;
    const w = weaponOf(ctx, e);
    if (!w) continue;
    if (e.kind === 'unit' && e.carryMax !== undefined) continue; // harvesters don't fight

    const order = e.orders[0];
    let target: Entity | null = null;

    if (order && order.type === 'attack') {
      target = state.entities.get(order.targetId) ?? null;
      if (!isAlive(target)) {
        e.orders.shift();
        target = null;
        if (e.state === 'attacking') e.state = 'idle';
      }
    }

    const canRoam = e.stance !== 'standground' && e.kind === 'unit';
    if (!target && (e.stance === 'aggressive' || (order && order.type === 'attackMove') || e.kind === 'building')) {
      target = acquireTarget(state, ctx, e, sightOf(ctx, e));
    }
    if (!target) continue;

    const d = len(target.pos.x - e.pos.x, target.pos.y - e.pos.y);
    const reach = w.range + e.radius + target.radius;
    if (d <= reach) {
      if ((e.cooldowns.attack ?? 0) <= 0) fire(state, ctx, e, target, w);
    } else if (order && order.type === 'attack' && e.kind === 'unit') {
      const udef = ctx.services.registry.unit(e.defId);
      moveTowardGoal(ctx.services.nav, ctx.services.flow, e, target.pos, udef.speed, dt);
    } else if (!order && canRoam && d <= sightOf(ctx, e)) {
      const udef = ctx.services.registry.unit(e.defId);
      moveTowardGoal(ctx.services.nav, ctx.services.flow, e, target.pos, udef.speed, dt);
    }
  }
}
