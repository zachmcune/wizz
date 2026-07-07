// Client-side multiplayer session: connect to relay, join room, expose lockstep transport.
import type { PlayerId } from '../sim/types';
import { LockstepClient } from './lockstep';
import {
  connectAndJoin,
  waitForMatchStart,
  type WebSocketTransport,
} from './ws-transport';

export const ONLINE_MATCH_ID = 'skirmish_1v1_online';

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
  matchId: string;
  localPlayerId: PlayerId;
  seed: number;
  transport: WebSocketTransport;
  lockstep: LockstepClient;
  disconnect(): void;
  waitForOpponent(): Promise<void>;
}

export async function joinMultiplayerRoom(room: string, matchId = ONLINE_MATCH_ID): Promise<MultiplayerSession> {
  const code = room.toUpperCase();
  const { transport, joined } = await connectAndJoin(relayWsUrl(), code, matchId);
  const lockstep = new LockstepClient(transport);

  let resolveMatchStart!: () => void;
  const matchStarted = new Promise<void>((resolve) => {
    resolveMatchStart = resolve;
  });

  if (!joined.waiting) {
    resolveMatchStart();
  } else {
    transport.onMatchStart = () => resolveMatchStart();
  }

  return {
    room: code,
    matchId,
    localPlayerId: joined.playerId,
    seed: joined.seed,
    transport,
    lockstep,
    disconnect() {
      transport.close();
    },
    waitForOpponent() {
      return matchStarted;
    },
  };
}

/** @deprecated Use joinMultiplayerRoom + session.waitForOpponent */
export async function joinAndWait(room: string, matchId = ONLINE_MATCH_ID): Promise<MultiplayerSession> {
  const session = await joinMultiplayerRoom(room, matchId);
  await session.waitForOpponent();
  return session;
}

export { waitForMatchStart };
