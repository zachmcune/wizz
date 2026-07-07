// Lockstep client: buffers local commands with input delay and surfaces confirmed per-tick lists.
// Every peer runs the identical sim; transport merges all players' commands per tick.
import type { Command } from '../sim/types';
import { INPUT_DELAY_TICKS } from './protocol';

export interface Transport {
  send(forTick: number, cmds: Command[]): void;
  reportChecksum(tick: number, hash: string): void;
  onTickCommands(cb: (tick: number, cmds: Command[]) => void): void;
  onPeerChecksum(cb: (playerId: string, tick: number, hash: string) => void): void;
}

/**
 * Buffers local commands with input delay and surfaces confirmed per-tick command lists.
 * Integrates with Simulation.enqueue(tick, cmds) once the relay confirms a tick.
 */
export class LockstepClient {
  private confirmed = new Map<number, Command[]>();
  private peerHashes = new Map<number, Map<string, string>>();

  constructor(private transport: Transport) {
    transport.onTickCommands((tick, cmds) => this.confirmed.set(tick, cmds));
    transport.onPeerChecksum((playerId, tick, hash) => {
      let m = this.peerHashes.get(tick);
      if (!m) {
        m = new Map();
        this.peerHashes.set(tick, m);
      }
      m.set(playerId, hash);
    });
  }

  submitLocal(currentTick: number, cmds: Command[]): void {
    if (!cmds.length) return;
    this.transport.send(currentTick + INPUT_DELAY_TICKS, cmds);
  }

  isTickReady(tick: number): boolean {
    return this.confirmed.has(tick);
  }

  commandsForTick(tick: number): Command[] | undefined {
    return this.confirmed.get(tick);
  }

  /** Drop confirmed ticks and peer checksums older than `before` to bound memory. */
  pruneBefore(before: number): void {
    for (const tick of [...this.confirmed.keys()]) {
      if (tick < before) this.confirmed.delete(tick);
    }
    for (const tick of [...this.peerHashes.keys()]) {
      if (tick < before) this.peerHashes.delete(tick);
    }
  }

  /** Compare our checksum against peers; returns the set of desynced players (if known). */
  detectDesync(tick: number, ownHash: string): string[] {
    this.transport.reportChecksum(tick, ownHash);
    const peers = this.peerHashes.get(tick);
    if (!peers) return [];
    const bad: string[] = [];
    for (const [pid, h] of peers) if (h !== ownHash) bad.push(pid);
    return bad;
  }
}
