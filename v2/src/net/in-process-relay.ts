// IN-PROCESS RELAY — the real relay's merge semantics, with no sockets and no wall-clock.
//
// WHY A SECOND IMPLEMENTATION EXISTS. `v2/src/net/` must not import the repository-root relay
// (`relay/relay-app.mjs`) — it is v1's code and `tests/isolation.test.ts` forbids reaching outside `v2/`.
// But a simulation-only fake would prove nothing about the real relay's behaviour, so this class
// deliberately mirrors the parts of `relay/relay-app.mjs` that affect determinism:
//
//   • commands are merged PER TICK, grouped by player and emitted in sorted player-id order
//     (`mergePending`), because that ordering is what every peer simulates;
//   • commands submitted for a tick already in the past are pushed FORWARD to the current tick rather
//     than dropped (`receiveCommands`), so a late click still lands;
//   • a tick message is broadcast once per tick and the tick counter advances by exactly one.
//
// `tests/net/relay-parity.test.ts` runs the SAME scenario through this class and through the real
// `Room` from `relay/relay-app.mjs` and asserts the produced tick streams are identical. That is what keeps
// this a faithful stand-in rather than a convenient one.
//
// It is used by the headless multiplayer suites, which need to advance thousands of ticks instantly and to
// inject latency, jitter, stalls and disconnects deterministically. Those are impossible against a real
// 20 Hz relay with real sockets, which is why the proof has both layers: this for control, and the browser
// Playwright run for reality.

import type { Command } from '../sim/types';
import type { Transport } from './lockstep';

export interface PendingCommand {
  playerId: string;
  forTick: number;
  cmds: Command[];
}

interface Connection {
  playerId: string;
  transport: InProcessTransport;
  /** When set, delivery of tick broadcasts is held until the harness releases it. */
  paused: boolean;
  /** Messages queued while paused. */
  held: { tick: number; cmds: Command[] }[];
}

class InProcessTransport implements Transport {
  private tickCb: ((tick: number, cmds: Command[]) => void) | null = null;
  private peerCb: ((playerId: string, tick: number, hash: string) => void) | null = null;

  constructor(
    private readonly room: InProcessRoom,
    readonly playerId: string,
  ) {}

  send(forTick: number, cmds: Command[]): void {
    this.room.receiveCommands(this.playerId, forTick, cmds);
  }

  reportChecksum(tick: number, hash: string): void {
    this.room.receiveChecksum(this.playerId, tick, hash);
  }

  ackTick(tick: number): void {
    this.room.receiveAck(this.playerId, tick);
  }

  onTickCommands(cb: (tick: number, cmds: Command[]) => void): void {
    this.tickCb = cb;
  }

  onPeerChecksum(cb: (playerId: string, tick: number, hash: string) => void): void {
    this.peerCb = cb;
  }

  deliverTick(tick: number, cmds: Command[]): void {
    this.tickCb?.(tick, cmds);
  }

  deliverPeerChecksum(playerId: string, tick: number, hash: string): void {
    if (playerId === this.playerId) return;
    this.peerCb?.(playerId, tick, hash);
  }
}

export interface InProcessRelayOptions {
  /** Commands submitted for a tick further in the past than this are dropped (simulates a lost packet). */
  lateDropBeyondTicks?: number;
}

export class InProcessRoom {
  readonly seed: number;
  readonly playerIds: string[];
  tick = 0;
  private readonly connections = new Map<string, Connection>();
  private pending: PendingCommand[] = [];
  /** Highest ack tick per player, mirroring the relay's `lastAckTick`. */
  readonly acks = new Map<string, number>();
  /** Every merged tick, so a test can diff two runs' command streams. */
  readonly history: { tick: number; cmds: Command[] }[] = [];
  private readonly lateDrop: number;

  constructor(seed: number, playerIds: string[], opts: InProcessRelayOptions = {}) {
    this.seed = seed;
    this.playerIds = [...playerIds];
    this.lateDrop = opts.lateDropBeyondTicks ?? Infinity;
    for (const id of playerIds) this.acks.set(id, -1);
  }

