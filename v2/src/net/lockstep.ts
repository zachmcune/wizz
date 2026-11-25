// LOCKSTEP CLIENT — input-delay buffering, tick confirmation, and desync detection.
//
// THE MODEL. Every peer runs the identical simulation. The relay owns a monotonically increasing tick and,
// for each tick, broadcasts the merged commands every peer submitted for it. A client therefore never
// simulates a tick whose command list it has not received. That is the invariant this class exists to hold.
//
// INPUT DELAY. A command issued at local tick 40 must appear at a tick no peer has already simulated, and
// must arrive back from the relay before that tick is due. Commands are therefore scheduled at
// `max(localTick, relayHead) + INPUT_DELAY_TICKS`. At 20 Hz that is 300 ms of round-trip budget.
//
// GAP FILLING. The relay sends one message per tick and WebSocket delivery is ordered, so a missing tick
// normally means "not sent yet". A gap can only appear if the relay skipped ahead, which it does while a
// stalled peer is excluded from pacing — so gaps are filled with EMPTY command lists rather than being
// waited on forever. Filling with empty is always correct: a tick with no commands is a legal tick.
//
// DESYNC DETECTION. Each peer hashes its state every `CHECKSUM_INTERVAL_TICKS` and the relay fans that
// hash out to the others. A peer compares every arriving peer hash against its own for the same tick. When
// they differ, `desync` is raised once, with both hashes recorded, so the caller can capture a replay
// instead of merely noticing.
//
// This module is transport-agnostic on purpose: `Transport` is a three-method interface, which is what
// lets `tests/net/*` drive a whole 4-player match through an in-process relay with no sockets and no
// timing, and lets the same client run over a real WebSocket in the browser.

import type { Command } from '../sim/types';
import { ACK_EVERY_TICKS, INPUT_DELAY_TICKS } from './protocol-constants';

export interface Transport {
  /** Submit commands to be executed on `forTick`. */
  send(forTick: number, cmds: Command[]): void;
  /** Publish this peer's state hash at `tick` so others can compare. */
  reportChecksum(tick: number, hash: string): void;
  /** Tell the relay the highest tick this peer has fully processed. */
  ackTick(tick: number): void;
  onTickCommands(cb: (tick: number, cmds: Command[]) => void): void;
  onPeerChecksum(cb: (playerId: string, tick: number, hash: string) => void): void;
}

export interface DesyncReport {
  tick: number;
  /** This client's hash for the tick. */
  own: string;
  /** Every peer whose hash differed, with the hash it reported. */
  peers: { playerId: string; hash: string }[];
}

export interface LockstepOptions {
  /** Override the input buffer, for latency simulation in tests. */
  inputDelay?: number;
  checksumInterval?: number;
  /** Cap on remembered ticks before the oldest are pruned. */
  retainTicks?: number;
}

export class LockstepClient {
  /** Confirmed command lists by tick. A tick present here may be simulated. */
  private readonly confirmed = new Map<number, Command[]>();
  /** Peer hashes by tick, then by player. */
  private readonly peerHashes = new Map<number, Map<string, string>>();
  private lastReceivedTick = -1;
  /** Next tick the relay will advance to (one past the latest tick message). */
  private relayHead = 0;
  private lastAckedTick = -1;
  private highestSimulatedTick = -1;
  private desyncEmittedAt: number | null = null;

  readonly inputDelay: number;
  readonly checksumInterval: number;
  private readonly retainTicks: number;

  /** Set once a desync has been confirmed. The caller decides what to do; this class does not lie. */
  desync: DesyncReport | null = null;

  constructor(
    private readonly transport: Transport,
    opts: LockstepOptions = {},
  ) {
    this.inputDelay = opts.inputDelay ?? INPUT_DELAY_TICKS;
    this.checksumInterval = opts.checksumInterval ?? 60;
    this.retainTicks = opts.retainTicks ?? 2_400; // two sim-minutes

    transport.onTickCommands((tick, cmds) => this.ingestTick(tick, cmds));
    transport.onPeerChecksum((playerId, tick, hash) => this.ingestPeerChecksum(playerId, tick, hash));
  }

