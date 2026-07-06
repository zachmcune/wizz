// V2 lockstep client scaffolding. Deterministic lockstep only sends per-tick command lists;
// every client runs the identical sim. This file defines the seams; it is NOT used in V1.
//
// Do NOT start wiring multiplayer before V1 ships and the sim is proven deterministic
// (see tests/determinism.test.ts and docs/DETERMINISM.md).
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
 * A future integration point for Simulation.enqueue(tick, cmds).
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
    this.transport.send(currentTick + INPUT_DELAY_TICKS, cmds);
  }

  commandsForTick(tick: number): Command[] | undefined {
    return this.confirmed.get(tick);
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
