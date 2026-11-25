// WEBSOCKET TRANSPORT — the browser half of the lockstep link.
//
// Implements the same three-method `Transport` interface the in-process relay does, so `LockstepClient` and
// `LockstepSession` are identical in tests and in a real match. Only the pipe differs.
//
// THREE BEHAVIOURS HERE ARE LOAD-BEARING AND ALL THREE WERE BUGS AT SOME POINT:
//
//   1. BUFFER BEFORE SUBSCRIBERS ATTACH. `LockstepClient` is constructed after the socket opens, so the first
//      `tick` messages can arrive before it has registered a callback. They are buffered and replayed on
//      subscribe, not dropped — dropping one tick desynchronises the peer permanently.
//
//   2. RECONNECT IS NOT "RETRY THE SOCKET". Reconnecting produces a NEW `WebSocket` but must keep the SAME
//      connection id, or the relay treats the peer as a new player and refuses to seat it (the room is
//      `started`). `rejoin` carries the stored `connId`, so the session resumes its own slot.
//
//   3. BACKOFF IS CAPPED AND RESUMES FROM WHERE IT WAS. A school Chromebook lid close produces a burst of failed
//      reconnects; unbounded exponential backoff would take minutes to recover, and resetting it to zero on every
//      failure would hammer the relay. The attempt counter resets only on a SUCCESSFUL rejoin.

import type { Command } from '../sim/types';
import type { ClientMessage, ServerMessage } from './protocol';
import { isServerMessage } from './protocol';
import type { Transport } from './lockstep';

export interface ReconnectConfig {
  url: string;
  room: string;
  connId: string;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 16_000;

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (ev: unknown) => void): void;
  removeEventListener(type: string, listener: (ev: unknown) => void): void;
}

export type SocketFactory = (url: string) => SocketLike;

/** Default factory: the browser's global `WebSocket`. Injected so tests need no real socket. */
const defaultFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

export class WebSocketTransport implements Transport {
  private socket: SocketLike;
  private tickCb: ((tick: number, cmds: Command[]) => void) | null = null;
  private peerCb: ((playerId: string, tick: number, hash: string) => void) | null = null;
  private readonly tickBuffer: { tick: number; cmds: Command[] }[] = [];
  private readonly peerBuffer: { playerId: string; tick: number; hash: string }[] = [];

  private reconnectCfg: ReconnectConfig | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  /** Fired when a rejoin handshake completes, so the UI can leave its "reconnecting" state. */
  onReconnect: (() => void) | null = null;
  /** Fired on any transport-level problem, with a player-facing message. */
  onError: ((message: string) => void) | null = null;
  /** Fired for lobby/control messages the session does not consume itself. */
  onMessage: ((msg: ServerMessage) => void) | null = null;

  constructor(
    socket: SocketLike,
    private readonly factory: SocketFactory = defaultFactory,
  ) {
    this.socket = socket;
    this.bind(socket);
  }

  private bind(socket: SocketLike): void {
    socket.addEventListener('message', (ev) => this.handleMessage(ev));
    socket.addEventListener('close', () => this.handleClose());
  }

  private handleMessage(ev: unknown): void {
    const data = (ev as { data?: unknown }).data;
    if (typeof data !== 'string') return;
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return;
    }
    if (!isServerMessage(raw)) return;
    const msg = raw;

    switch (msg.t) {
      case 'tick':
        if (this.tickCb) this.tickCb(msg.tick, msg.cmds);
        else this.tickBuffer.push({ tick: msg.tick, cmds: msg.cmds });
        break;
      case 'peerChecksum':
        if (this.peerCb) this.peerCb(msg.playerId, msg.tick, msg.hash);
        else this.peerBuffer.push({ playerId: msg.playerId, tick: msg.tick, hash: msg.hash });
        break;
      default:
        this.onMessage?.(msg);
        break;
    }
  }

  private handleClose(): void {
    if (this.intentionalClose) {
      this.onError?.('Disconnected from the relay');
      return;
    }
    if (!this.reconnectCfg) {
      this.onError?.('Disconnected from the relay');
      return;
    }
    this.onError?.('Connection lost — reconnecting…');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.reconnectCfg || this.reconnectTimer !== null) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptReconnect();
    }, delay);
  }

  private attemptReconnect(): void {
    const cfg = this.reconnectCfg;
    if (!cfg) return;
    let socket: SocketLike;
    try {
      socket = this.factory(cfg.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.bind(socket);
    /**
     * Re-authenticate with the SAME connection id, so the relay seats this peer back into its own slot rather
     * than treating it as a new client in a room that has already started.
     */
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ t: 'rejoin', room: cfg.room.toUpperCase(), connId: cfg.connId }));
      // The attempt counter resets only here: a successful socket does not mean a successful rejoin.
      this.reconnectAttempt = 0;
      this.onReconnect?.();
    });
  }

  /** Enable automatic reconnect. Must be called with the connection id from the original join. */
  enableReconnect(cfg: ReconnectConfig): void {
    this.reconnectCfg = cfg;
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

  requestSnapshot(): void {
    this.sendRaw({ t: 'snapshotRequest' });
  }

  sendSnapshot(fromTick: number, state: unknown): void {
    this.sendRaw({ t: 'snapshot', tick: fromTick, state });
  }

  sendRaw(msg: ClientMessage): void {
    // 1 === OPEN. A send on a socket that is still connecting would throw; the state is re-sent after rejoin.
    if (this.socket.readyState === 1) this.socket.send(JSON.stringify(msg));
  }

  join(room: string, lobbyState?: import('./protocol').LobbyStateWire): void {
    this.sendRaw(
      lobbyState
        ? { t: 'join', room: room.toUpperCase(), lobbyState }
        : { t: 'join', room: room.toUpperCase() },
    );
  }

  onTickCommands(cb: (tick: number, cmds: Command[]) => void): void {
    this.tickCb = cb;
    for (const m of this.tickBuffer) cb(m.tick, m.cmds);
    this.tickBuffer.length = 0;
  }

  onPeerChecksum(cb: (playerId: string, tick: number, hash: string) => void): void {
    this.peerCb = cb;
    for (const m of this.peerBuffer) cb(m.playerId, m.tick, m.hash);
    this.peerBuffer.length = 0;
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket.close();
  }

  /** How many buffered messages are waiting for a subscriber, for tests. */
  get bufferedCount(): number {
    return this.tickBuffer.length + this.peerBuffer.length;
  }
}
