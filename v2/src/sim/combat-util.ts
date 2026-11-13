// Shared damage application. Armour-class multipliers and the Aegis buff live here, so every
// damage source (weapons, spells, superweapons, dev commands) obeys the same rules.

import type { ArmorClass, WeaponDef } from '../data/defs';
import type { Registry } from '../data/registry';
import type { StepContext } from './context';
import type { GameState, EntityId, PlayerId } from './types';
import { EntityStore, KIND_BUILDING, KIND_PROJECTILE, KIND_RESOURCE_NODE, KIND_UNIT } from './entity-store';
import { garrisonedInId } from './capabilities';
import { distSq } from '../core/math';
import { getPlayer, hasBuff, isAliveSlot } from './queries';

export function armorClassOf(registry: Registry, store: EntityStore, slot: number): ArmorClass {
  if (store.kind[slot] === KIND_BUILDING) return 'building';
  return registry.units.get(store.extras[slot]!.defId)?.armor ?? 'light';
}

/**
 * Apply damage and emit events. Returns the amount actually dealt (0 for immune or already-dead
 * targets) so callers can aggregate stats without re-reading HP.
 */
export function applyDamage(
  state: GameState,
  ctx: StepContext,
  slot: number,
  baseAmount: number,
  vs: Record<ArmorClass, number>,
  sourceId?: EntityId,
): number {
  const store = state.entities;
  if (!isAliveSlot(state, slot)) return 0;
  const kind = store.kind[slot]!;
  if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) return 0;
  if (kind === KIND_UNIT && garrisonedInId(store.extras[slot]!) !== undefined) return 0;
  // Aegis is full damage immunity for its duration — the buff's whole point.
  if (hasBuff(state, slot, 'aegis')) return 0;

  const cls = armorClassOf(ctx.services.registry, store, slot);
  const mult = vs[cls] ?? 1;
  const amount = baseAmount * mult;
  const x = store.posX[slot]!;
  const y = store.posY[slot]!;
  const owner = store.ownerId(store.ownerIndex[slot]!);

  store.hp[slot] = store.hp[slot]! - amount;
  ctx.events.push({ type: 'damageDealt', targetId: store.id[slot]!, amount, x, y, sourceId });

  const ownerPlayer = getPlayer(state, owner);
  if (ownerPlayer && !ownerPlayer.defeated) {
    ctx.events.push({ type: 'underAttack', playerId: owner, x, y });
  }

  if (store.hp[slot]! <= 0) {
    store.hp[slot] = 0;
    store.kill(slot);
    ctx.events.push({
      type: 'entityDied',
      id: store.id[slot]!,
      defId: store.extras[slot]!.defId,
      owner,
      x,
      y,
      killerId: sourceId,
    });
  }
  return amount;
}

/** Apply an on-hit slow, refreshing and strengthening an existing one rather than stacking. */
export function applyOnHitStatus(
  state: GameState,
  slot: number,
  status: WeaponDef['onHitStatus'],
): void {
  if (!status) return;
  const store = state.entities;
  if (!isAliveSlot(state, slot)) return;
  const kind = store.kind[slot]!;
  if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) return;

  const buffs = store.extras[slot]!.buffs;
  const existing = buffs.find((b) => b.kind === 'slow');
  const expiresTick = state.tick + status.durationTicks;
  if (existing) {
    if (expiresTick > existing.expiresTick) existing.expiresTick = expiresTick;
    if (existing.moveFactor === undefined || status.moveFactor < existing.moveFactor) {
      existing.moveFactor = status.moveFactor;
    }
    if (
      existing.attackCooldownFactor === undefined ||
      status.attackCooldownFactor > existing.attackCooldownFactor
    ) {
      existing.attackCooldownFactor = status.attackCooldownFactor;
    }
  } else {
    buffs.push({
      kind: 'slow',
      expiresTick,
      moveFactor: status.moveFactor,
      attackCooldownFactor: status.attackCooldownFactor,
    });
  }
}

