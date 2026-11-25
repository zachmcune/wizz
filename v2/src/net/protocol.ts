// V2 MULTIPLAYER WIRE PROTOCOL — structurally identical to v1's, so the unchanged Railway relay serves it.
//
// THE CONSTRAINT THAT SHAPES THIS FILE: Phase 6 must not modify `relay/`. The relay validates every client
// message with v1's zod schemas (`src/net/protocol-schema.ts`) and forwards a fixed set of shapes. So v2's
// messages have to be *accepted* by that validator, field for field. `tests/net/wire-compat.test.ts` does
// not merely compare type declarations — it feeds real v2 messages through the relay's own
// `parseClientMessage`/`parseServerMessage` and fails if any is rejected.
//
// Two consequences worth stating, because they look like omissions:
//
//   1. The relay's `Command` schema enumerates v1's 23 player commands plus the dev commands. v2's simulator
//      implements the same vocabulary, so no translation layer is needed. If v2 ever adds a command, the
//      relay's schema has to accept it too — which is exactly the signal you want, rather than discovering
//      it as a silently dropped action in a live match.
//   2. There is no `ping`/`latency` message. The relay does not define one, so latency is measured
//      client-side from tick arrival times (see `latency.ts`) instead of by a round trip.
import type { Command } from '../sim/types';

export interface LobbySlotWire {
  id: string;
  /** `open` and `human` are both claimable; `ai` and `closed` are not. Mirrors the relay's own rules. */
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
  /** Highest sim tick this client has fully processed; paces the relay's clock. */
  | { t: 'ack'; tick: number }
  /** Ask the host for an authoritative state snapshot (resync after falling behind). */
  | { t: 'snapshotRequest' }
  /** Host reply carrying a serialized sim state at `tick`. */
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

/**
 * Runtime validation for messages arriving from the socket.
 *
 * Deliberately hand-written rather than zod: this runs on every tick message (20/s per peer), and the
 * shapes are small and already constrained by the relay on the way in. It is a guard against a corrupt or
 * hostile frame crashing the client, not a security boundary — the relay is the trust boundary.
 */
export function isServerMessage(raw: unknown): raw is ServerMessage {
  if (typeof raw !== 'object' || raw === null) return false;
  const m = raw as { t?: unknown };
  switch (m.t) {
    case 'joined':
    case 'lobbyState':
    case 'waiting':
    case 'peerJoined':
    case 'peerLeft':
    case 'peerDisconnected':
    case 'matchStart':
    case 'tick':
    case 'peerChecksum':
    case 'snapshotRequest':
    case 'snapshot':
    case 'error':
      return true;
    default:
      return false;
  }
}

/** True when a slot can be taken by a connecting player. Mirrors the relay's `availableSlot`. */
export function isClaimable(slot: LobbySlotWire): boolean {
  return (slot.kind === 'open' || slot.kind === 'human') && !slot.claimedBy;
}

/** Players a lobby will actually spawn. Slots marked `ai` count: they are filled by the local brain. */
export function participantsOf(state: LobbyStateWire): LobbySlotWire[] {
  return state.slots.filter((s) => s.kind !== 'closed');
}
