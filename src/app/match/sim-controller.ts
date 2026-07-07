import { CHECKSUM_INTERVAL_TICKS, LOCKSTEP_DRAIN_BUDGET_MS, LOCKSTEP_STALL_MS } from '../../net/protocol';
import type { LockstepClient } from '../../net/lockstep';
import { hashState } from '../../sim/hash';
import { applyTransferState, packState, type TransferState } from '../../sim/state-transfer';
import { rebuildBuildingNav } from '../../sim/building-nav';
import type { Simulation } from '../../sim/simulation';
import type { GameEvent, GameState, Command } from '../../sim/types';
import type { SimServices } from '../../sim/context';
import type { Registry } from '../../data/registry';
import { createSimulation } from '../create-simulation';
import { WorkerSimClient } from '../worker-client';
import { ReplayRecorder, serializeReplay, type Replay } from '../../sim/replay';
import { saveGame } from '../../storage/save';

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
  ) {
    if (useWorker) {
      this.worker = new WorkerSimClient();
    } else {
      this.sim = createSimulation(state, services, { aiEnabled });
    }
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

  /** Fixed-timestep tick (non-lockstep). Returns false when sim has ended. */
  stepFixed(): boolean {
    if (this.state.ended || this.lockstep) return false;
    if (this.worker) return this.worker.requestStep();
    const res = this.sim!.step();
    this.onTick(res.events);
    this.onSync();
    this.markSynced();
    this.tickCounter++;
    if (this.tickCounter % AUTOSAVE_EVERY_TICKS === 0) void saveGame(this.state);
    return true;
  }

  async initWorker(): Promise<boolean> {
    const worker = this.worker;
    if (!worker) return true;

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(worker.isReady), 4000);
      worker.onReady = (transfer) => {
        clearTimeout(timeout);
        this.applyWorkerState(transfer);
        resolve(true);
      };
      worker.onTick = ({ state, events }) => {
        applyTransferState(this.state, state);
        rebuildBuildingNav(this.state, this.services, this.registry);
        this.onTick(events);
        this.onSync();
        this.markSynced();
        this.tickCounter++;
        if (this.tickCounter % AUTOSAVE_EVERY_TICKS === 0) void saveGame(this.state);
      };
      worker.initState(packState(this.state));
    });
  }

  fallbackToMainThread(): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.sim = createSimulation(this.state, this.services);
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
    if (!this.lockstep || !this.sim) return;
    this.checkLockstepStall(hudHint);
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

  autosaveOnExit(): void {
    if (!this.lockstep) void saveGame(this.state);
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
    this.onSync();
    this.markSynced();
  }

  private reportChecksum(tick: number): void {
    if (!this.lockstep) return;
    const ownHash = hashState(this.state);
    const bad = this.lockstep.detectDesync(tick, ownHash);
    if (bad.length) {
      const replay = this.replay.toReplay(this.matchId);
      this.onDesync?.(tick, bad, replay);
      console.error('[lockstep] desync at tick', tick, 'peers:', bad, 'replay:', serializeReplay(replay));
    }
  }

  private checkLockstepStall(hudHint: (msg: string) => void): void {
    if (!this.lockstep?.hasReceivedTicks() || this.state.ended) return;
    const gap = this.lockstep.msSinceLastTick();
    if (gap < LOCKSTEP_STALL_MS) {
      this.lockstepStallShown = false;
      return;
    }
    if (!this.lockstepStallShown) {
      this.lockstepStallShown = true;
      hudHint('Connection stalled — check network or rejoin the match');
    }
  }
}
