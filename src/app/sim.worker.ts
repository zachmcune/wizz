// Simulation Web Worker entry. Runs the deterministic sim off the main thread.
// Main thread drives ticks via { type: 'step' } for lockstep with the render loop.
import { loadRegistry } from '../data/loader';
import { aiStep } from '../ai/controller';
import { SimHost } from '../sim/worker/sim-host';
import type { ToWorker, FromWorker } from '../sim/worker/messages';

const ctx = self as unknown as {
  postMessage: (m: FromWorker) => void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
};

const registry = loadRegistry();
const host = new SimHost(registry, aiStep);

ctx.onmessage = (ev) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'initMatch': {
      const state = host.initMatch(msg.matchId);
      ctx.postMessage({ type: 'ready', state });
      break;
    }
    case 'initState': {
      const state = host.initState(msg.state);
      ctx.postMessage({ type: 'ready', state });
      break;
    }
    case 'step': {
      const { state, events } = host.step();
      ctx.postMessage({ type: 'tick', state, events });
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
