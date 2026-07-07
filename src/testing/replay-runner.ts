// Replay execution for tests — composes sim + optional AI outside src/sim.
import type { Registry } from '../data/registry';
import { createSimulation } from '../app/create-simulation';
import { initMatch } from '../sim/factory';
import { hashState } from '../sim/hash';
import type { Replay } from '../sim/replay';
import type { GameState } from '../sim/types';

export interface ReplayRunOptions {
  ticks: number;
  aiEnabled?: boolean;
}

export function runReplay(registry: Registry, replay: Replay, opts: ReplayRunOptions): GameState {
  const config = registry.match(replay.matchId);
  const { state, services } = initMatch(registry, config);
  const sim = createSimulation(state, services, { aiEnabled: opts.aiEnabled });
  for (const [t, cmds] of Object.entries(replay.commandsByTick)) {
    sim.enqueue(Number(t), cmds);
  }
  for (let i = 0; i < opts.ticks; i++) sim.step();
  return state;
}

export function replayHash(registry: Registry, replay: Replay, ticks: number, aiEnabled = true): string {
  return hashState(runReplay(registry, replay, { ticks, aiEnabled }));
}