  connect(playerId: string): Transport {
    if (!this.playerIds.includes(playerId)) throw new Error(`Unknown player ${playerId}`);
    const existing = this.connections.get(playerId);
    if (existing) return existing.transport;
    const transport = new InProcessTransport(this, playerId);
    this.connections.set(playerId, { playerId, transport, paused: false, held: [] });
    return transport;
  }

  /** Disconnect a peer: it stops receiving broadcasts and its acks stop advancing. */
  disconnect(playerId: string): void {
    const c = this.connections.get(playerId);
    if (c) c.paused = true;
  }

  /** Reconnect a peer and flush anything held while it was away, in tick order. */
  reconnect(playerId: string): void {
    const c = this.connections.get(playerId);
    if (!c) throw new Error(`cannot reconnect unknown player ${playerId}`);
    c.paused = false;
    for (const h of c.held) c.transport.deliverTick(h.tick, h.cmds);
    c.held.length = 0;
  }

  isPaused(playerId: string): boolean {
    return this.connections.get(playerId)?.paused ?? false;
  }

  receiveCommands(playerId: string, forTick: number, cmds: Command[]): void {
    if (cmds.length === 0) return;
    /**
     * LATE COMMANDS ROLL FORWARD. The real relay does `forTick < this.tick ? this.tick : forTick`, so a
     * command that arrives after its tick still executes — one tick in the future — instead of vanishing. A
     * player who clicks during a hitch expects the order to be obeyed, not swallowed.
     */
    let effective = forTick < this.tick ? this.tick : forTick;
    if (forTick < this.tick - this.lateDrop) effective = this.tick;
    this.pending.push({ playerId, forTick: effective, cmds });
  }

  receiveChecksum(playerId: string, tick: number, hash: string): void {
    for (const [pid, conn] of this.connections) {
      if (pid === playerId) continue;
      if (conn.paused) continue;
      conn.transport.deliverPeerChecksum(playerId, tick, hash);
    }
  }

  receiveAck(playerId: string, tick: number): void {
    const prev = this.acks.get(playerId) ?? -1;
    if (tick > prev) this.acks.set(playerId, tick);
  }

  /** Merge, broadcast and advance one tick. Returns the merged command list. */
  advanceTick(): Command[] {
    const merged = this.merge(this.pending, this.tick);
    this.pending = this.pending.filter((p) => p.forTick !== this.tick);
    this.history.push({ tick: this.tick, cmds: merged });
    for (const conn of this.connections.values()) {
      if (conn.paused) conn.held.push({ tick: this.tick, cmds: merged });
      else conn.transport.deliverTick(this.tick, merged);
    }
    this.tick++;
    return merged;
  }

  /**
   * The relay's merge rule, reproduced exactly: group by player, then emit in ascending player-id order.
   *
   * The grouping is what makes the merge deterministic. Without it, the order would depend on the order the
   * relay happened to receive submissions in — which is network timing, and therefore different on every peer.
   */
  private merge(pending: PendingCommand[], tick: number): Command[] {
    const byPlayer = new Map<string, Command[]>();
    for (const p of pending) {
      if (p.forTick !== tick) continue;
      const list = byPlayer.get(p.playerId) ?? [];
      list.push(...p.cmds);
      byPlayer.set(p.playerId, list);
    }
    const out: Command[] = [];
    for (const pid of [...byPlayer.keys()].sort()) out.push(...byPlayer.get(pid)!);
    return out;
  }

  /** Lowest ack across connected peers — how far every peer has consumed. */
  slowestAck(): number {
    let min = Infinity;
    for (const [pid, conn] of this.connections) {
      if (conn.paused) continue;
      min = Math.min(min, this.acks.get(pid) ?? -1);
    }
    return min === Infinity ? -1 : min;
  }
}

export class InProcessRelay {
  private readonly rooms = new Map<string, InProcessRoom>();

  createRoom(roomId: string, seed: number, playerIds: string[], opts: InProcessRelayOptions = {}): InProcessRoom {
    const room = new InProcessRoom(seed, playerIds, opts);
    this.rooms.set(roomId, room);
    return room;
  }

  room(roomId: string): InProcessRoom | undefined {
    return this.rooms.get(roomId);
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}
