// Orchestrates the sim: owns state + services + a per-tick command queue, and drives ticks.
// Commands from input/UI/AI/network all funnel through enqueue(); AI is an injected hook.
import type { SimServices } from './context';
import type { GameState, Command } from './types';
import { stepSimulation, type AiHook, type StepResult } from './step';
import { aiStep } from '../ai/controller';

export class Simulation {
  private queued = new Map<number, Command[]>();
  aiEnabled = true;

  constructor(
    public state: GameState,
    public services: SimServices,
    private aiHook: AiHook = aiStep,
  ) {}

  /** Queue commands to be applied on a specific tick. */
  enqueue(tick: number, cmds: Command[]): void {
    if (!cmds.length) return;
    const list = this.queued.get(tick);
    if (list) list.push(...cmds);
    else this.queued.set(tick, [...cmds]);
  }

  /** Queue commands for the next tick to be processed. */
  enqueueNow(cmds: Command[]): void {
    this.enqueue(this.state.tick, cmds);
  }

  step(): StepResult {
    const t = this.state.tick;
    const cmds = this.queued.get(t) ?? [];
    this.queued.delete(t);
    const res = stepSimulation(this.state, this.services, cmds, this.aiEnabled ? this.aiHook : undefined);
    if (res.nextCommands.length) this.enqueue(this.state.tick, res.nextCommands);
    return res;
  }
}
