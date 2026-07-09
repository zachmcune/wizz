import {
  CHECKSUM_INTERVAL_TICKS,
  LEAD_TICKS,
  LOCKSTEP_DRAIN_BUDGET_MS,
  LOCKSTEP_MAX_BATCH_TICKS,
  LOCKSTEP_STALL_MS,
  SNAPSHOT_RESYNC_TICKS,
} from '../../net/protocol';
import type { LockstepClient } from '../../net/lockstep';
import type { WebSocketTransport } from '../../net/ws-transport';
import { hashState } from '../../sim/hash';
import { applyTransferState, applyWorkerSync, packState, type TransferState } from '../../sim/state-transfer';
import { rebuildBuildingNav } from '../../sim/building-nav';
import type { Simulation } from '../../sim/simulation';
import type { GameEvent, GameState, Command } from '../../sim/types';
import type { LockstepEntry } from '../../sim/worker/messages';
import type { SimServices } from '../../sim/context';
import type { Registry } from '../../data/registry';
import { createSimulation } from '../create-simulation';
import type { AiHook } from '../../sim/step';
import { WorkerSimClient, type WorkerLockstepResult } from '../worker-client';
import { ReplayRecorder, serializeReplay, type Replay } from '../../sim/replay';
import { saveGame, type SaveMeta } from '../../storage/save';

const AUTOSAVE_EVERY_TICKS = 200;

export type SimTickHandler = (events: GameEvent[]) => void;
export type SimSyncHandler = () => void;

/** Owns sim stepping across main-thread, worker, and lockstep modes. */
export class SimController {
  private sim: Simulation | null = null;
  private worker: WorkerSimClient | null = null;
  private readonly replay = new ReplayRecorder();
  private tickCounter = 0;
  private lastSimSyncMs = 0;
  private lockstepStallShown = false;
  private syncingShown = false;
  private lastSnapshotRequestMs = 0;
  private readonly aiEnabled: boolean;
  private readonly aiHook?: AiHook;
  private saveMeta: SaveMeta | null = null;
  private sandboxMode = false;
  private paused = false;
  get isPaused(): boolean {
    return this.paused;
  }

  setSaveMeta(meta: SaveMeta | null, sandbox = false): void {
    this.saveMeta = meta;
    this.sandboxMode = sandbox;
  }

  setAiEnabled(enabled: boolean): void {
    if (this.worker) this.worker.setAi(enabled);
    else this.sim?.setAiEnabled(enabled);
  }

