// Read-only helpers over GameState. All targeting/vision/win logic goes through relations,
// never a hardcoded "me vs enemy" - this is what makes N players / teams / FFA work.
import type { BuildingEntity } from './entity-types';
import type { GameState, Entity, GameplayBuff, PlayerId, Relation } from './types';

export function getPlayer(state: GameState, id: PlayerId) {
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

/** Entities in ascending id order (deterministic iteration for state-mutating loops). */
export function entitiesSorted(state: GameState): Entity[] {
  const ids = [...state.entities.keys()].sort((x, y) => x - y);
  return ids.map((id) => state.entities.get(id)!);
}

export function ownedBy(state: GameState, owner: PlayerId): Entity[] {
  return entitiesSorted(state).filter((e) => e.owner === owner);
}

export function buildingsOf(state: GameState, owner: PlayerId): BuildingEntity[] {
  return ownedBy(state, owner).filter((e): e is BuildingEntity => e.kind === 'building' && e.state !== 'dead');
}

/** True if the player still has a living HQ (Sanctum or deployed Waystone Camp). */
export function hasHQ(state: GameState, owner: PlayerId): boolean {
  return buildingsOf(state, owner).some((b) => b.defId === 'sanctum' || b.defId === 'waystone_camp');
}

/** @deprecated Use hasHQ */
export function hasSanctum(state: GameState, owner: PlayerId): boolean {
  return hasHQ(state, owner);
}

export function isAlive(e: Entity | undefined | null): e is Entity {
  if (!e || e.hp <= 0) return false;
  if (e.kind === 'resource_node') return (e.amount ?? 0) > 0;
  if (e.kind === 'projectile') return true;
  return e.state !== 'dead';
}

export function hasBuff(e: Entity, kind: GameplayBuff['kind'], tick: number): boolean {
  if (e.kind === 'resource_node' || e.kind === 'projectile') return false;
  return e.buffs.some((b) => b.kind === kind && b.expiresTick > tick);
}

export function activeBuffs(e: Entity, kind: GameplayBuff['kind'], tick: number): GameplayBuff[] {
  if (e.kind === 'resource_node' || e.kind === 'projectile') return [];
  return e.buffs.filter((b) => b.kind === kind && b.expiresTick > tick);
}

export function strongestSlowMoveFactor(e: Entity, tick: number): number {
  const slows = activeBuffs(e, 'slow', tick).filter((b): b is Extract<GameplayBuff, { kind: 'slow' }> => b.kind === 'slow');
  if (!slows.length) return 1;
  return Math.min(...slows.map((b) => b.moveFactor));
}

export function strongestSlowAttackCooldownFactor(e: Entity, tick: number): number {
  const slows = activeBuffs(e, 'slow', tick).filter((b): b is Extract<GameplayBuff, { kind: 'slow' }> => b.kind === 'slow');
  if (!slows.length) return 1;
  return Math.max(...slows.map((b) => b.attackCooldownFactor));
}
