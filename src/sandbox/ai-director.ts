import { aiStep } from '../ai/controller';
import type { SimServices } from '../sim/context';
import type { Command, GameState } from '../sim/types';
import type { SandboxAiSettings } from '../sim/sandbox-types';
import { ownedBy, isEnemy, isAlive } from '../sim/queries';
import type { AiHook } from '../sim/step';

function forceAttackCommands(state: GameState, playerId: string): Command[] {
  const cmds: Command[] = [];
  const enemies = ownedBy(state, playerId).filter((e) => isAlive(e) && e.kind === 'unit');
  let targetId: number | null = null;
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (isAlive(e) && isEnemy(state, playerId, e.owner) && e.kind !== 'resource_node') {
      targetId = e.id;
      break;
    }
  }
  if (!targetId) return cmds;
  const ids = enemies.map((e) => e.id);
  if (ids.length) cmds.push({ type: 'attack', playerId, entityIds: ids, targetId });
  return cmds;
}

function forceDefendCommands(state: GameState, playerId: string): Command[] {
  const sanctum = ownedBy(state, playerId).find((e) => e.defId === 'sanctum' && isAlive(e));
  if (!sanctum) return [];
  const units = ownedBy(state, playerId).filter((e) => isAlive(e) && e.kind === 'unit');
  if (!units.length) return [];
  return [{ type: 'move', playerId, entityIds: units.map((u) => u.id), x: sanctum.pos.x, y: sanctum.pos.y }];
}

export function createSandboxAiHook(settings: () => SandboxAiSettings): AiHook {
  return (state: GameState, services: SimServices): Command[] => {
    const ai = settings();
    if (ai.disabled || ai.paused) return [];
    if (ai.forceMode === 'attack') {
      const cmds: Command[] = [];
      for (const p of state.players) {
        if (p.controller !== 'ai' || p.defeated) continue;
        cmds.push(...forceAttackCommands(state, p.id));
      }
      return cmds;
    }
    if (ai.forceMode === 'defend') {
      const cmds: Command[] = [];
      for (const p of state.players) {
        if (p.controller !== 'ai' || p.defeated) continue;
        cmds.push(...forceDefendCommands(state, p.id));
      }
      return cmds;
    }
    return aiStep(state, services);
  };
}