/** Splash damage in a radius, distance-sorted with an id tiebreak for determinism. */
export function applySplashDamage(
  state: GameState,
  ctx: StepContext,
  owner: PlayerId,
  x: number,
  y: number,
  radius: number,
  damage: number,
  vs: Record<ArmorClass, number>,
  sourceId?: EntityId,
  onHitStatus?: WeaponDef['onHitStatus'],
  targeting?: { targetsAir?: boolean; targetsGround?: boolean },
): void {
  const store = state.entities;
  const r2 = radius * radius;
  const hits: { slot: number; d: number; id: EntityId }[] = [];
  for (let slot = 0; slot < store.count; slot++) {
    if (!isAliveSlot(state, slot)) continue;
    const kind = store.kind[slot]!;
    if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
    const tOwner = store.ownerId(store.ownerIndex[slot]!);
    if (!isEnemyOf(state, owner, tOwner)) continue;
    if (kind === KIND_UNIT && garrisonedInId(store.extras[slot]!) !== undefined) continue;
    if (targeting) {
      const air = isAirSlot(ctx.services.registry, store, slot);
      if (air && targeting.targetsAir !== true) continue;
      if (!air && targeting.targetsGround === false) continue;
    }
    const d = distSq(x, y, store.posX[slot]!, store.posY[slot]!);
    if (d > r2) continue;
    hits.push({ slot, d, id: store.id[slot]! });
  }
  hits.sort((a, b) => (a.d === b.d ? a.id - b.id : a.d - b.d));
  for (const hit of hits) {
    applyDamage(state, ctx, hit.slot, damage, vs, sourceId);
    applyOnHitStatus(state, hit.slot, onHitStatus);
  }
}

/** Chain lightning: jumps to the nearest not-yet-hit enemy, damage decaying per jump. */
export function applyChainDamage(
  state: GameState,
  ctx: StepContext,
  owner: PlayerId,
  firstSlot: number,
  weapon: WeaponDef,
  sourceId?: EntityId,
): void {
  const chain = weapon.chain;
  if (!chain) return;
  const store = state.entities;
  const hit = new Set<number>();
  const chainHits: { targetId: EntityId; x: number; y: number }[] = [];
  let current: number | null = firstSlot;
  let damage = weapon.damage;

  for (let jump = 0; current !== null && jump <= chain.jumps; jump++) {
    hit.add(current);
    chainHits.push({ targetId: store.id[current]!, x: store.posX[current]!, y: store.posY[current]! });
    applyDamage(state, ctx, current, damage, weapon.vs, sourceId);
    applyOnHitStatus(state, current, weapon.onHitStatus);
    damage *= chain.falloff;

    const cx = store.posX[current]!;
    const cy = store.posY[current]!;
    const rangeSq = chain.range * chain.range;
    let bestSlot: number | null = null;
    let bestD = Infinity;
    let bestId = Infinity;
    for (let slot = 0; slot < store.count; slot++) {
      if (!isAliveSlot(state, slot) || hit.has(slot)) continue;
      const kind = store.kind[slot]!;
      if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
      if (!isEnemyOf(state, owner, store.ownerId(store.ownerIndex[slot]!))) continue;
      if (!weaponHitsSlot(ctx.services.registry, store, weapon, slot)) continue;
      const d = distSq(cx, cy, store.posX[slot]!, store.posY[slot]!);
      if (d > rangeSq) continue;
      const id = store.id[slot]!;
      if (d < bestD || (d === bestD && id < bestId)) {
        bestD = d;
        bestId = id;
        bestSlot = slot;
      }
    }
    current = bestSlot;
  }

  if (sourceId !== undefined && chainHits.length > 0) {
    const srcSlot = store.slotOf(sourceId);
    ctx.events.push({
      type: 'chainLightningFired',
      sourceId,
      x: srcSlot >= 0 ? store.posX[srcSlot]! : store.posX[firstSlot]!,
      y: srcSlot >= 0 ? store.posY[srcSlot]! : store.posY[firstSlot]!,
      hits: chainHits,
    });
  }
}

function isEnemyOf(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return state.relations[a]?.[b] === 'enemy';
}

export function isAirSlot(registry: Registry, store: EntityStore, slot: number): boolean {
  if (store.kind[slot] !== KIND_UNIT) return false;
  return registry.units.get(store.extras[slot]!.defId)?.mobility === 'air';
}

export function weaponHitsSlot(
  registry: Registry,
  store: EntityStore,
  weapon: { targetsAir?: boolean; targetsGround?: boolean },
  slot: number,
): boolean {
  if (isAirSlot(registry, store, slot)) return weapon.targetsAir === true;
  return weapon.targetsGround !== false;
}
