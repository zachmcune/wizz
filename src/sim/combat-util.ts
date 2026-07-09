// Shared damage application. Respects armor-class multipliers and the Aegis buff.
import type { StepContext } from './context';
import type { GameState, Entity, EntityId, GameplayBuff, PlayerId } from './types';
import type { ArmorClass, WeaponDef } from '../data/defs';
import { garrisonedInId } from './capabilities';
import { distSq } from './math';
import { entitiesSorted, hasBuff, isAlive, isEnemy } from './queries';

export function armorClassOf(ctx: StepContext, e: Entity): ArmorClass {
  if (e.kind === 'building') return 'building';
  const u = ctx.services.registry.units.get(e.defId);
  return u?.armor ?? 'light';
}

export function applyDamage(
  state: GameState,
  ctx: StepContext,
  target: Entity,
  baseAmount: number,
  vs: Record<ArmorClass, number>,
  killerId?: EntityId,
): void {
  if (target.kind === 'resource_node' || target.kind === 'projectile' || target.state === 'dead') return;
  if (target.kind === 'unit' && garrisonedInId(target) !== undefined) return;
  if (hasBuff(target, 'aegis', state.tick)) return; // Aegis = temporary invulnerability
  const cls = armorClassOf(ctx, target);
  const mult = vs[cls] ?? 1;
  const amount = baseAmount * mult;
  target.hp -= amount;
  ctx.events.push({ type: 'damageDealt', targetId: target.id, amount, x: target.pos.x, y: target.pos.y });

  // Notify the owner they're under attack (for alerts), throttled by cooldown key.
  const owner = state.players.find((p) => p.id === target.owner);
  if (owner && !owner.defeated) {
    ctx.events.push({ type: 'underAttack', playerId: target.owner, x: target.pos.x, y: target.pos.y });
  }

  if (target.hp <= 0) {
    target.hp = 0;
    target.state = 'dead';
    ctx.events.push({
      type: 'entityDied',
      id: target.id,
      defId: target.defId,
      owner: target.owner,
      x: target.pos.x,
      y: target.pos.y,
      killerId,
    });
  }
}

export function applyOnHitStatus(state: GameState, target: Entity, status: WeaponDef['onHitStatus']): void {
  if (!status || target.kind === 'resource_node' || target.kind === 'projectile' || !isAlive(target)) return;
  if (status.kind === 'slow') {
    const existing = target.buffs.find((b) => b.kind === 'slow') as Extract<GameplayBuff, { kind: 'slow' }> | undefined;
    const expiresTick = state.tick + status.durationTicks;
    if (existing) {
      existing.expiresTick = Math.max(existing.expiresTick, expiresTick);
      existing.moveFactor = Math.min(existing.moveFactor, status.moveFactor);
      existing.attackCooldownFactor = Math.max(existing.attackCooldownFactor, status.attackCooldownFactor);
    } else {
      target.buffs.push({
        kind: 'slow',
        expiresTick,
        moveFactor: status.moveFactor,
        attackCooldownFactor: status.attackCooldownFactor,
      });
    }
  }
}

export function applySplashDamage(
  state: GameState,
  ctx: StepContext,
  owner: PlayerId,
  x: number,
  y: number,
  radius: number,
  damage: number,
  vs: Record<ArmorClass, number>,
  killerId?: EntityId,
  onHitStatus?: WeaponDef['onHitStatus'],
): void {
  const r2 = radius * radius;
  const targets = entitiesSorted(state)
    .filter((e) => e.kind !== 'resource_node' && e.kind !== 'projectile' && isAlive(e) && isEnemy(state, owner, e.owner))
    .filter((e) => distSq(x, y, e.pos.x, e.pos.y) <= r2)
    .sort((a, b) => {
      const da = distSq(x, y, a.pos.x, a.pos.y);
      const db = distSq(x, y, b.pos.x, b.pos.y);
      return da === db ? a.id - b.id : da - db;
    });
  for (const target of targets) {
    applyDamage(state, ctx, target, damage, vs, killerId);
    applyOnHitStatus(state, target, onHitStatus);
  }
}

export function applyChainDamage(
  state: GameState,
  ctx: StepContext,
  owner: PlayerId,
  firstTarget: Entity,
  weapon: WeaponDef,
  sourceId?: EntityId,
): void {
  const chain = weapon.chain;
  if (!chain) return;
  const hit = new Set<EntityId>();
  let current: Entity | null = firstTarget;
  let damage = weapon.damage;
  for (let jump = 0; current && jump <= chain.jumps; jump++) {
    hit.add(current.id);
    applyDamage(state, ctx, current, damage, weapon.vs, sourceId);
    applyOnHitStatus(state, current, weapon.onHitStatus);
    damage *= chain.falloff;

    const rangeSq = chain.range * chain.range;
    const candidates = entitiesSorted(state)
      .filter((e) => e.kind !== 'resource_node' && e.kind !== 'projectile' && isAlive(e) && isEnemy(state, owner, e.owner))
      .filter((e) => !hit.has(e.id) && current !== null && distSq(current.pos.x, current.pos.y, e.pos.x, e.pos.y) <= rangeSq)
      .sort((a, b) => {
        if (!current) return a.id - b.id;
        const da = distSq(current.pos.x, current.pos.y, a.pos.x, a.pos.y);
        const db = distSq(current.pos.x, current.pos.y, b.pos.x, b.pos.y);
        return da === db ? a.id - b.id : da - db;
      });
    current = candidates[0] ?? null;
  }
}