  /** Advance exactly one tick while paused (sandbox debugging). */
  stepOneTick(): void {
    if (this.lockstep || this.state.ended) return;
    if (this.worker) {
      this.worker.requestStep();
      return;
    }
    const res = this.sim!.step();
    this.onTick(res.events);
    this.onSync();
    this.markSynced();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused && this.saveMeta && !this.lockstep && !this.sandboxMode) void saveGame(this.state, this.saveMeta);
  }

  /** After tab foregrounding in multiplayer, aggressively catch up. */
  resumeFromBackground(): void {
    if (!this.lockstep) return;
    this.lockstepStallShown = false;
    this.syncingShown = false;
    this.lastSnapshotRequestMs = 0;
    this.relayTransport?.requestSnapshot();
    if (this.worker) return;
    this.catchUpLockstep();
  }

  /** Set by the owner (Game) to snap render interpolation after a snapshot jump. */
  onResync: (() => void) | null = null;

  constructor(
    private state: GameState,
    private services: SimServices,
    private registry: Registry,
    private lockstep: LockstepClient | null,
    private matchId: string,
    private onDesync: ((tick: number, peers: string[], replay: Replay) => void) | null,
    private onTick: SimTickHandler,
    private onSync: SimSyncHandler,
    useWorker: boolean,
    aiEnabled: boolean,
    private relayTransport: WebSocketTransport | null = null,
    aiHook?: AiHook,
  ) {
    this.aiEnabled = aiEnabled;
    this.aiHook = aiHook;
    if (useWorker) {
      this.worker = new WorkerSimClient();
    } else {
      this.sim = createSimulation(state, services, { aiEnabled, aiHook });
    }
    this.wireSnapshotHandlers();
  }

  /** Host answers snapshot requests; every peer can apply an incoming snapshot. */
  private wireSnapshotHandlers(): void {
    if (!this.lockstep || !this.relayTransport) return;
    this.relayTransport.onSnapshotRequest = () => this.produceSnapshot();
    this.relayTransport.onSnapshot = (fromTick, state) => this.applySnapshot(fromTick, state);
  }

  private produceSnapshot(): void {
    if (!this.relayTransport) return;
    if (this.worker) {
      this.worker.requestSnapshot();
      return;
    }
    if (!this.sim) return;
    this.relayTransport.sendSnapshot(this.state.tick, packState(this.state));
  }

  /** Jump the local sim forward to an authoritative snapshot, skipping replay. */
  private applySnapshot(fromTick: number, state: unknown): void {
    if (!this.lockstep) return;
    if (fromTick <= this.state.tick) return;
    if (this.worker) {
      // The worker mirrors the snapshot; onReady (set in initWorker) finishes the jump.
      this.worker.applySnapshot(state as TransferState);
      // Re-init resets AI to default; restore the match's setting for determinism.
      this.worker.setAi(this.aiEnabled);
      return;
    }
    if (!this.sim) return;
    applyTransferState(this.state, state as TransferState);
    rebuildBuildingNav(this.state, this.services, this.registry);
    this.lockstep.pruneBefore(fromTick);
    this.lockstep.ackNow(fromTick);
    this.onSync();
    this.markSynced();
    this.onResync?.();
  }

  /** When we lag the relay head badly (e.g. after backgrounding), resync via snapshot. */
  private maybeRequestResync(): void {
    if (!this.lockstep || !this.relayTransport) return;
    if (this.lockstep.backlog(this.state.tick) <= SNAPSHOT_RESYNC_TICKS) return;
    const now = performance.now();
    if (now - this.lastSnapshotRequestMs < 2000) return;
    this.lastSnapshotRequestMs = now;
    this.relayTransport.requestSnapshot();
  }

  get isWorkerMode(): boolean {
    return this.worker !== null;
  }

  markSynced(): void {
    this.lastSimSyncMs = performance.now();
  }

  get lastSyncMs(): number {
    return this.lastSimSyncMs;
  }

  enqueueCommands(cmds: Command[]): void {
    if (!cmds.length) return;
    this.replay.record(this.state.tick, cmds);
    if (this.lockstep) {
      this.lockstep.submitLocal(this.state.tick, cmds);
      return;
    }
    if (this.worker) this.worker.send(cmds);
    else this.sim?.enqueueNow(cmds);
  }

  /** Fixed-timestep tick (non-lockstep). Returns false when sim has ended or is paused. */
  stepFixed(): boolean {
    if (this.paused || this.state.ended || this.lockstep) return false;
    if (this.worker) return this.worker.requestStep();
    const res = this.sim!.step();
    this.onTick(res.events);
    this.onSync();
    this.markSynced();
    this.tickCounter++;
    if (this.tickCounter % AUTOSAVE_EVERY_TICKS === 0 && this.saveMeta && !this.sandboxMode) void saveGame(this.state, this.saveMeta);
    return true;
  }

  async initWorker(): Promise<boolean> {
    const worker = this.worker;
    if (!worker) return true;

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(worker.isReady), 4000);
      let initialized = false;
      worker.onReady = (transfer) => {
        clearTimeout(timeout);
        this.applyWorkerState(transfer);
        if (this.lockstep) {
          // After the first ready this fires only for snapshot resyncs.
          if (initialized) this.finishWorkerResync();
        }
        if (!initialized) {
          initialized = true;
          resolve(true);
        }
      };
      if (this.lockstep) {
        worker.onLockstepResult = (res) => this.applyWorkerLockstepResult(res);
        worker.onSnapshot = (state) => this.relayTransport?.sendSnapshot(state.tick, state);
      } else {
        worker.onTick = ({ state, delta, events }) => {
          const navDirty = applyWorkerSync(this.state, { state, delta });
          if (navDirty) rebuildBuildingNav(this.state, this.services, this.registry);
          this.onTick(events);
          this.onSync();
          this.markSynced();
          this.tickCounter++;
          if (this.tickCounter % AUTOSAVE_EVERY_TICKS === 0 && this.saveMeta && !this.sandboxMode) void saveGame(this.state, this.saveMeta);
        };
      }
      worker.initState(packState(this.state));
      // All peers must run identical AI settings or the deterministic sim will desync.
      worker.setAi(this.aiEnabled);
    });
  }

  private finishWorkerResync(): void {
    if (!this.lockstep) return;
    this.lockstep.pruneBefore(this.state.tick);
    this.lockstep.ackNow(this.state.tick);
    this.onResync?.();
  }

  fallbackToMainThread(): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.sim = createSimulation(this.state, this.services, { aiEnabled: this.aiEnabled, aiHook: this.aiHook });
  }

  catchUpLockstep(): void {
    if (!this.lockstep || !this.sim) return;
    let safety = 0;
    let lastTick = this.state.tick;
    while (this.advanceLockstep() && safety++ < 10_000) {
      lastTick = this.state.tick;
    }
    this.finishLockstepBatch(lastTick);
  }

  drainLockstep(hudHint: (msg: string) => void): void {
    if (!this.lockstep) return;
    if (this.worker) {
      this.drainLockstepWorker(hudHint);
      return;
    }
    if (!this.sim) return;
    this.checkLockstepStall(hudHint);
    this.maybeRequestResync();
    const deadline = performance.now() + LOCKSTEP_DRAIN_BUDGET_MS;
    let lastTick = this.state.tick;
    let advanced = false;
    while (performance.now() < deadline) {
      if (!this.advanceLockstep()) break;
      advanced = true;
      lastTick = this.state.tick;
    }
    if (advanced) this.finishLockstepBatch(lastTick);
  }

  /** Worker lockstep: hand confirmed ticks to the worker (one batch in flight at a time). */
  private drainLockstepWorker(hudHint: (msg: string) => void): void {
    const worker = this.worker;
    if (!worker || !this.lockstep) return;
    this.checkLockstepStall(hudHint);
    this.maybeRequestResync();
    if (worker.hasPendingBatch || !worker.isReady) return;

    const entries: LockstepEntry[] = [];
    let t = this.state.tick;
    while (entries.length < LOCKSTEP_MAX_BATCH_TICKS && this.lockstep.isTickReady(t)) {
      entries.push({ tick: t, cmds: this.lockstep.commandsForTick(t) ?? [] });
      t++;
    }
    if (entries.length) worker.sendLockstepBatch(entries, CHECKSUM_INTERVAL_TICKS);
  }

  private applyWorkerLockstepResult(res: WorkerLockstepResult): void {
    if (!this.lockstep) return;
    applyTransferState(this.state, res.state);
    rebuildBuildingNav(this.state, this.services, this.registry);
    this.onTick(res.events);
    for (const c of res.checksums) this.handleChecksum(c.tick, c.hash);
    this.finishLockstepBatch(res.lastTick);
  }

  private handleChecksum(tick: number, hash: string): void {
    if (!this.lockstep) return;
    const bad = this.lockstep.detectDesync(tick, hash);
    if (bad.length) {
      const replay = this.replay.toReplay(this.matchId);
      this.onDesync?.(tick, bad, replay);
      console.error('[lockstep] desync at tick', tick, 'peers:', bad, 'replay:', serializeReplay(replay));
    }
  }

  autosaveOnExit(): void {
    if (!this.lockstep && this.saveMeta && !this.sandboxMode) void saveGame(this.state, this.saveMeta);
  }

  terminate(): void {
    this.worker?.terminate();
  }

  private applyWorkerState(transfer: TransferState): void {
    applyTransferState(this.state, transfer);
    rebuildBuildingNav(this.state, this.services, this.registry);
    this.onSync();
    this.markSynced();
  }

  private advanceLockstep(): boolean {
    if (!this.lockstep || !this.sim) return false;
    const tick = this.state.tick;
    if (!this.lockstep.isTickReady(tick)) return false;
    const cmds = this.lockstep.commandsForTick(tick) ?? [];
    this.sim.enqueue(tick, cmds);
    const res = this.sim.step();
    this.onTick(res.events);
    this.tickCounter++;
    if (this.tickCounter % CHECKSUM_INTERVAL_TICKS === 0) this.reportChecksum(tick);
    return true;
  }

  private finishLockstepBatch(lastTick: number): void {
    this.lockstep?.pruneBefore(Math.max(0, lastTick - 120));
    // Report progress so the relay paces its clock to us (bounds cross-client drift).
    this.lockstep?.ackProcessed(lastTick);
    this.onSync();
    this.markSynced();
  }

  private reportChecksum(tick: number): void {
    if (!this.lockstep) return;
    this.handleChecksum(tick, hashState(this.state));
  }

  private checkLockstepStall(hudHint: (msg: string) => void): void {
    if (!this.lockstep?.hasReceivedTicks() || this.state.ended) return;
    const gap = this.lockstep.msSinceLastTick();
    if (gap >= LOCKSTEP_STALL_MS) {
      if (!this.lockstepStallShown) {
        this.lockstepStallShown = true;
        hudHint('Connection stalled — check network or rejoin the match');
      }
      return;
    }
    this.lockstepStallShown = false;

    // Ticks are flowing but we are catching up (e.g. after a hitch or backgrounding).
    const backlog = this.lockstep.backlog(this.state.tick);
    if (backlog > LEAD_TICKS * 2) {
      if (!this.syncingShown) {
        this.syncingShown = true;
        hudHint('Syncing…');
      }
    } else {
      this.syncingShown = false;
    }
  }
}
