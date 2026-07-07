// Client-side multiplayer session: connect to relay, join room, expose lockstep transport.
import type { PlayerId } from '../sim/types';
import type { LobbyState } from '../lobby/types';
import { lobbyStateFromWire, lobbyStateToWire } from './lobby-wire';
import { LobbyClient } from './lobby-client';
import { LockstepClient } from './lockstep';
import {
  connectAndJoin,
  waitForMatchStart,
  type WebSocketTransport,
} from './ws-transport';

/** Resolve relay WebSocket URL from build-time env or page origin. */
export function relayWsUrl(): string {
  const env = import.meta.env.VITE_RELAY_URL as string | undefined;
  if (env) return env;
  if (typeof location !== 'undefined') {
    const host = location.hostname || 'localhost';
    if (location.protocol === 'https:') {
      return `wss://${host}`;
    }
    return `ws://${host}:8787`;
  }
  return 'ws://localhost:8787';
}

export function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export interface MultiplayerSession {
  room: string;
  connId: string;
  localPlayerId: PlayerId;
  seed: number;
  isHost: boolean;
  lobbyState: LobbyState;
  transport: WebSocketTransport;
  lockstep: LockstepClient;
  lobby: LobbyClient;
  disconnect(): void;
  waitForMatchStart(): Promise<{ seed: number; lobbyState: LobbyState }>;
}

export async function joinMultiplayerRoom(room: string, initialLobby?: LobbyState): Promise<MultiplayerSession> {
  const code = room.toUpperCase();
  const wire = initialLobby ? lobbyStateToWire(initialLobby) : undefined;
  const { transport, lockstep, joined } = await connectAndJoin(relayWsUrl(), code, wire);
  const lobby = new LobbyClient(transport);

  let resolveMatchStart!: (value: { seed: number; lobbyState: LobbyState }) => void;
  const matchStarted = new Promise<{ seed: number; lobbyState: LobbyState }>((resolve) => {
    resolveMatchStart = resolve;
  });

  lobby.onMatchStart = (seed, state) => resolveMatchStart({ seed, lobbyState: state });
  transport.onMatchStart = (startTick, seed, state) => {
    void startTick;
    resolveMatchStart({ seed, lobbyState: lobbyStateFromWire(state) });
  };

  return {
    room: code,
    connId: joined.connId,
    localPlayerId: joined.playerId,
    seed: joined.seed,
    isHost: joined.isHost,
    lobbyState: lobbyStateFromWire(joined.lobbyState),
    transport,
    lockstep,
    lobby,
    disconnect() {
      transport.close();
    },
    waitForMatchStart() {
      return matchStarted;
    },
  };
}

export { waitForMatchStart };
