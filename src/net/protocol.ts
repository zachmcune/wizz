// V2 multiplayer wire protocol. The relay forwards these messages; it never simulates.
import type { Command } from '../sim/types';

export interface LobbySlotWire {
  id: string;
  kind: 'closed' | 'human' | 'ai' | 'open';
  team: string;
  color: string;
  startIndex: number | null;
  factionId: string;
  aiDifficulty?: 'easy' | 'normal' | 'hard';
  claimedBy?: string | null;
  ready?: boolean;
}

export interface LobbyStateWire {
  mapId: string;
  factionId: string;
  slots: LobbySlotWire[];
  deadSpectatorReveal?: boolean;
  /** Classic 2D (ortho) or oblique 2.5D — locked when the match starts. */
  projectionMode?: 'ortho' | 'oblique';
}

export type ClientMessage =
  | { t: 'join'; room: string; lobbyState?: LobbyStateWire }
  | { t: 'rejoin'; room: string; connId: string; fromTick: number }
  | { t: 'lobbyUpdate'; state: LobbyStateWire }
  | { t: 'claimSlot'; slotId: string; team: string; color: string; startIndex: number | null; factionId: string }
  | { t: 'slotReady'; slotId: string; ready: boolean }
  | { t: 'startMatch' }
  | { t: 'commands'; forTick: number; cmds: Command[] }
  | { t: 'checksum'; tick: number; hash: string };

export type ServerMessage =
  | {
      t: 'joined';
      connId: string;
      playerId: string;
      seed: number;
      startTick: number;
      isHost: boolean;
      lobbyState: LobbyStateWire;
      waiting: boolean;
    }
  | { t: 'lobbyState'; state: LobbyStateWire }
  | { t: 'waiting'; playerCount: number; maxPlayers: number }
  | { t: 'peerJoined'; playerId: string }
  | { t: 'peerLeft'; playerId: string }
  | { t: 'matchStart'; startTick: number; seed: number; state: LobbyStateWire }
  | {
      t: 'rejoined';
      connId: string;
      playerId: string;
      seed: number;
      startTick: number;
      lobbyState: LobbyStateWire;
      currentTick: number;
    }
  | { t: 'tick'; tick: number; cmds: Command[] }
  | { t: 'peerChecksum'; playerId: string; tick: number; hash: string }
  | { t: 'error'; message: string };

/** Ticks of input delay before a command is executed (lockstep buffering). */
export const INPUT_DELAY_TICKS = 6;

/** Report state checksums every N sim ticks during lockstep play. */
export const CHECKSUM_INTERVAL_TICKS = 60;

/** Relay advances the sim at 20 Hz (must match TICK_HZ). */
export const RELAY_TICK_MS = 50;

/** Grace period after matchStart before relay ticks (lets clients finish loading). */
export const MATCH_LOAD_GRACE_MS = 2500;

/** Max sim work per render frame during lockstep catch-up (keeps UI responsive). */
export const LOCKSTEP_DRAIN_BUDGET_MS = 8;

/** No relay tick for this long → show a connection-stall hint. */
export const LOCKSTEP_STALL_MS = 3000;

/** Relay retains this many ticks so mobile clients can rejoin after backgrounding. */
export const RELAY_TICK_HISTORY = 1200;
