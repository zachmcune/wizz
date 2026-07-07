// App-layer factory: wires the deterministic sim with optional AI (kept out of src/sim).
import { aiStep } from '../ai/controller';
import type { SimServices } from '../sim/context';
import type { AiHook } from '../sim/step';
import { Simulation } from '../sim/simulation';
import type { GameState } from '../sim/types';

export interface CreateSimulationOptions {
  aiEnabled?: boolean;
  aiHook?: AiHook;
}

/** Create a Simulation with AI injected from the app layer (never from inside src/sim). */
export function createSimulation(
  state: GameState,
  services: SimServices,
  opts: CreateSimulationOptions = {},
): Simulation {
  const enabled = opts.aiEnabled ?? true;
  const hook = opts.aiHook ?? (enabled ? aiStep : undefined);
  const sim = new Simulation(state, services, hook);
  if (!enabled) sim.setAiEnabled(false);
  return sim;
}
