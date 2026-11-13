// The tick contract: every system, in a FIXED order.
//
// The order is load-bearing and is asserted by a test (`tests/sim/step-order.test.ts`), because
// changing it silently changes combat outcomes. The v2 order matches v1 except that a single
// compaction now happens at the end of the tick instead of entities being deleted inline mid-tick.
//
//   1  applyCommands     player/AI intents become state changes
//   2  aiHook            emits commands for the NEXT tick (never mutates)
//   3  production        construction, unit queues, research, repair
//   4  morph             mobile-HQ deploy/pack
//   5  movement          flow-field steering, separation, collision
//   6  visibility        fog of war
//   7  combat            targeting, firing, chase
//   8  beamWeapon        continuous tower beams (frost/flame)
//   9  garrison          garrisoned units firing from inside
//  10  projectile        projectile travel and impact
//   11  superweapon       steerable satellite beam
//  12  aura              passive healing
//  13  harvest           wisp cycle
//  14  channel           mana weaver conjuring
//  15  death             eject occupants, free nav, compact
//  16  winCheck          defeat and match end

import type { StepContext } from './context';
import { createServices, newStepContext, type SimServices } from './context';
import type { Command, GameEvent, GameState } from './types';
import { applyCommands } from './systems/commands';
import { productionSystem } from './systems/production';
import { morphSystem } from './systems/morph';
import { movementSystem } from './systems/movement';
import { visibilitySystem } from './systems/fog-system';
import { combatSystem } from './systems/combat';
import { beamWeaponSystem } from './systems/beam-weapon';
import { garrisonSystem } from './systems/garrison';
import { projectileSystem } from './systems/projectile';
import { superweaponSystem } from './systems/superweapon';
import { auraSystem } from './systems/aura';
import { harvestSystem } from './systems/harvest';
import { channelSystem } from './systems/channel';
import { deathSystem } from './systems/death';
import { winCheckSystem } from './systems/wincheck';

export type AiHook = (state: GameState, services: SimServices) => Command[];

export interface StepResult {
  events: GameEvent[];
  nextCommands: Command[];
}

/**
 * The canonical system order. Exported so a test can assert it has not drifted — the whole point of
 * a fixed order is that an accidental reshuffle is a bug, not a refactor.
 */
export const SYSTEM_ORDER = [
  'applyCommands',
  'aiHook',
  'production',
  'morph',
  'movement',
  'visibility',
  'combat',
  'beamWeapon',
  'garrison',
  'projectile',
  'superweapon',
  'aura',
  'harvest',
  'channel',
  'death',
  'winCheck',
] as const;

export function stepSimulation(
  state: GameState,
  services: SimServices,
  cmds: Command[],
  aiHook?: AiHook,
): StepResult {
  const ctx: StepContext = newStepContext(services);
  const nextCommands: Command[] = [];

  services.spatial.rebuild(state.entities);

  applyCommands(state, ctx, cmds);
  if (aiHook && !state.ended) nextCommands.push(...aiHook(state, services));
  productionSystem(state, ctx);
  morphSystem(state, ctx);
  movementSystem(state, ctx);
  visibilitySystem(state, ctx);
  combatSystem(state, ctx);
  beamWeaponSystem(state, ctx);
  garrisonSystem(state, ctx);
  projectileSystem(state, ctx);
  superweaponSystem(state, ctx);
  auraSystem(state, ctx);
  harvestSystem(state, ctx);
  channelSystem(state, ctx);
  deathSystem(state, ctx);
  winCheckSystem(state, ctx);

  state.tick++;
  return { events: ctx.events, nextCommands };
}

export { createServices };
