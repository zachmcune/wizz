// MULTI-PEER HARNESS — run N lockstep sessions through a relay with controlled time.
//
// The point of this file is to make multiplayer testable at all. A real match is 20 ticks per second against a
// real socket, so a 3-minute test would take 3 real minutes and could not inject a network fault at a chosen
// tick. Here the relay clock is driven by the harness, so:
//
//   • a full 20-minute match runs in seconds of CPU;
//   • latency and jitter are injected deterministically (a fixed tick delay, not a real timer);
//   • a stall, a disconnect and a rejoin happen at exactly the tick the test names;
//   • the same run produces byte-identical results every time, so a failure is reproducible.
//
// WHAT IS AND IS NOT FAKED. The relay merge rule, the lockstep buffering, the input delay, the AI, the sim and
// the state hash are all the real implementations. Only the passage of wall-clock time is driven by a loop
// counter instead of a timer. That is the correct trade: timing is what needs control, and timing is also the
// only thing whose fidelity a real-socket test in CI would add — which is why the Playwright run exists as the
// other half of the proof.

import type { Registry } from '../data/registry';
import { InProcessRelay, type InProcessRoom } from './in-process-relay';
import { LockstepSession, type DesyncCapture, type SlotSpec } from './session';
import { BotClient } from './bot-client';
import { hashState } from '../sim/hash';
import { CHECKSUM_INTERVAL_TICKS } from './protocol-constants';

export interface PeerSpec extends SlotSpec {
  /**
   * Fixed one-way delivery delay in ticks, applied to this peer's view of the relay.
   *
   * Implemented by holding its `tick` messages in a queue rather than by a timer, so it is exact and
   * reproducible. A peer with `latencyTicks: 3` simply learns about tick T three relay ticks late.
   */
  latencyTicks?: number;
  /** Random extra delay, in ticks, added per message from a seeded generator. */
  jitterTicks?: number;
  /** Deterministic seed for the jitter stream, so a jittered run is reproducible. */
  jitterSeed?: number;
}

/**
 * Per-peer simulation counts, sampled by the harness for measurement harnesses.
 *
 * Counts only — no positions, no state handle — so exposing them to an audit script cannot change what a match does.
 */
export interface PeerStats {
  army: number;
  harvesters: number;
  buildings: number;
  refineries: number;
  mana: number;
}

export interface MatchHarnessOptions {  registry: Registry;
  mapId: string;
  seed: number;
  peers: PeerSpec[];
  /** Slots with no peer: filled by the local AI on every client. */
  aiSlots?: SlotSpec[];
  /**
   * Give every human seat a real AI brain whose commands travel OVER THE NETWORK.
   *
   * This is what makes a headless "full match" meaningful: without it the peers sit idle and the run proves
   * only that two identical idle simulations agree. Each bot decides locally and submits through the same
   * input-delay channel a human's click uses, so the sync property is measured on the real command path.
   */
  botHumans?: boolean;
  /** Difficulty for the bot-controlled human seats. Defaults to 'normal'. */
  botDifficulty?: 'easy' | 'normal' | 'hard';
  /** Ticks to run before giving up. Defaults to 35 sim-minutes. */
  maxTicks?: number;
  checksumInterval?: number;
  /** Inject a divergence deliberately, to prove detection works. Called with the session's player id. */
  corruptPeer?: (playerId: string, tick: number, session: LockstepSession) => void;
  /**
   * Observe every command a bot submits, for MEASUREMENT only.
   *
   * The activity floor in `tests/net/latency-jitter.test.ts` asks whether the channel was used at all; when it dips it
   * says nothing about WHICH commands went missing. A tally by type and minute is what separates "the AI stopped
   * producing" from "the AI stopped building", so the diagnosis is a measurement rather than a reading of the code.
   * Nothing in the harness reads this back, so it cannot change a result.
   */
  onPeerCommands?: (playerId: string, tick: number, cmds: readonly { type: string }[]) => void;
  /**
   * Observe every decision pass, including the ones that produced NO command.
   *
   * A peer's activity floor can fall for a reason that never appears in the command stream at all — the planner choosing to
   * save instead of to train. The notes are where that decision is stated, so a tally of notes is the measurement that
   * separates "the army is parked" from "the economy is holding the bank".
   */
  onPeerDecision?: (playerId: string, tick: number, notes: readonly string[]) => void;
  /**
   * Per-peer simulation statistics, sampled by the harness, for MEASUREMENT only.
   *
   * `issued` alone cannot distinguish "the AI stopped producing" from "the AI stopped moving", and the two have completely
   * different fixes. This exposes the counts that separate them — army, harvesters, buildings, refineries, bank — without
   * giving the caller the state, so a harness cannot change a result through it.
   */
  onPeerStats?: (playerId: string, tick: number, stats: PeerStats) => void;
  /**
   * Disconnect and later rejoin a peer, to prove recovery.
   *
   * `atTick` is a relay tick. The listed peer stops receiving broadcasts at that tick and is reconnected at
   * `backAtTick`, at which point it must both catch up and stay in sync — the whole point of the rejoin path.
   */
  dropPeer?: { playerId: string; atTick: number; backAtTick: number };
  /** Recorded so a test can assert the drop and rejoin actually happened. */
}

