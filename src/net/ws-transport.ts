// WebSocket transport implementing the lockstep Transport interface.
import type { Command } from '../sim/types';
import { LockstepClient } from './lockstep';
import type { Transport } from './lockstep';
import type { ClientMessage, ServerMessage } from './protocol';
import type { LobbyStateWire } from './protocol';

export type MatchStartHandler = (startTick: number, seed: number, state: LobbyStateWire) => void;
export type WaitingHandler = (playerCount: number, maxPlayers: number) => void;
export type PeerJoinedHandler = (playerId: string) => void;
export type PeerLeftHandler = (playerId: string) => void;
export type ErrorHandler = (message: string) => void;
export type LobbyMessageHandler = (msg: ServerMessage) => void;
/** Relay asks this client (the host) to produce a snapshot for a lagging peer. */
export type SnapshotRequestHandler = (forConnId: string) => void;
/** Relay delivers a host snapshot to this client so it can jump forward. */
export type SnapshotHandler = (fromTick: number, state: unknown) => void;

export class WebSocketTransport implements Transport {
  private tickCb: ((tick: number, cmds: Command[]) => void) | null = null;
  private peerCb: ((playerId: string, tick: number, hash: string) => void) | null = null;
  private tickBuffer: Array<{ tick: number; cmds: Command[] }> = [];
  private peerChecksumBuffer: Array<{ playerId: string; tick: number; hash: string }> = [];
  onMatchStart: MatchStartHandler | null = null;
  onWaiting: WaitingHandler | null = null;
  onPeerJoined: PeerJoinedHandler | null = null;
  onPeerLeft: PeerLeftHandler | null = null;
  onError: ErrorHandler | null = null;
  onLobbyMessage: LobbyMessageHandler | null = null;
  onSnapshotRequest: SnapshotRequestHandler | null = null;
  onSnapshot: SnapshotHandler | null = null;

  constructor(private ws: WebSocket) {
    ws.addEventListener('message', (ev) => this.handleMessage(ev));
    ws.addEventListener('close', () => this.onError?.('Disconnected from relay'));
  }

  send(forTick: number, cmds: Command[]): void {
    this.sendRaw({ t: 'commands', forTick, cmds });
  }

  reportChecksum(tick: number, hash: string): void {
    this.sendRaw({ t: 'checksum', tick, hash });
  }

  ackTick(tick: number): void {
    this.sendRaw({ t: 'ack', tick });
  }

  /** Ask the host (via relay) for an authoritative state snapshot. */
  requestSnapshot(): void {
    this.sendRaw({ t: 'snapshotRequest' });
  }

  /** Host reply: publish a serialized sim state at `fromTick` to lagging peers. */
  sendSnapshot(fromTick: number, state: unknown): void {
    this.sendRaw({ t: 'snapshot', tick: fromTick, state });
  }

  sendRaw(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onTickCommands(cb: (tick: number, cmds: Command[]) => void): void {
    this.tickCb = cb;
    for (const msg of this.tickBuffer) cb(msg.tick, msg.cmds);
    this.tickBuffer = [];
  }

  onPeerChecksum(cb: (playerId: string, tick: number, hash: string) => void): void {
    this.peerCb = cb;
    for (const msg of this.peerChecksumBuffer) cb(msg.playerId, msg.tick, msg.hash);
    this.peerChecksumBuffer = [];
  }

  join(room: string, lobbyState?: LobbyStateWire): void {
    this.sendRaw({ t: 'join', room: room.toUpperCase(), lobbyState });
  }

  close(): void {
    this.ws.close();
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
        if (this.tickCb) this.tickCb(msg.tick, msg.cmds);
        else this.tickBuffer.push({ tick: msg.tick, cmds: msg.cmds });
        break;
      case 'peerChecksum':
        if (this.peerCb) this.peerCb(msg.playerId, msg.tick, msg.hash);
        else this.peerChecksumBuffer.push({ playerId: msg.playerId, tick: msg.tick, hash: msg.hash });
        break;
      case 'snapshotRequest':
        this.onSnapshotRequest?.(msg.forConnId);
        break;
      case 'snapshot':
        this.onSnapshot?.(msg.fromTick, msg.state);
        break;
      case 'matchStart':
        this.onMatchStart?.(msg.startTick, msg.seed, msg.state);
        this.onLobbyMessage?.(msg);
        break;
      case 'waiting':
        this.onWaiting?.(msg.playerCount, msg.maxPlayers);
        this.onLobbyMessage?.(msg);
        break;
      case 'peerJoined':
        this.onPeerJoined?.(msg.playerId);
        this.onLobbyMessage?.(msg);
        break;
      case 'peerLeft':
        this.onPeerLeft?.(msg.playerId);
        this.onLobbyMessage?.(msg);
        break;
      case 'error':
        this.onError?.(msg.message);
        this.onLobbyMessage?.(msg);
        break;
      case 'lobbyState':
        this.onLobbyMessage?.(msg);
        break;
      case 'joined':
        break;
    }
  }
}

export interface LockstepJoinResult {
  connId: string;
  playerId: string;
  seed: number;
  startTick: number;
  isHost: boolean;
  lobbyState: LobbyStateWire;
  waiting: boolean;
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error(`Could not connect to relay (${url})`)), { once: true });
  });
}

/** Connect, join a room, and wait for the join ack. Lockstep is created before join to avoid tick races. */
export async function connectAndJoin(
  relayUrl: string,
  room: string,
  lobbyState?: LobbyStateWire,
  timeoutMs = 15_000,
): Promise<{ ws: WebSocket; transport: WebSocketTransport; lockstep: LockstepClient; joined: LockstepJoinResult }> {
  const ws = await openSocket(relayUrl);
  const transport = new WebSocketTransport(ws);
  const lockstep = new LockstepClient(transport);
  const joinedPromise = waitForJoin(ws, timeoutMs);
  transport.join(room, lobbyState);
  const joined = await joinedPromise;
  return { ws, transport, lockstep, joined };
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
        connId: msg.connId,
        playerId: msg.playerId,
        seed: msg.seed,
        startTick: msg.startTick,
        isHost: msg.isHost,
        lobbyState: msg.lobbyState,
        waiting: msg.waiting,
      });
    };

    ws.addEventListener('message', onMessage);
  });
}

/** Wait until the relay broadcasts matchStart. */
export function waitForMatchStart(
  transport: WebSocketTransport,
  timeoutMs = 300_000,
): Promise<{ startTick: number; seed: number; state: LobbyStateWire }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Waiting for match start timed out')), timeoutMs);
    const prev = transport.onMatchStart;
    transport.onMatchStart = (startTick, seed, state) => {
      clearTimeout(timer);
      transport.onMatchStart = prev;
      resolve({ startTick, seed, state });
    };
    const prevErr = transport.onError;
    transport.onError = (message) => {
      clearTimeout(timer);
      transport.onError = prevErr;
      reject(new Error(message));
    };
  });
}
