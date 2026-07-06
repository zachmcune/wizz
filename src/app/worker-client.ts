// Main-thread client for the simulation Web Worker. Opt-in offload of the sim; the renderer
// then consumes StateSnapshots (interpolating between the last two) instead of GameState.
import type { ToWorker, FromWorker } from '../sim/worker/messages';
import type { Command } from '../sim/types';

export class WorkerSimClient {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  }

  onMessage(cb: (msg: FromWorker) => void): void {
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => cb(e.data);
  }

  private post(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  initMatch(matchId: string): void {
    this.post({ type: 'initMatch', matchId });
  }

  send(cmds: Command[]): void {
    this.post({ type: 'command', cmds });
  }

  setAi(enabled: boolean): void {
    this.post({ type: 'setAi', enabled });
  }

  terminate(): void {
    this.worker.terminate();
  }
}