  // ─────────────────────────────────────────────────────────── inbound ticks

  private ingestTick(tick: number, cmds: Command[]): void {
    if (tick < 0) return;
    /**
     * A LATE ARRIVAL WITH REAL COMMANDS MUST NOT BE DISCARDED.
     *
     * Duplicates used to be dropped unconditionally, which is right for an exact re-delivery. But a tick can
     * legitimately arrive twice: once as a GAP FILLER (an empty list synthesized because the relay had already
     * moved on) and once for real, when a delayed message finally lands. The old code kept the empty filler and
     * threw away the actual commands, so that tick was simulated with no orders on this peer and with orders on
     * every other — a guaranteed desync.
     *
     * The rule is therefore: an EMPTY list never replaces a non-empty one.
     */
    const existing = this.confirmed.get(tick);
    if (existing !== undefined) {
      if (existing.length === 0 && cmds.length > 0) this.confirmed.set(tick, cmds);
      return;
    }

    if (this.lastReceivedTick >= 0 && tick > this.lastReceivedTick + 1) {
      /**
       * FILL THE GAP WITH EMPTY TICKS.
       *
       * The relay advances while a stalled peer is excluded from pacing, so a client returning from a
       * hitch can receive tick 900 immediately after tick 400. Waiting for the missing ticks would
       * deadlock: the relay will never send them again. An empty command list is a legal simulation
       * input, so the gap is filled and the sim catches up instead of stopping.
       */
      for (let t = this.lastReceivedTick + 1; t < tick; t++) {
        if (!this.confirmed.has(t)) this.confirmed.set(t, []);
      }
    }

    this.confirmed.set(tick, cmds);
    if (tick > this.lastReceivedTick) this.lastReceivedTick = tick;
    this.relayHead = this.lastReceivedTick + 1;
  }

  private ingestPeerChecksum(playerId: string, tick: number, hash: string): void {
    let atTick = this.peerHashes.get(tick);
    if (!atTick) {
      atTick = new Map();
      this.peerHashes.set(tick, atTick);
    }
    atTick.set(playerId, hash);
  }

  // ─────────────────────────────────────────────────────────── outbound commands

  /** The tick a command issued now should execute on. */
  scheduleForTick(localTick: number): number {
    return Math.max(localTick, this.relayHead) + this.inputDelay;
  }

  /**
   * Submit a local command.
   *
   * Returns the tick it was scheduled for so the caller can render the feedback ("move acknowledged,
   * executing in 6 ticks") if it wants to. Returns -1 for an empty command list, which is not sent at all
   * — there is nothing to merge and the relay would only forward an empty array.
   */
  submitLocal(localTick: number, cmds: Command[]): number {
    if (cmds.length === 0) return -1;
    const forTick = this.scheduleForTick(localTick);
    this.transport.send(forTick, cmds);
    return forTick;
  }

  // ─────────────────────────────────────────────────────────── simulation gating

  /** True when the relay has confirmed tick `tick` and it may be simulated. */
  isTickReady(tick: number): boolean {
    return this.confirmed.has(tick);
  }

  commandsForTick(tick: number): Command[] | undefined {
    return this.confirmed.get(tick);
  }

  hasReceivedTicks(): boolean {
    return this.lastReceivedTick >= 0;
  }

  lastConfirmedTick(): number {
    return this.lastReceivedTick;
  }

  /** How many confirmed ticks are still ahead of `simTick`, i.e. how far behind this peer is. */
  backlog(simTick: number): number {
    return Math.max(0, this.lastReceivedTick + 1 - simTick);
  }

