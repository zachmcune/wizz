// NETWORKED MATCH — a `MatchController`-compatible view onto a `LockstepSession`.
//
// WHY THIS IS A SEPARATE CLASS RATHER THAN A FLAG ON `MatchController`. The single-player controller owns a
// fixed-step wall-clock loop: it accumulates elapsed time and steps the sim whenever a tick is due. That is the
// right model when this process is the only authority, and it is fundamentally wrong for lockstep, where a tick
// may only be simulated once the relay has confirmed its command list. Bending one class to be both would put an
// `if (multiplayer)` through the most timing-sensitive code in the app.
//
// So this class implements the same SURFACE the HUD and screens consume — `state`, `me`, `issue`, `camera`,
// `rend` — and delegates the tick decision to `LockstepSession.pump()`, which steps exactly as far as the relay
// has confirmed and no further. The HUD therefore needs no multiplayer branch at all: it reads `state` and calls
// `issue`, exactly as it does offline, and the network decides when the world moves.
//
// THE RENDER LOOP STILL RUNS AT FRAME RATE. Rendering is decoupled from simulation everywhere in this codebase
// (`renderer.render` interpolates), so a stalled or catching-up match still draws, and a busy one draws every
// intermediate tick it just simulated rather than skipping them.

import type { Registry } from '../data/registry';
import { Renderer, teamIdForColor } from '../render/renderer';
import type { LoadedAtlas } from '../render/atlas';
import type { EntityId, GameState, PlayerId } from '../sim/types';
import type { SimServices } from '../sim/context';
import { LockstepSession, type SlotSpec } from '../net/session';
import type { Transport } from '../net/lockstep';
import type { CommandPayload } from './match';
import { evaluateStall, type StallDecision } from '../net/stall';
import { SNAPSHOT_RESYNC_TICKS } from '../net/protocol-constants';

export interface NetworkedMatchOptions {
  registry: Registry;
  atlas: LoadedAtlas;
  host: HTMLElement;
  transport: Transport;
  mapId: string;
  seed: number;
  slots: SlotSpec[];
  localPlayerId: PlayerId;
  onTick: (state: GameState) => void;
  onEnd: (winnerTeam: number | null) => void;
  onReject: (reason: string) => void;
  /** Called when a desync is confirmed, with the capture that a bug report needs. */
  onDesync: (capture: import('../net/session').DesyncCapture) => void;
  /** Called when the stall policy wants the HUD to say something. */
  onStallHint: (hint: string) => void;
  /**
   * Called with every simulation event for a tick.
   *
   * Passed straight through from the session so an observer (the match proof, a diagnostic overlay) can
   * count what actually happened in the world rather than what the UI believes it did.
   */
  onEvents?: (events: import('../sim/types').GameEvent[], tick: number) => void;
}

export class NetworkedMatch {
  readonly session: LockstepSession;
  private readonly renderer: Renderer;
  private readonly opts: NetworkedMatchOptions;
  private raf = 0;
  private running = false;
  private stallState = { stallShown: false };
  private paused = false;

  private constructor(session: LockstepSession, renderer: Renderer, opts: NetworkedMatchOptions) {
    this.session = session;
    this.renderer = renderer;
    this.opts = opts;
  }

  static async create(opts: NetworkedMatchOptions): Promise<NetworkedMatch> {
    const session = new LockstepSession({
      registry: opts.registry,
      mapId: opts.mapId,
      seed: opts.seed,
      slots: opts.slots,
      localPlayerId: opts.localPlayerId,
      transport: opts.transport,
      onDesync: opts.onDesync,
      onEnd: opts.onEnd,
      ...(opts.onEvents ? { onEvents: opts.onEvents } : {}),
    });

    const renderer = new Renderer(opts.registry, opts.registry.map(opts.mapId));
    await renderer.init(opts.host, opts.atlas);

    const match = new NetworkedMatch(session, renderer, opts);
    match.focusPlayerBase();
    return match;
  }

