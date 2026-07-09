// V2 multiplayer wire protocol. The relay forwards these messages; it never simulates.
import type { Command } from '../sim/types';
import protocolConstants from '../../protocol-constants.json';

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
  oneSuperweaponPerPlayer?: boolean;
  economyPacing?: 'standard' | 'tight';
  /** Classic 2D (ortho) or oblique 2.5D — locked when the match starts. */
  projectionMode?: 'ortho' | 'oblique';
}

export type ClientMessage =
  | { t: 'join'; room: string; lobbyState?: LobbyStateWire }
  | { t: 'rejoin'; room: string; connId: string }
  | { t: 'lobbyUpdate'; state: LobbyStateWire }
  | { t: 'claimSlot'; slotId: string; team: string; color: string; startIndex: number | null; factionId: string }
  | { t: 'slotReady'; slotId: string; ready: boolean }
  | { t: 'startMatch' }
  | { t: 'commands'; forTick: number; cmds: Command[] }
  | { t: 'checksum'; tick: number; hash: string }
  /** Report the highest sim tick this client has fully processed (paces the relay). */
  | { t: 'ack'; tick: number }
  /** Ask the host to send an authoritative state snapshot (resync after falling behind). */
  | { t: 'snapshotRequest' }
  /** Host reply carrying a serialized sim state at `tick` (opaque TransferState). */
  | { t: 'snapshot'; tick: number; state: unknown };

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
  | { t: 'peerDisconnected'; playerId: string }
  | { t: 'matchStart'; startTick: number; seed: number; state: LobbyStateWire }
  | { t: 'tick'; tick: number; cmds: Command[] }
  | { t: 'peerChecksum'; playerId: string; tick: number; hash: string }
  /** Relay asks the host to produce a snapshot for a peer that fell behind. */
  | { t: 'snapshotRequest'; forConnId: string }
  /** Relay forwards the host's snapshot to the requesting peer(s). */
  | { t: 'snapshot'; fromTick: number; state: unknown }
  | { t: 'error'; message: string };

/** Wire protocol version — bump when message shapes change. */
export const PROTOCOL_VERSION = protocolConstants.PROTOCOL_VERSION;

/** Ticks of input delay before a command is executed (lockstep buffering). */
export const INPUT_DELAY_TICKS = protocolConstants.INPUT_DELAY_TICKS;

/**
 * Max ticks the relay may run ahead of the slowest acknowledged peer. Bounds the
 * worst-case drift between clients (LEAD_TICKS / TICK_HZ seconds). The relay pauses
 * its clock once it reaches this lead until acks catch up.
 */
export const LEAD_TICKS = protocolConstants.LEAD_TICKS;

/** Clients ack their processed tick to the relay at most this often (in sim ticks). */
export const ACK_EVERY_TICKS = protocolConstants.ACK_EVERY_TICKS;

/**
 * A peer whose last ack is older than this is excluded from the relay's pacing set
 * (so one frozen/backgrounded player cannot stall the whole match). It resyncs via a
 * state snapshot when it returns.
 */
export const STALL_DROP_MS = protocolConstants.STALL_DROP_MS;

/**
 * When a client's sim tick lags the relay head by more than this many ticks, it
 * requests a state snapshot instead of replaying the whole backlog.
 */
export const SNAPSHOT_RESYNC_TICKS = protocolConstants.SNAPSHOT_RESYNC_TICKS;

/** Report state checksums every N sim ticks during lockstep play. */
export const CHECKSUM_INTERVAL_TICKS = protocolConstants.CHECKSUM_INTERVAL_TICKS;

/** Relay advances the sim at 20 Hz (must match TICK_HZ). */
export const RELAY_TICK_MS = protocolConstants.RELAY_TICK_MS;

/** Grace period after matchStart before relay ticks (lets clients finish loading). */
export const MATCH_LOAD_GRACE_MS = protocolConstants.MATCH_LOAD_GRACE_MS;

/** Max sim work per render frame during main-thread lockstep catch-up (keeps UI responsive). */
export const LOCKSTEP_DRAIN_BUDGET_MS = protocolConstants.LOCKSTEP_DRAIN_BUDGET_MS;

/**
 * Max confirmed ticks handed to the sim worker in one lockstep batch. Bounds a single
 * round-trip's work so the worker stays responsive while still catching up quickly.
 */
export const LOCKSTEP_MAX_BATCH_TICKS = protocolConstants.LOCKSTEP_MAX_BATCH_TICKS;

/** No relay tick for this long → show a connection-stall hint. */
export const LOCKSTEP_STALL_MS = protocolConstants.LOCKSTEP_STALL_MS;