  /** Record that a tick was simulated (used for acking and for pruning). */
  noteSimulated(tick: number): void {
    if (tick > this.highestSimulatedTick) this.highestSimulatedTick = tick;
  }

  highestSimulated(): number {
    return this.highestSimulatedTick;
  }

  /**
   * Ack processed progress so the relay can pace to the slowest peer.
   *
   * Throttled: at most once per `ACK_EVERY_TICKS`, and never to a lower tick. The first ack after a
   * snapshot jump bypasses the throttle via `ackNow`, because the relay's pacing set must learn about the
   * jump immediately or it will keep waiting on a peer that has already caught up.
   */
  ackProcessed(tick: number): void {
    if (tick < 0 || tick <= this.lastAckedTick) return;
    if (this.lastAckedTick >= 0 && tick - this.lastAckedTick < ACK_EVERY_TICKS) return;
    this.lastAckedTick = tick;
    this.transport.ackTick(tick);
  }

  ackNow(tick: number): void {
    if (tick < 0) return;
    if (tick > this.lastAckedTick) this.lastAckedTick = tick;
    this.transport.ackTick(tick);
  }

  // ─────────────────────────────────────────────────────────── determinism checks

  /**
   * Report and compare this tick's state hash.
   *
   * Called from the match loop every `checksumInterval` ticks. The hash is sent to the relay (which fans it
   * out) and simultaneously compared against every peer hash already received for the same tick.
   *
   * A single differing hash is NOT enough to declare a desync: a peer could legitimately have reached the
   * tick on a different path only if it also missed a command, and the relay redelivers nothing. In
   * practice a real desync repeats, so the caller is told immediately and may choose to confirm over
   * consecutive ticks. Reporting early is the right default — a desync that is caught on the first differing
   * tick gives a much more useful replay than one noticed three seconds later.
   */
  reportChecksum(tick: number, ownHash: string): DesyncReport | null {
    this.transport.reportChecksum(tick, ownHash);
    const peers = this.peerHashes.get(tick);
    if (!peers) return null;

    const differing: { playerId: string; hash: string }[] = [];
    for (const [pid, hash] of peers) {
      if (hash !== ownHash) differing.push({ playerId: pid, hash });
    }
    if (differing.length === 0) return null;

    // One report per tick, even if several peers disagree — the first is the useful one.
    if (this.desyncEmittedAt === tick) return null;
    this.desyncEmittedAt = tick;
    const report: DesyncReport = { tick, own: ownHash, peers: differing };
    this.desync = report;
    return report;
  }

  /** Peer hash for a tick, for the desync UI and for tests. */
  peerHashAt(tick: number, playerId: string): string | undefined {
    return this.peerHashes.get(tick)?.get(playerId);
  }

  /**
   * Drop per-tick data that no peer can still need.
   *
   * Called with the tick the slowest peer has passed. Without this a 25-minute match retains every command
   * list and every peer hash it ever saw, which is unbounded memory growth in exactly the long match the
   * PWA budget cares about.
   */
  pruneBefore(tick: number): void {
    for (const t of this.confirmed.keys()) if (t < tick) this.confirmed.delete(t);
    for (const t of this.peerHashes.keys()) if (t < tick) this.peerHashes.delete(t);
    if (this.confirmed.size > this.retainTicks) {
      const excess = [...this.confirmed.keys()].sort((a, b) => a - b).slice(0, this.confirmed.size - this.retainTicks);
      for (const t of excess) this.confirmed.delete(t);
    }
  }

  /** Reset after a snapshot jump: every tick at or before `fromTick` is already reflected in the state. */
  adoptSnapshot(fromTick: number): void {
    this.pruneBefore(fromTick + 1);
    if (fromTick > this.lastReceivedTick) {
      this.lastReceivedTick = fromTick;
      this.relayHead = fromTick + 1;
    }
    this.highestSimulatedTick = Math.max(this.highestSimulatedTick, fromTick);
    this.ackNow(fromTick);
  }
}