export interface PeerOutcome {
  playerId: string;
  finalHash: string;
  finalTick: number;
  ended: boolean;
  winnerTeam: number | null;
  /** Commands this peer issued over the wire. */
  issued: number;
  desync: DesyncCapture | null;
}

export interface MatchHarnessResult {  outcomes: PeerOutcome[];
  /** Ticks the relay advanced. */
  relayTicks: number;
  /** True when every peer's final hash and tick agree. */
  inSync: boolean;
  /** Per-checksum-interval divergence events, in order. */
  desyncEvents: { tick: number; playerId: string; peers: string[] }[];
}

/** A deterministic 32-bit hash → [0, n) generator for jitter, so a run is repeatable. */
function jitterAt(seed: number, tick: number, n: number): number {
  if (n <= 0) return 0;
  let h = (seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) % n;
}

/**
 * Buffered transport wrapper that delays tick and checksum delivery by a per-peer amount.
 *
 * Delivery is driven by the harness's relay clock, not by real time: `flush(relayTick)` releases everything
 * scheduled for a relay tick at or before the current one. That models a network where message T arrives
 * `latency + jitter` ticks after the relay sent it.
 *
 * ORDERING IS PRESERVED — AND THAT IS NOT A SIMPLIFICATION. A WebSocket is a TCP stream: the browser guarantees
 * that message N arrives before message N+1. If this class allowed a jittered tick to overtake an earlier one, it
 * would model a network that does not exist, and the lockstep client would be tested against a situation it can
 * never face. Measured: with reordering allowed, a gap-filled tick's real commands were dropped and the match
 * desynced at tick 119 — a failure of the fake network, not of the client.
 *
 * So the effective delay is `max(own deadline, previous message's deadline)`: jitter can make any given message
 * later than its nominal slot, but never earlier than the one before it.
 */
class DelayedTransport {
  private readonly queue: { dueTick: number; deliver: () => void }[] = [];
  /** The due tick of the most recently scheduled message, so delivery can never move backwards. */
  private lastDue = 0;

  constructor(
    private readonly inner: import('./lockstep').Transport,
    private readonly baseLatency: number,
    private readonly jitter: number,
    private readonly jitterSeed: number,
  ) {}

  private schedule(relayTick: number, deliver: () => void): void {
    const extra = jitterAt(this.jitterSeed, relayTick, this.jitter);
    // Monotonic: preserve stream order the way TCP does.
    const dueTick = Math.max(this.lastDue, relayTick + this.baseLatency + extra);
    this.lastDue = dueTick;
    this.queue.push({ dueTick, deliver });
  }

  flush(relayTick: number): void {
    // Deliver in queue (== stream) order everything whose deadline has passed.
    while (this.queue.length > 0 && this.queue[0]!.dueTick <= relayTick) {
      const head = this.queue.shift()!;
      head.deliver();
    }
  }

  get transport(): import('./lockstep').Transport {
    return {
      send: (forTick, cmds) => this.inner.send(forTick, cmds),
      reportChecksum: (tick, hash) => this.inner.reportChecksum(tick, hash),
      ackTick: (tick) => this.inner.ackTick(tick),
      onTickCommands: (cb) => this.inner.onTickCommands((tick, cmds) => this.schedule(tick, () => cb(tick, cmds))),
      onPeerChecksum: (cb) => this.inner.onPeerChecksum((pid, tick, hash) => this.schedule(tick, () => cb(pid, tick, hash))),
    };
  }
}

