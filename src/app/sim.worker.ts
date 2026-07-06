// Simulation Web Worker entry. Runs the deterministic sim off the main thread and streams
// snapshots for interpolation. Opt-in (see WorkerSimClient); the sim code is identical to the
// single-thread path, so determinism is preserved (verified in tests/worker.test.ts).
import { loadRegistry } from '../data/loader';
import { SimHost } from '../sim/worker/sim-host';
import type { ToWorker, FromWorker } from '../sim/worker/messages';
import { TICK_MS } from '../core/constants';

const ctx = self as unknown as {
  postMessage: (m: FromWorker) => void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
};

const registry = loadRegistry();
const host = new SimHost(registry);
let timer: ReturnType<typeof setInterval> | null = null;

function startLoop(): void {
  if (timer !== null) return;
  timer = setInterval(() => {
    const { snapshot, events } = host.step();
    ctx.postMessage({ type: 'tick', snapshot, events });
  }, TICK_MS);
}

ctx.onmessage = (ev) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'initMatch': {
      const snapshot = host.initMatch(msg.matchId);
      ctx.postMessage({ type: 'ready', snapshot });
      startLoop();
      break;
    }
    case 'command':
      host.enqueue(msg.cmds);
      break;
    case 'setAi':
      host.setAi(msg.enabled);
      break;
  }
};
