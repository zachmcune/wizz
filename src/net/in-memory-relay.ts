// In-memory lockstep relay for tests and local two-player dev. Mirrors the wire protocol
// merge semantics without WebSockets.
import type { Command, PlayerId } from '../sim/types';
import type { Transport } from './lockstep';

interface PendingCommand {
  playerId: PlayerId;
  forTick: number;
  cmds: Command[];
}

interface ChecksumReport {
  playerId: PlayerId;
  tick: number;
  hash: string;
}

class RelayTransport implements Transport {
  private tickCb: ((tick: number, cmds: Command[]) => void) | null = null;
  private peerCb: ((playerId: string, tick: number, hash: string) => void) | null = null;

  constructor(
    private room: InMemoryRelayRoom,
    private playerId: PlayerId,
  ) {}

  send(forTick: number, cmds: Command[]): void {
    this.room.receiveCommands(this.playerId, forTick, cmds);
  }

  reportChecksum(tick: number, hash: string): void {
    this.room.receiveChecksum(this.playerId, tick, hash);
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

  deliverPeerChecksum(playerId: PlayerId, tick: number, hash: string): void {
    if (playerId === this.playerId) return;
    this.peerCb?.(playerId, tick, hash);
  }
}

class InMemoryRelayRoom {
  readonly seed: number;
  readonly playerIds: PlayerId[];
  private transports = new Map<PlayerId, RelayTransport>();
  private pending: PendingCommand[] = [];
  private checksums: ChecksumReport[] = [];

  constructor(seed: number, playerIds: PlayerId[]) {
    this.seed = seed;
    this.playerIds = [...playerIds];
  }

  connect(playerId: PlayerId): Transport {
    if (!this.playerIds.includes(playerId)) {
      throw new Error(`Unknown player ${playerId}`);
    }
    const existing = this.transports.get(playerId);
    if (existing) return existing;
    const transport = new RelayTransport(this, playerId);
    this.transports.set(playerId, transport);
    return transport;
  }

  receiveCommands(playerId: PlayerId, forTick: number, cmds: Command[]): void {
    if (!cmds.length) return;
    this.pending.push({ playerId, forTick, cmds });
  }

  receiveChecksum(playerId: PlayerId, tick: number, hash: string): void {
    this.checksums.push({ playerId, tick, hash });
    for (const [pid, transport] of this.transports) {
      if (pid !== playerId) transport.deliverPeerChecksum(playerId, tick, hash);
    }
  }

  /** Merge and broadcast confirmed commands for a sim tick. */
  advanceTick(tick: number): Command[] {
    const merged = mergePending(this.pending, tick);
    this.pending = this.pending.filter((p) => p.forTick !== tick);
    for (const transport of this.transports.values()) {
      transport.deliverTick(tick, merged);
    }
    return merged;
  }
}

function mergePending(pending: PendingCommand[], tick: number): Command[] {
  const byPlayer = new Map<PlayerId, Command[]>();
  for (const p of pending) {
    if (p.forTick !== tick) continue;
    const list = byPlayer.get(p.playerId) ?? [];
    list.push(...p.cmds);
    byPlayer.set(p.playerId, list);
  }
  const merged: Command[] = [];
  for (const pid of [...byPlayer.keys()].sort()) {
    merged.push(...byPlayer.get(pid)!);
  }
  return merged;
}

export class InMemoryRelay {
  private rooms = new Map<string, InMemoryRelayRoom>();

  createRoom(roomId: string, seed: number, playerIds: PlayerId[]): InMemoryRelayRoom {
    const room = new InMemoryRelayRoom(seed, playerIds);
    this.rooms.set(roomId, room);
    return room;
  }

  room(roomId: string): InMemoryRelayRoom | undefined {
    return this.rooms.get(roomId);
  }
}

export type { InMemoryRelayRoom };
