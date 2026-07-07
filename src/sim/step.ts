// The tick contract: runs all systems in a FIXED order. Changing the order changes results.
// AI runs right after applyCommands and emits commands that are queued for the NEXT tick.
import type { SimServices } from './context';
import type { StepContext } from './context';
import type { GameState, Command, GameEvent } from './types';
import { applyCommands } from './systems/apply-commands';
import { productionSystem } from './systems/production';
import { movementSystem } from './systems/movement';
import { combatSystem } from './systems/combat';
import { projectileSystem } from './systems/projectile';
import { harvestSystem } from './systems/harvest';
import { deathSystem } from './systems/death';
import { morphSystem } from './systems/morph';
import { winCheckSystem } from './systems/wincheck';

export type AiHook = (state: GameState, services: SimServices) => Command[];

export interface StepResult {
  events: GameEvent[];
  nextCommands: Command[];
}

export function stepSimulation(
  state: GameState,
  services: SimServices,
  cmds: Command[],
  aiHook?: AiHook,
): StepResult {
  const ctx: StepContext = { services, events: [] };
  const nextCommands: Command[] = [];

  services.spatial.rebuild(state.entities);

  applyCommands(state, ctx, cmds); // 1
  if (aiHook && !state.ended) nextCommands.push(...aiHook(state, services)); // 2 AI
  productionSystem(state, ctx); // 3
  morphSystem(state, ctx); // 3b mobile HQ deploy/pack
  movementSystem(state, ctx); // 4/5 (pathing computed on demand inside)
  combatSystem(state, ctx); // 6
  projectileSystem(state, ctx); // 6b projectiles
  harvestSystem(state, ctx); // 7
  deathSystem(state, ctx); // 8
  winCheckSystem(state, ctx); // 9

  state.tick++;
  return { events: ctx.events, nextCommands };
}
