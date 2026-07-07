// Headless simulation harness for tests and verification. Lives outside src/sim so it can
// inject AI without violating the sim purity boundary.
import type { Registry } from '../data/registry';
import { createSimulation } from '../app/create-simulation';
import type { MatchConfig, Command, GameState } from '../sim/types';
import { initMatch } from '../sim/factory';

export interface HeadlessOptions {
  scriptedCommands?: Record<number, Command[]>;
  aiEnabled?: boolean;
}

export function runHeadless(
  registry: Registry,
  config: MatchConfig,
  ticks: number,
  opts: HeadlessOptions = {},
): GameState {
  const { state, services } = initMatch(registry, config);
  const sim = createSimulation(state, services, { aiEnabled: opts.aiEnabled });
  if (opts.scriptedCommands) {
    for (const [t, cmds] of Object.entries(opts.scriptedCommands)) sim.enqueue(Number(t), cmds);
  }
  for (let i = 0; i < ticks; i++) sim.step();
  return state;
}
