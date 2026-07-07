// Orchestrates the sim: owns state + services + a per-tick command queue, and drives ticks.
// Commands from input/UI/AI/network all funnel through enqueue(); AI is injected from outside.
import type { SimServices } from './context';
import type { GameState, Command } from './types';
import { stepSimulation, type AiHook, type StepResult } from './step';

export class Simulation {
  private queued = new Map<number, Command[]>();
  private aiEnabled = true;

  constructor(
    private readonly _state: GameState,
    private readonly _services: SimServices,
    private readonly aiHook?: AiHook,
  ) {}

  get state(): GameState {
    return this._state;
  }

  get services(): SimServices {
    return this._services;
  }

  setAiEnabled(enabled: boolean): void {
    this.aiEnabled = enabled;
  }

  /** Queue commands to be applied on a specific tick. */
  enqueue(tick: number, cmds: Command[]): void {
    if (!cmds.length) return;
    const list = this.queued.get(tick);
    if (list) list.push(...cmds);
    else this.queued.set(tick, [...cmds]);
  }

  /** Queue commands for the next tick to be processed. */
  enqueueNow(cmds: Command[]): void {
    this.enqueue(this._state.tick, cmds);
  }

  step(): StepResult {
    const t = this._state.tick;
    const cmds = this.queued.get(t) ?? [];
    this.queued.delete(t);
    const hook = this.aiEnabled ? this.aiHook : undefined;
    const res = stepSimulation(this._state, this._services, cmds, hook);
    if (res.nextCommands.length) this.enqueue(this._state.tick, res.nextCommands);
    return res;
  }
}
