// Headless match driver: run a match with no renderer, no DOM, no wall-clock.
//
// This is the harness the conformance suite and the AI gates use. It is intentionally tiny: the sim
// is a pure step function, so "run a match" is a loop.

import type { Registry } from '../data/registry';
import type { Command, GameState } from './types';
import type { SimServices } from './context';
import { initMatch } from './factory';
import { stepSimulation, type AiHook } from './step';

export interface HeadlessOptions {
  scriptedCommands?: Record<number, Command[]>;
  aiHook?: AiHook;
}

export interface HeadlessResult {
  state: GameState;
  services: SimServices;
  /** Every event emitted, in tick order (useful for conformance assertions). */
  events: { tick: number; event: import('./types').GameEvent }[];
}

/** Create a match and step it `ticks` times. */
export function runHeadless(
  registry: Registry,
  config: import('./types').MatchConfig,
  ticks: number,
  opts: HeadlessOptions = {},
): HeadlessResult {
  const { state, services } = initMatch(registry, config);
  const events: HeadlessResult['events'] = [];

  for (let i = 0; i < ticks; i++) {
    if (state.ended) break;
    const tick = state.tick;
    const cmds = opts.scriptedCommands?.[tick] ?? [];
    const res = stepSimulation(state, services, cmds, opts.aiHook);
    for (const event of res.events) events.push({ tick, event });
  }

  return { state, services, events };
}

/** A match with a deterministic command schedule for repeated runs. */
export function makeCommandSchedule(
  entries: { tick: number; cmds: Command[] }[],
): Record<number, Command[]> {
  const out: Record<number, Command[]> = {};
  for (const { tick, cmds } of entries) {
    const list = out[tick] ?? [];
    list.push(...cmds);
    out[tick] = list;
  }
  return out;
}
