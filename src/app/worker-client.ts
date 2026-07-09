// Main-thread client for the simulation Web Worker.
import type { ToWorker, FromWorker, TransferState, TransferDelta, LockstepEntry } from '../sim/worker/messages';
import type { Command, GameEvent } from '../sim/types';

export interface WorkerTickResult {
  state?: TransferState;
  delta?: TransferDelta;
  events: GameEvent[];
}

export interface WorkerLockstepResult {
  state: TransferState;
  events: GameEvent[];
  lastTick: number;
  checksums: { tick: number; hash: string }[];
}

export class WorkerSimClient {
  private worker: Worker;
  private stepPending = false;
  private batchPending = false;
  private ready = false;
  onTick: ((result: WorkerTickResult) => void) | null = null;
  onReady: ((state: TransferState) => void) | null = null;
  onLockstepResult: ((result: WorkerLockstepResult) => void) | null = null;
  onSnapshot: ((state: TransferState) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.handleMessage(e.data);
  }

  private handleMessage(msg: FromWorker): void {
    if (msg.type === 'ready') {
      this.ready = true;
      this.stepPending = false;
      this.batchPending = false;
      this.onReady?.(msg.state);
      return;
    }
    if (msg.type === 'tick') {
      this.stepPending = false;
      this.onTick?.({ state: msg.state, delta: msg.delta, events: msg.events });
      return;
    }
    if (msg.type === 'lockstepResult') {
      this.batchPending = false;
      this.onLockstepResult?.({
        state: msg.state,
        events: msg.events,
        lastTick: msg.lastTick,
        checksums: msg.checksums,
      });
      return;
    }
    if (msg.type === 'snapshot') {
      this.onSnapshot?.(msg.state);
    }
  }

  private post(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  initMatch(matchId: string): void {
    this.ready = false;
    this.stepPending = false;
    this.post({ type: 'initMatch', matchId });
  }

  initState(state: TransferState): void {
    this.ready = false;
    this.stepPending = false;
    this.post({ type: 'initState', state });
  }

  send(cmds: Command[]): void {
    if (cmds.length) this.post({ type: 'command', cmds });
  }

  setAi(enabled: boolean): void {
    this.post({ type: 'setAi', enabled });
  }

  /** Request one sim tick. No-op if a step is already in flight or worker not ready. */
  requestStep(): boolean {
    if (!this.ready || this.stepPending) return false;
    this.stepPending = true;
    this.post({ type: 'step' });
    return true;
  }

  /** Send a batch of confirmed lockstep ticks. No-op if a batch is already in flight. */
  sendLockstepBatch(entries: LockstepEntry[], checksumEvery: number): boolean {
    if (!this.ready || this.batchPending || !entries.length) return false;
    this.batchPending = true;
    this.post({ type: 'lockstepBatch', entries, checksumEvery });
    return true;
  }

  requestSnapshot(): void {
    this.post({ type: 'requestSnapshot' });
  }

  applySnapshot(state: TransferState): void {
    this.ready = false;
    this.stepPending = false;
    this.batchPending = false;
    this.post({ type: 'applySnapshot', state });
  }

  get isReady(): boolean {
    return this.ready;
  }

  get hasPendingStep(): boolean {
    return this.stepPending;
  }

  get hasPendingBatch(): boolean {
    return this.batchPending;
  }

  terminate(): void {
    this.worker.terminate();
  }
}
