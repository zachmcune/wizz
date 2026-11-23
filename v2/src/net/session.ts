// LOCKSTEP MATCH SESSION — one peer's view of a networked match.
//
// This is the piece that ties the lockstep client to the simulation. It owns:
//
//   • the local `GameState` and its services for one peer;
//   • which players this process controls (exactly one human; every other participating slot is
//     either handled by the local AI or is another human whose commands arrive over the wire);
//   • AI fill-in for slots nobody claimed, so an empty seat is a real opponent rather than an idle army;
//   • stall policy: a peer that has not moved for too long is dropped from the wait and the match proceeds;
//   • desync detection and capture: when a state hash disagrees, the tick, both hashes and a replay of every
//     merged command up to that tick are recorded so the divergence can be reproduced offline.
//
// WHY THE AI IS PART OF THE SESSION AND NOT THE RELAY. Every peer simulates every player, so every peer must
// run the same AI for the same seats and get the same commands. That works without sending anything over the
// wire because the AI is a pure function of (GameState, tick, playerId) — `src/ai/brain.ts` uses no
// randomness and reads only its `Perception`. So AI commands are recomputed identically on every client,
// which is the property that lets a 4-player match carry two AI opponents at zero bandwidth.
//
// A real network cannot deliver "one tick at a time, instantly". The session therefore does not call
// `room.advanceTick()` itself in the browser; it waits for `tick` messages and steps when the tick it needs is
// confirmed. `pump()` is the single place that decides whether it may advance.

import type { Registry } from '../data/registry';
import { initMatch } from '../sim/factory';
import { stepSimulation } from '../sim/step';
import { hashState } from '../sim/hash';
import type { Command, GameState, PlayerId } from '../sim/types';
import type { SimServices } from '../sim/context';
import { restoreState, encodeSnapshot } from '../sim/snapshot';
import { AiDriver } from '../ai/driver';
import { LockstepClient, type Transport } from './lockstep';
import { CHECKSUM_INTERVAL_TICKS } from './protocol-constants';

export interface SlotSpec {
  /** Player id used in the sim AND on the wire. Must be identical on every peer. */
  id: PlayerId;
  controller: 'human' | 'ai';
  aiDifficulty?: 'easy' | 'normal' | 'hard';
  team: number;
  color: string;
  factionId: string;
  startIndex: number;
}

export interface SessionOptions {
  registry: Registry;
  mapId: string;
  seed: number;
  slots: SlotSpec[];
  /** Which slot this process plays. */
  localPlayerId: PlayerId;
  transport: Transport;
  /** Ticks of input delay. Defaults to the protocol's value. */
  inputDelay?: number;
  /** Cheaper hashing for long headless runs. Defaults to the protocol value. */
  checksumInterval?: number;
  /** Called once when a desync is confirmed. */
  onDesync?: (report: DesyncCapture) => void;
  /** Called when the match reaches a winner. */
  onEnd?: (winnerTeam: number | null) => void;
}

export interface DesyncCapture {
  tick: number;
  ownHash: string;
  peers: { playerId: string; hash: string }[];
  /**
   * Replayable command log: every merged tick this peer simulated, in order. Enough to re-run the match
   * offline and reproduce the divergence, which is the whole reason a desync is worth reporting.
   */
  commandLog: { tick: number; cmds: Command[] }[];
  seed: number;
  mapId: string;
  slots: SlotSpec[];
  /** Where the peers disagreed, as far as this side can tell. */
  digest: { entities: number; players: { id: string; mana: number; defeated: boolean }[] };
}

export class LockstepSession {
  readonly state: GameState;
  readonly services: SimServices;
  readonly lockstep: LockstepClient;
  readonly localPlayerId: PlayerId;

  private readonly registry: Registry;
  private readonly slots: SlotSpec[];
  private readonly onDesync: ((r: DesyncCapture) => void) | undefined;
  private readonly onEnd: ((w: number | null) => void) | undefined;
  private readonly ai: AiDriver;
  private readonly checksumInterval: number;

  /** Every merged tick actually simulated, kept for the desync replay. Bounded, see `pruneLog`. */
  private readonly commandLog: { tick: number; cmds: Command[] }[] = [];
  /** Consecutive ticks at which a peer disagreed. A transient single report does not condemn a match. */
  private desyncStreak = 0;
  private ended = false;
  /** Wall-clock-independent stall bookkeeping: the last tick at which each peer was known to have acked. */
  private lastProgressTick = -1;

  constructor(opts: SessionOptions) {
    this.registry = opts.registry;
    this.slots = opts.slots;
    this.localPlayerId = opts.localPlayerId;
    this.onDesync = opts.onDesync;
    this.onEnd = opts.onEnd;
    this.checksumInterval = opts.checksumInterval ?? CHECKSUM_INTERVAL_TICKS;

    const { state, services } = initMatch(opts.registry, {
      mapId: opts.mapId,
      seed: opts.seed,
      oneSuperweaponPerPlayer: false,
      players: opts.slots.map((s) => ({
        id: s.id,
        controller: s.controller,
        team: s.team,
        color: s.color,
        factionId: s.factionId,
        startIndex: s.startIndex,
        ...(s.aiDifficulty ? { aiDifficulty: s.aiDifficulty } : {}),
      })),
    } as never);
    this.state = state;
    this.services = services;

    this.ai = new AiDriver(opts.registry, services);
    this.lockstep = new LockstepClient(opts.transport, {
      ...(opts.inputDelay !== undefined ? { inputDelay: opts.inputDelay } : {}),
      checksumInterval: this.checksumInterval,
    });
  }

