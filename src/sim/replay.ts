// Record and replay command streams for desync debugging and multiplayer verification.
import type { Registry } from '../data/registry';
import type { Command, GameState } from './types';
import { initMatch } from './factory';
import { Simulation } from './simulation';
import { hashState } from './hash';

export const REPLAY_VERSION = 1;

export interface Replay {
  version: typeof REPLAY_VERSION;
  matchId: string;
  commandsByTick: Record<number, Command[]>;
}

export class ReplayRecorder {
  private commands: Record<number, Command[]> = {};

  /** Record commands issued for a tick (call when enqueuing). */
  record(tick: number, cmds: Command[]): void {
    if (!cmds.length) return;
    const list = this.commands[tick] ?? [];
    list.push(...cmds);
    this.commands[tick] = list;
  }

  toReplay(matchId: string): Replay {
    return { version: REPLAY_VERSION, matchId, commandsByTick: { ...this.commands } };
  }

  clear(): void {
    this.commands = {};
  }
}

export interface ReplayOptions {
  ticks: number;
  aiEnabled?: boolean;
}

/** Run a recorded command stream and return final state. */
export function runReplay(registry: Registry, replay: Replay, opts: ReplayOptions): GameState {
  if (replay.version !== REPLAY_VERSION) {
    throw new Error(`Unsupported replay version ${replay.version}`);
  }
  const config = registry.match(replay.matchId);
  const { state, services } = initMatch(registry, config);
  const sim = new Simulation(state, services);
  sim.aiEnabled = opts.aiEnabled ?? true;
  for (const [t, cmds] of Object.entries(replay.commandsByTick)) {
    sim.enqueue(Number(t), cmds);
  }
  for (let i = 0; i < opts.ticks; i++) sim.step();
  return state;
}

export function replayHash(registry: Registry, replay: Replay, ticks: number, aiEnabled = true): string {
  return hashState(runReplay(registry, replay, { ticks, aiEnabled }));
}

export function replayFromScripted(matchId: string, scripted: Record<number, Command[]>): Replay {
  return { version: REPLAY_VERSION, matchId, commandsByTick: scripted };
}

export function replayFromMatch(matchId: string, commandsByTick: Record<number, Command[]>): Replay {
  return { version: REPLAY_VERSION, matchId, commandsByTick };
}
