// Read-only helpers over GameState. All targeting/vision/win logic goes through relations,
// never a hardcoded "me vs enemy" - this is what makes N players / teams / FFA work.
import type { GameState, Entity, PlayerId, Relation } from './types';

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

export function buildingsOf(state: GameState, owner: PlayerId): Entity[] {
  return ownedBy(state, owner).filter((e) => e.kind === 'building' && e.state !== 'dead');
}

/** True if the player still has a living HQ (Sanctum). */
export function hasSanctum(state: GameState, owner: PlayerId): boolean {
  return buildingsOf(state, owner).some((b) => b.defId === 'sanctum');
}

export function isAlive(e: Entity | undefined | null): e is Entity {
  return !!e && e.state !== 'dead' && e.hp > 0;
}

export function hasBuff(e: Entity, kind: 'aegis' | 'haste', tick: number): boolean {
  return e.buffs.some((b) => b.kind === kind && b.expiresTick > tick);
}