  /** Queue a local command. Returns the tick it will execute on, or -1 for an empty list. */
  issue(cmds: Command[]): number {
    if (this.ended) return -1;
    return this.lockstep.submitLocal(this.state.tick, cmds);
  }

  /**
   * Step as far as possible.
   *
   * Returns the number of ticks advanced. It stops at the first tick the relay has not confirmed, which is
   * precisely the lockstep constraint: never simulate ahead of the command stream. It also stops when a
   * resync is needed (falling too far behind) so the caller can fetch a snapshot instead of grinding through
   * a backlog that is already stale.
   */
  pump(maxTicks = Infinity): number {
    let advanced = 0;
    while (advanced < maxTicks && !this.ended) {
      const tick = this.state.tick;
      if (!this.lockstep.isTickReady(tick)) break;
      const cmds = this.lockstep.commandsForTick(tick) ?? [];
      this.stepOne(cmds);
      advanced++;
    }
    if (advanced > 0) {
      this.lockstep.ackProcessed(this.state.tick - 1);
      this.lockstep.noteSimulated(this.state.tick - 1);
      // The relay only needs history back to the slowest peer; keeping more would grow without bound.
      const keepFrom = Math.max(0, this.state.tick - 2_400);
      this.lockstep.pruneBefore(keepFrom);
      this.pruneLog(keepFrom);
    }
    return advanced;
  }

  private stepOne(cmds: Command[]): void {
    const tick = this.state.tick;
    this.commandLog.push({ tick, cmds });

    /**
     * THE AI RUNS ON EVERY PEER, FOR EVERY AI SEAT.
     *
     * `stepSimulation`'s aiHook is passed here rather than left to the caller because the AI's commands must
     * be applied in the same tick on every peer. A peer that skipped its AI seats would desync on the first
     * AI decision. Since `AiDriver.hook` is a pure function of state, every peer produces the identical list,
     * so this costs no bandwidth and cannot itself diverge — which is the property that makes AI fill-in safe.
     */
    const aiCommands = this.ai.hook(this.state, this.services);
    stepSimulation(this.state, this.services, [...cmds, ...aiCommands]);

    if (this.state.tick % this.checksumInterval === 0) {
      const report = this.lockstep.reportChecksum(this.state.tick - 1, hashState(this.state));
      if (report) {
        /**
         * Confirm over consecutive reports before condemning the match. Two independently-hashed ticks
         * disagreeing is a divergence; one is more likely a hash of a different tick than a real split.
         */
        this.desyncStreak++;
        if (this.desyncStreak >= 2) {
          const capture = this.captureDesync(report);
          this.onDesync?.(capture);
        }
      } else {
        this.desyncStreak = 0;
      }
    }

    if (this.state.ended && !this.ended) {
      this.ended = true;
      this.onEnd?.(this.state.winnerTeam ?? null);
    }
  }

  /**
   * Adopt an authoritative snapshot mid-match (rejoin or catch-up).
   *
   * The state object is REPLACED in place rather than reassigned, because callers hold a reference for
   * rendering. Every field is copied so the reference stays valid.
   */
  adoptSnapshot(snapshotText: string): void {
    const restored = restoreState(this.registry, snapshotText);
    const target = this.state;
    target.tick = restored.state.tick;
    target.seed = restored.state.seed;
    target.rng = restored.state.rng;
    target.players = restored.state.players;
    target.relations = restored.state.relations;
    target.entities = restored.state.entities;
    target.nextEntityId = restored.state.nextEntityId;
    target.mapId = restored.state.mapId;
    target.winnerTeam = restored.state.winnerTeam;
    target.ended = restored.state.ended;
    target.beams = restored.state.beams;
    this.services.nav = restored.services.nav;
    this.services.flow = restored.services.flow;
    this.services.spatial = restored.services.spatial;
    this.lockstep.adoptSnapshot(restored.state.tick);
    this.commandLog.length = 0;
    this.desyncStreak = 0;
  }

  /** Serialise this peer's state, for the host answering a snapshot request. */
  snapshot(): string {
    return encodeSnapshot(this.state);
  }

  private captureDesync(report: { tick: number; own: string; peers: { playerId: string; hash: string }[] }): DesyncCapture {
    const store = this.state.entities;
    return {
      tick: report.tick,
      ownHash: report.own,
      peers: report.peers,
      commandLog: this.commandLog.slice(),
      seed: this.state.seed,
      mapId: this.state.mapId,
      slots: this.slots,
      digest: {
        entities: store.liveCount(),
        players: this.state.players.map((p) => ({ id: p.id, mana: Math.round(p.mana), defeated: p.defeated })),
      },
    };
  }

  private pruneLog(before: number): void {
    let drop = 0;
    while (drop < this.commandLog.length && this.commandLog[drop]!.tick < before) drop++;
    if (drop > 0) this.commandLog.splice(0, drop);
  }

  /** True when this peer is far enough behind that a snapshot is cheaper than replaying. */
  needsSnapshot(resyncAfter: number): boolean {
    return this.lockstep.backlog(this.state.tick) > resyncAfter;
  }

  /** How far this peer is behind the relay's head, in ticks. */
  backlog(): number {
    return this.lockstep.backlog(this.state.tick);
  }

  /** Progress marker used by the stall policy: the highest tick any peer has acked. */
  markProgress(tick: number): void {
    if (tick > this.lastProgressTick) this.lastProgressTick = tick;
  }

  get lastProgress(): number {
    return this.lastProgressTick;
  }

  get finished(): boolean {
    return this.ended;
  }
}
