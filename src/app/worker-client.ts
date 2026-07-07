// Main-thread client for the simulation Web Worker.
import type { ToWorker, FromWorker, TransferState } from '../sim/worker/messages';
import type { Command, GameEvent } from '../sim/types';

export interface WorkerTickResult {
  state: TransferState;
  events: GameEvent[];
}

export class WorkerSimClient {
  private worker: Worker;
  private stepPending = false;
  private ready = false;
  onTick: ((result: WorkerTickResult) => void) | null = null;
  onReady: ((state: TransferState) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.handleMessage(e.data);
  }

  private handleMessage(msg: FromWorker): void {
    if (msg.type === 'ready') {
      this.ready = true;
      this.stepPending = false;
      this.onReady?.(msg.state);
      return;
    }
    if (msg.type === 'tick') {
      this.stepPending = false;
      this.onTick?.({ state: msg.state, events: msg.events });
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

  get isReady(): boolean {
    return this.ready;
  }

  get hasPendingStep(): boolean {
    return this.stepPending;
  }

  terminate(): void {
    this.worker.terminate();
  }
}
