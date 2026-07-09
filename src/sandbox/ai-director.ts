import { aiEconomyStep, aiStep } from '../ai/controller';
import type { SimServices } from '../sim/context';
import type { Command, GameState, PlayerId } from '../sim/types';
import type { SandboxAiSettings, SandboxSettings } from '../sim/sandbox-types';
import { ownedBy, isEnemy, isAlive } from '../sim/queries';
import { isCombatUnit } from '../sim/types';
import type { AiHook } from '../sim/step';

function findEnemySanctum(state: GameState, owner: PlayerId) {
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (e.kind === 'building' && e.defId === 'sanctum' && isAlive(e) && isEnemy(state, owner, e.owner)) {
      return e;
    }
  }
  return null;
}

function aiPlayers(state: GameState, skipPlayerId?: PlayerId) {
  return state.players.filter(
    (p) => p.controller === 'ai' && !p.defeated && p.id !== skipPlayerId,
  );
}

function forceAttackCommands(state: GameState, playerId: PlayerId): Command[] {
  const combat = ownedBy(state, playerId).filter((e) => isAlive(e) && isCombatUnit(e));
  if (!combat.length) return [];

  const enemyHq = findEnemySanctum(state, playerId);
  const ids = combat.map((e) => e.id);
  if (enemyHq) {
    return [{ type: 'attackMove', playerId, entityIds: ids, x: enemyHq.pos.x, y: enemyHq.pos.y }];
  }

  let targetId: number | null = null;
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (isAlive(e) && isEnemy(state, playerId, e.owner) && e.kind !== 'resource_node') {
      targetId = e.id;
      break;
    }
  }
  if (!targetId) return [];
  return [{ type: 'attack', playerId, entityIds: ids, targetId }];
}

function forceDefendCommands(state: GameState, playerId: PlayerId): Command[] {
  const sanctum = ownedBy(state, playerId).find((e) => e.defId === 'sanctum' && isAlive(e));
  if (!sanctum) return [];
  const units = ownedBy(state, playerId).filter((e) => isAlive(e) && isCombatUnit(e));
  if (!units.length) return [];
  return [{ type: 'move', playerId, entityIds: units.map((u) => u.id), x: sanctum.pos.x, y: sanctum.pos.y }];
}

function filterCommandsForPlayer(cmds: Command[], skipPlayerId?: PlayerId): Command[] {
  if (!skipPlayerId) return cmds;
  return cmds.filter((cmd) => !('playerId' in cmd) || cmd.playerId !== skipPlayerId);
}

export function createSandboxAiHook(
  settings: () => SandboxAiSettings,
  sandboxSettings: () => SandboxSettings,
  controlledPlayerId: () => PlayerId,
): AiHook {
  return (state: GameState, services: SimServices): Command[] => {
    const ai = settings();
    const skipPlayerId = sandboxSettings().gameplay.multiPlayerControl ? controlledPlayerId() : undefined;

    if (ai.forceMode === 'attack') {
      const cmds: Command[] = [];
      for (const p of aiPlayers(state, skipPlayerId)) {
        cmds.push(...forceAttackCommands(state, p.id));
      }
      return cmds;
    }
    if (ai.forceMode === 'defend') {
      const cmds: Command[] = [];
      for (const p of aiPlayers(state, skipPlayerId)) {
        cmds.push(...forceDefendCommands(state, p.id));
      }
      return cmds;
    }
    if (ai.forceMode === 'expand') {
      return filterCommandsForPlayer(aiEconomyStep(state, services), skipPlayerId);
    }
    if (ai.disabled || ai.paused) return [];
    return filterCommandsForPlayer(aiStep(state, services), skipPlayerId);
  };
}
