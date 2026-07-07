// Serialize GameState for worker postMessage (structured-clone friendly).
import type { GameState, Entity } from './types';

export interface TransferState {
  tick: number;
  rngState: number;
  players: GameState['players'];
  relations: GameState['relations'];
  entities: Entity[];
  nextEntityId: number;
  mapId: string;
  winnerTeam: GameState['winnerTeam'];
  ended: boolean;
  beams: GameState['beams'];
  oneSuperweaponPerPlayer: boolean;
}

export function packState(state: GameState): TransferState {
  const entities = [...state.entities.values()].sort((a, b) => a.id - b.id);
  return {
    tick: state.tick,
    rngState: state.rngState,
    players: state.players,
    relations: state.relations,
    entities,
    nextEntityId: state.nextEntityId,
    mapId: state.mapId,
    winnerTeam: state.winnerTeam,
    ended: state.ended,
    beams: state.beams,
    oneSuperweaponPerPlayer: state.oneSuperweaponPerPlayer,
  };
}

export function unpackState(t: TransferState): GameState {
  return {
    tick: t.tick,
    rngState: t.rngState,
    players: t.players,
    relations: t.relations,
    entities: new Map(t.entities.map((e) => [e.id, e])),
    nextEntityId: t.nextEntityId,
    mapId: t.mapId,
    winnerTeam: t.winnerTeam,
    ended: t.ended,
    beams: t.beams ?? [],
    oneSuperweaponPerPlayer: t.oneSuperweaponPerPlayer ?? true,
  };
}

/** In-place update of a mirror GameState from worker output. */
export function applyTransferState(target: GameState, t: TransferState): void {
  target.tick = t.tick;
  target.rngState = t.rngState;
  target.players = t.players;
  target.relations = t.relations;
  target.entities = new Map(t.entities.map((e) => [e.id, e]));
  target.nextEntityId = t.nextEntityId;
  target.mapId = t.mapId;
  target.winnerTeam = t.winnerTeam;
  target.ended = t.ended;
  target.beams = t.beams ?? [];
  target.oneSuperweaponPerPlayer = t.oneSuperweaponPerPlayer ?? true;
}
