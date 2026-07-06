// Headless simulation harness: run the sim with no renderer. The primary safety net.
// Used by determinism/replay/balance tests and (later) multiplayer verification.
import type { Registry } from '../data/registry';
import type { MatchConfig, Command, GameState } from './types';
import { initMatch } from './factory';
import { Simulation } from './simulation';

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
  const sim = new Simulation(state, services);
  sim.aiEnabled = opts.aiEnabled ?? true;
  if (opts.scriptedCommands) {
    for (const [t, cmds] of Object.entries(opts.scriptedCommands)) sim.enqueue(Number(t), cmds);
  }
  for (let i = 0; i < ticks; i++) sim.step();
  return state;
}