export function runMatchThroughRelay(opts: MatchHarnessOptions): MatchHarnessResult {
  const relay = new InProcessRelay();
  const room: InProcessRoom = relay.createRoom('test', opts.seed, opts.peers.map((p) => p.id));

  const allSlots: SlotSpec[] = [
    ...opts.peers.map((p) => ({
      id: p.id,
      controller: p.controller,
      team: p.team,
      color: p.color,
      factionId: p.factionId,
      startIndex: p.startIndex,
      ...(p.aiDifficulty ? { aiDifficulty: p.aiDifficulty } : {}),
    })),
    ...(opts.aiSlots ?? []),
  ].sort((a, b) => a.id.localeCompare(b.id));

  const desyncEvents: { tick: number; playerId: string; peers: string[] }[] = [];
  const sessions = new Map<string, LockstepSession>();
  const delayers = new Map<string, DelayedTransport>();
  const captures = new Map<string, DesyncCapture | null>();

  for (const peer of opts.peers) {
    const raw = room.connect(peer.id);
    const delay = peer.latencyTicks ?? 0;
    const jitter = peer.jitterTicks ?? 0;
    const delayer = new DelayedTransport(raw, delay, jitter, peer.jitterSeed ?? opts.seed ^ 0x5bf03635);
    delayers.set(peer.id, delayer);
    captures.set(peer.id, null);
    const session = new LockstepSession({
      registry: opts.registry,
      mapId: opts.mapId,
      seed: opts.seed,
      slots: allSlots,
      localPlayerId: peer.id,
      transport: delayer.transport,
      ...(opts.checksumInterval !== undefined ? { checksumInterval: opts.checksumInterval } : {}),
      onDesync: (report) => {
        if (captures.get(peer.id)) return;
        captures.set(peer.id, report);
        desyncEvents.push({
          tick: report.tick,
          playerId: peer.id,
          peers: report.peers.map((p) => p.playerId),
        });
      },
    });
    sessions.set(peer.id, session);
  }

  const maxTicks = opts.maxTicks ?? 35 * 60 * 20;
  let relayTicks = 0;

  const bots = new Map<string, BotClient>();
  if (opts.botHumans) {
    for (const peer of opts.peers) {
      const session = sessions.get(peer.id)!;
      bots.set(
        peer.id,
        new BotClient({
          playerId: peer.id,
          difficulty: opts.botDifficulty ?? 'normal',
          registry: opts.registry,
          // Each bot drives the brain against ITS OWN peer's services, which is what a real client would do.
          services: session.services,
          ...(opts.onPeerDecision ? { onDecision: (tick, _c, notes) => opts.onPeerDecision!(peer.id, tick, notes) } : {}),
        }),
      );
    }
  }

  for (let t = 0; t < maxTicks; t++) {
    /**
     * PLAYER INPUT GOES THROUGH THE REAL CHANNEL. `issue` schedules it at `tick + INPUT_DELAY` and sends it to
     * the relay; the peer does not apply it locally. So the only way a command reaches a simulation is via the
     * merge and broadcast path, which is exactly the path under test.
     */
    for (const peer of opts.peers) {
      const bot = bots.get(peer.id);
      const session = sessions.get(peer.id);
      if (!bot || !session) continue;
      const cmds = bot.decide(session.state);
      if (cmds.length > 0) {
        opts.onPeerCommands?.(peer.id, t, cmds);
        session.issue(cmds);
      }
    }

    room.advanceTick();
    relayTicks++;

    // Deliver whatever the simulated network has released by now, then let every peer step.
    for (const [pid, delayer] of delayers) {
      delayer.flush(room.tick);
      const session = sessions.get(pid)!;
      session.pump();
      opts.corruptPeer?.(pid, session.state.tick, session);
    }

    /**
     * DISCONNECT / REJOIN. The peer's transport is paused, so it accumulates held messages exactly as a real
     * socket buffers nothing while the tab is gone; on rejoin the held ticks are flushed in order and the peer
     * catches up from its own confirmed buffer. If it fell too far behind, the caller's snapshot path is what
     * rescues it — which is why the assertion is "it is in sync afterwards", not "it replayed everything".
     */
    if (opts.dropPeer) {
      const { playerId, atTick, backAtTick } = opts.dropPeer;
      if (room.tick === atTick) room.disconnect(playerId);
      if (room.tick === backAtTick) room.reconnect(playerId);
    }

    if ([...sessions.values()].every((s) => s.finished)) break;

    if (opts.onPeerStats && t % (30 * 20) === 0) {
      for (const peer of opts.peers) {
        const st = sessions.get(peer.id)!.state;
        const me = st.players.find((p) => p.id === peer.id);
        if (!me) continue;
        let army = 0;
        let harvesters = 0;
        let buildings = 0;
        let refineries = 0;
        for (let s = 0; s < st.entities.count; s++) {
          if (st.entities.dead[s] || st.entities.ownerId(st.entities.ownerIndex[s]!) !== peer.id) continue;
          const defId = st.entities.extras[s]!.defId;
          if (st.entities.kind[s] === 0) {
            const ud = opts.registry.units.get(defId);
            if (ud?.isHarvester) harvesters++;
            else if (ud?.weapon) army++;
          } else if (st.entities.kind[s] === 1) {
            buildings++;
            if (opts.registry.buildings.get(defId)?.isRefinery) refineries++;
          }
        }
        opts.onPeerStats(peer.id, t, {
          army,
          harvesters,
          buildings,
          refineries,
          mana: me.mana,
        });
      }
    }
  }

  // Final drain: let every peer consume everything already queued.
  for (const [pid, delayer] of delayers) {
    delayer.flush(room.tick + 1_000);
    sessions.get(pid)!.pump();
  }

  const outcomes: PeerOutcome[] = [];
  for (const peer of opts.peers) {
    const session = sessions.get(peer.id)!;
    outcomes.push({
      playerId: peer.id,
      finalHash: hashState(session.state),
      finalTick: session.state.tick,
      ended: session.state.ended,
      winnerTeam: session.state.winnerTeam,
      issued: bots.get(peer.id)?.issued ?? 0,
      desync: captures.get(peer.id) ?? null,
    });
  }

  const reference = outcomes[0]!;
  const inSync = outcomes.every((o) => o.finalHash === reference.finalHash && o.finalTick === reference.finalTick);

  return { outcomes, relayTicks, inSync, desyncEvents: desyncEvents.filter((d) => d.tick >= 0) };
}

export { CHECKSUM_INTERVAL_TICKS };
