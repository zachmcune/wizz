// Incremental worker sync: send only changed entities instead of full state each tick.
import type { Entity, EntityId } from './types';
import type { TransferState } from './sync-surface';
import { applyAuthoritativeState } from './sync-surface';

export interface TransferDelta {
  syncVersion: number;
  tick: number;
  rngState: number;
  players: TransferState['players'];
  relations: TransferState['relations'];
  changed: Entity[];
  removed: EntityId[];
  nextEntityId: number;
  mapId: string;
  winnerTeam: TransferState['winnerTeam'];
  ended: boolean;
  beams: TransferState['beams'];
  oneSuperweaponPerPlayer: boolean;
  sandbox?: TransferState['sandbox'];
}

function entitySnapshot(e: Entity): string {
  return JSON.stringify(e);
}

/** Build a delta from previous packed state to the next authoritative state. */
export function packDelta(prev: TransferState | null, next: TransferState): TransferDelta | null {
  if (!prev || prev.syncVersion !== next.syncVersion) return null;

  const prevById = new Map(prev.entities.map((e) => [e.id, e]));
  const nextById = new Map(next.entities.map((e) => [e.id, e]));
  const changed: Entity[] = [];
  const removed: EntityId[] = [];

  for (const e of next.entities) {
    const old = prevById.get(e.id);
    if (!old || entitySnapshot(old) !== entitySnapshot(e)) changed.push(e);
  }
  for (const id of prev.entities.map((e) => e.id)) {
    if (!nextById.has(id)) removed.push(id);
  }

  const topLevelSame =
    prev.tick === next.tick &&
    prev.rngState === next.rngState &&
    prev.players === next.players &&
    prev.relations === next.relations &&
    prev.nextEntityId === next.nextEntityId &&
    prev.mapId === next.mapId &&
    prev.winnerTeam === next.winnerTeam &&
    prev.ended === next.ended &&
    prev.beams === next.beams &&
    prev.oneSuperweaponPerPlayer === next.oneSuperweaponPerPlayer &&
    prev.sandbox === next.sandbox;

  if (topLevelSame && !changed.length && !removed.length) {
    return {
      syncVersion: next.syncVersion,
      tick: next.tick,
      rngState: next.rngState,
      players: next.players,
      relations: next.relations,
      changed: [],
      removed: [],
      nextEntityId: next.nextEntityId,
      mapId: next.mapId,
      winnerTeam: next.winnerTeam,
      ended: next.ended,
      beams: next.beams,
      oneSuperweaponPerPlayer: next.oneSuperweaponPerPlayer,
      sandbox: next.sandbox,
    };
  }

  // Use full transfer when more than half the entities changed (delta not worthwhile).
  if (changed.length + removed.length > next.entities.length * 0.5) return null;

  return {
    syncVersion: next.syncVersion,
    tick: next.tick,
    rngState: next.rngState,
    players: next.players,
    relations: next.relations,
    changed,
    removed,
    nextEntityId: next.nextEntityId,
    mapId: next.mapId,
    winnerTeam: next.winnerTeam,
    ended: next.ended,
    beams: next.beams,
    oneSuperweaponPerPlayer: next.oneSuperweaponPerPlayer,
    sandbox: next.sandbox,
  };
}

/** Apply a delta to an in-place mirror GameState. Returns true if nav grid may need updating. */
export function applyDelta(target: import('./types').GameState, delta: TransferDelta): boolean {
  for (const id of delta.removed) target.entities.delete(id);
  for (const e of delta.changed) target.entities.set(e.id, e);
  applyAuthoritativeState(target, {
    syncVersion: delta.syncVersion,
    tick: delta.tick,
    rngState: delta.rngState,
    players: delta.players,
    relations: delta.relations,
    entities: [...target.entities.values()].sort((a, b) => a.id - b.id),
    nextEntityId: delta.nextEntityId,
    mapId: delta.mapId,
    winnerTeam: delta.winnerTeam,
    ended: delta.ended,
    beams: delta.beams,
    oneSuperweaponPerPlayer: delta.oneSuperweaponPerPlayer,
    sandbox: delta.sandbox,
  });
  return delta.removed.length > 0 || delta.changed.some((e) => e.kind === 'building');
}

/** Apply worker output (full state or delta) to a mirror GameState. */
export function applyWorkerSync(
  target: import('./types').GameState,
  sync: { state?: TransferState; delta?: TransferDelta },
): boolean {
  if (sync.delta) return applyDelta(target, sync.delta);
  if (sync.state) {
    applyAuthoritativeState(target, sync.state);
    return true;
  }
  return false;
}
