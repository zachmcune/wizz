// Read-only helpers over GameState.
//
// All targeting and vision decisions go through `relations`, never a hard-coded "me vs enemy" —
// that is what makes N players, teams and FFA work from one code path.

import type { Registry } from '../data/registry';
import type { GameState, EntityId, Player, PlayerId, Relation } from './types';
import { EntityStore, KIND_BUILDING, KIND_RESOURCE_NODE, KIND_UNIT } from './entity-store';

export function getPlayer(state: GameState, id: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function relationBetween(state: GameState, a: PlayerId, b: PlayerId): Relation {
  if (a === b) return 'ally';
  return state.relations[a]?.[b] ?? 'enemy';
}

export function isEnemy(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return relationBetween(state, a, b) === 'enemy';
}

export function isAlly(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return relationBetween(state, a, b) === 'ally';
}

/** True when an entity slot is alive (or a node with mana left). */
export function isAliveSlot(state: GameState, slot: number): boolean {
  return state.entities.isAliveSlot(slot);
}

export function ownerOf(state: GameState, slot: number): PlayerId {
  return state.entities.ownerId(state.entities.ownerIndex[slot]!);
}

export function defIdOf(state: GameState, slot: number): string {
  return state.entities.extras[slot]!.defId;
}

/** Count living units owned by a player. Used by the unit-cap check and AI. */
export function unitCountOf(state: GameState, owner: PlayerId, registry: Registry): number {
  const store = state.entities;
  let n = 0;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    if (store.ownerIndex[slot] !== store.ownerIndexFor(owner)) continue;
    // Wagons and other non-army units still count against the cap: it is a performance guard.
    void registry;
    n++;
  }
  return n;
}

/** True when the player still holds an HQ (Sanctum or a deployed Waystone Camp). */
export function hasHQ(state: GameState, owner: PlayerId): boolean {
  const store = state.entities;
  const ownerIdx = store.ownerIndexFor(owner);
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.ownerIndex[slot] !== ownerIdx) continue;
    const defId = store.extras[slot]!.defId;
    if (defId === 'sanctum' || defId === 'waystone_camp') return true;
  }
  return false;
}

/** Resource nodes with mana left. */
export function liveNodeSlots(store: EntityStore, out: number[]): number[] {
  out.length = 0;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_RESOURCE_NODE) continue;
    if (store.amount[slot]! <= 0) continue;
    out.push(slot);
  }
  return out;
}

/** A stable, id-sorted list of live slots. Allocates — use only where ordering matters. */
export function sortedSlots(store: EntityStore): EntityId[] {
  const ids: EntityId[] = [];
  for (let slot = 0; slot < store.count; slot++) if (!store.dead[slot]) ids.push(store.id[slot]!);
  ids.sort((a, b) => a - b);
  return ids;
}

/** Buff helpers. */
export function hasBuff(
  state: GameState,
  slot: number,
  kind: 'aegis' | 'haste' | 'slow',
): boolean {
  const buffs = state.entities.extras[slot]!.buffs;
  for (const b of buffs) {
    if (b.kind === kind && b.expiresTick > state.tick) return true;
  }
  return false;
}

export function strongestSlowMoveFactor(state: GameState, slot: number): number {
  let factor = 1;
  for (const b of state.entities.extras[slot]!.buffs) {
    if (b.kind !== 'slow' || b.expiresTick <= state.tick) continue;
    if (b.moveFactor !== undefined && b.moveFactor < factor) factor = b.moveFactor;
  }
  return factor;
}

export function strongestSlowAttackCooldownFactor(state: GameState, slot: number): number {
  let factor = 1;
  for (const b of state.entities.extras[slot]!.buffs) {
    if (b.kind !== 'slow' || b.expiresTick <= state.tick) continue;
    if (b.attackCooldownFactor !== undefined && b.attackCooldownFactor > factor) factor = b.attackCooldownFactor;
  }
  return factor;
}
