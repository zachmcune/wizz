// WebSocket transport implementing the lockstep Transport interface.
import type { Command } from '../sim/types';
import type { Transport } from './lockstep';
import type { ClientMessage, ServerMessage } from './protocol';

export type MatchStartHandler = (startTick: number) => void;
export type WaitingHandler = (playerCount: number, maxPlayers: number) => void;
export type PeerJoinedHandler = (playerId: string) => void;
export type PeerLeftHandler = (playerId: string) => void;
export type ErrorHandler = (message: string) => void;

export class WebSocketTransport implements Transport {
  private tickCb: ((tick: number, cmds: Command[]) => void) | null = null;
  private peerCb: ((playerId: string, tick: number, hash: string) => void) | null = null;
  onMatchStart: MatchStartHandler | null = null;
  onWaiting: WaitingHandler | null = null;
  onPeerJoined: PeerJoinedHandler | null = null;
  onPeerLeft: PeerLeftHandler | null = null;
  onError: ErrorHandler | null = null;

  constructor(private ws: WebSocket) {
    ws.addEventListener('message', (ev) => this.handleMessage(ev));
    ws.addEventListener('close', () => this.onError?.('Disconnected from relay'));
  }

  send(forTick: number, cmds: Command[]): void {
    this.post({ t: 'commands', forTick, cmds });
  }

  reportChecksum(tick: number, hash: string): void {
    this.post({ t: 'checksum', tick, hash });
  }

  onTickCommands(cb: (tick: number, cmds: Command[]) => void): void {
    this.tickCb = cb;
  }

  onPeerChecksum(cb: (playerId: string, tick: number, hash: string) => void): void {
    this.peerCb = cb;
  }

  join(room: string, matchId: string): void {
    this.post({ t: 'join', room: room.toUpperCase(), matchId });
  }

  close(): void {
    this.ws.close();
  }

  private post(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(ev: MessageEvent): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'tick':
        this.tickCb?.(msg.tick, msg.cmds);
        break;
      case 'peerChecksum':
        this.peerCb?.(msg.playerId, msg.tick, msg.hash);
        break;
      case 'matchStart':
        this.onMatchStart?.(msg.startTick);
        break;
      case 'waiting':
        this.onWaiting?.(msg.playerCount, msg.maxPlayers);
        break;
      case 'peerJoined':
        this.onPeerJoined?.(msg.playerId);
        break;
      case 'peerLeft':
        this.onPeerLeft?.(msg.playerId);
        break;
      case 'error':
        this.onError?.(msg.message);
        break;
      case 'joined':
        break;
    }
  }
}

export interface LockstepJoinResult {
  playerId: string;
  seed: number;
  startTick: number;
  waiting: boolean;
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error(`Could not connect to relay (${url})`)), { once: true });
  });
}

/** Connect, join a room, and wait for the join ack. */
export async function connectAndJoin(
  relayUrl: string,
  room: string,
  matchId: string,
  timeoutMs = 15_000,
): Promise<{ ws: WebSocket; transport: WebSocketTransport; joined: LockstepJoinResult }> {
  const ws = await openSocket(relayUrl);
  const transport = new WebSocketTransport(ws);
  const joinedPromise = waitForJoin(ws, timeoutMs);
  transport.join(room, matchId);
  const joined = await joinedPromise;
  return { ws, transport, joined };
}

/** Wait for the next `joined` message from the relay. */
export function waitForJoin(ws: WebSocket, timeoutMs = 15_000): Promise<LockstepJoinResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error('Relay join timed out'));
    }, timeoutMs);

    const onMessage = (ev: MessageEvent): void => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t === 'error') {
        clearTimeout(timer);
        ws.removeEventListener('message', onMessage);
        reject(new Error(msg.message));
        return;
      }
      if (msg.t !== 'joined') return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      resolve({
        playerId: msg.playerId,
        seed: msg.seed,
        startTick: msg.startTick,
        waiting: msg.waiting,
      });
    };

    ws.addEventListener('message', onMessage);
  });
}

/** Wait until the relay broadcasts matchStart. */
export function waitForMatchStart(transport: WebSocketTransport, timeoutMs = 300_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Waiting for opponent timed out')), timeoutMs);
    transport.onMatchStart = (startTick) => {
      clearTimeout(timer);
      resolve(startTick);
    };
    transport.onError = (message) => {
      clearTimeout(timer);
      reject(new Error(message));
    };
  });
}