  get state(): GameState {
    return this.session.state;
  }

  get services(): SimServices {
    return this.session.services;
  }

  get camera(): Renderer['camera'] {
    return this.renderer.camera;
  }

  get rend(): Renderer {
    return this.renderer;
  }

  /** The local player, as the HUD expects. */
  get me(): PlayerId {
    return this.session.localPlayerId;
  }

  get elapsedSeconds(): number {
    // In lockstep the sim tick IS the clock; wall time would disagree between peers.
    return Math.floor(this.state.tick / 20);
  }

  focusPlayerBase(): void {
    const st = this.state;
    const myIndex = st.players.findIndex((p) => p.id === this.me);
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
      if (st.entities.ownerIndex[s] !== myIndex) continue;
      this.renderer.camera.frameOn(st.entities.posX[s]!, st.entities.posY[s]!);
      break;
    }
    if (myIndex >= 0) this.renderer.setViewer(teamIdForColor(st.players[myIndex]!.color));
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  myUnits(): EntityId[] {
    const st = this.state;
    const myIndex = st.players.findIndex((p) => p.id === this.me);
    const out: EntityId[] = [];
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== 0) continue;
      if (st.entities.ownerIndex[s] !== myIndex) continue;
      out.push(st.entities.id[s]!);
    }
    return out;
  }

  /**
   * Queue a local command.
   *
   * Note there is NO rejection surface here, unlike the offline controller: the relay confirms the tick and the
   * sim applies it later, possibly on another peer's clock, so the outcome arrives as a `commandRejected` EVENT
   * from the sim rather than as a return value. That is the honest model — a networked command is a message, not
   * a function call — and the HUD's `onReject` is fed from the event stream instead.
   */
  issue(cmd: CommandPayload): boolean {
    const full = { ...cmd, playerId: (cmd as { playerId?: PlayerId }).playerId ?? this.me };
    const tick = this.session.issue([full as never]);
    if (tick < 0) {
      this.opts.onReject('This match has ended.');
      return false;
    }
    this.renderer.sync(this.state);
    this.opts.onTick(this.state);
    return true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const frame = (): void => {
      if (!this.running) return;


      if (!this.paused) {
        /**
         * PUMP, THEN RENDER. `pump` steps every tick the relay has confirmed, so a peer that fell behind catches
         * up within one frame instead of lagging at 20 Hz forever.
         */
        this.session.pump();
        this.renderer.sync(this.state);
        this.opts.onTick(this.state);

        // Stall policy: a genuine stall shows a hint, a hidden tab or a freeze does not.
        const decision: StallDecision = evaluateStall({
          hasReceivedTicks: this.session.lockstep.hasReceivedTicks(),
          matchEnded: this.state.ended,
          documentHidden: typeof document !== 'undefined' && document.visibilityState !== 'visible',
          msSinceLastTick: this.msSinceLastTick(),
          backlog: this.session.backlog(),
        });
        if (decision.hint !== null && decision.hint !== '') this.opts.onStallHint(decision.hint);
        this.stallState.stallShown = decision.reason === 'stalled';

        // Too far behind: ask the host for a snapshot rather than replaying a stale backlog.
        const t = this.opts.transport as Transport & { requestSnapshot?: () => void };
        if (this.session.needsSnapshot(SNAPSHOT_RESYNC_TICKS)) t.requestSnapshot?.();
      }

      this.renderer.render(this.state, 0, new Set());
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private lastTickAt = 0;
  private seenTick = -1;

  private msSinceLastTick(): number {
    if (this.state.tick !== this.seenTick) {
      this.seenTick = this.state.tick;
      this.lastTickAt = performance.now();
      return 0;
    }
    return this.lastTickAt === 0 ? 0 : performance.now() - this.lastTickAt;
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    this.stop();
    this.renderer.destroy();
  }
}
