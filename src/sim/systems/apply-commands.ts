// Translates the tick's command list into state changes. Commands are the ONLY entry point
// for mutating gameplay state (from human input, UI, AI, or the network).
import type { StepContext } from '../context';
import type { GameState, Command } from '../types';
import { getPlayer } from '../queries';
import {
  handleMove,
  handleAttackMove,
  handleMoveInOrder,
  handleAttack,
  handleHarvest,
  handleStop,
  handleSetStance,
} from './commands/orders';
import {
  handleBuild,
  handleDeploy,
  handlePack,
  handleSetRally,
  handleSellBuilding,
  handleSetRepair,
} from './commands/build';
import { handleProduce, handleCancelProduce } from './commands/production';
import { handleResearch, handleCancelResearch } from './commands/research';
import { handleChannel } from './commands/channel';
import { handleGarrison, handleUnloadGarrison } from './commands/garrison';
import { handleSpell } from './commands/spell';
import { handleSteerSuperweapon } from './commands/superweapon';
import { handleSurrender } from './commands/surrender';
import { applyDevCommand } from './commands/dev';

function isDevCommand(cmd: Command): cmd is Extract<Command, { type: `dev${string}` }> {
  return cmd.type.startsWith('dev');
}

export function applyCommands(state: GameState, ctx: StepContext, cmds: Command[]): void {
  for (const cmd of cmds) {
    if (isDevCommand(cmd)) {
      applyDevCommand(state, ctx, cmd);
      continue;
    }
    const player = getPlayer(state, cmd.playerId);
    if (!player || player.defeated) continue;
    switch (cmd.type) {
      case 'move':
        handleMove(state, ctx, cmd);
        break;
      case 'attackMove':
        handleAttackMove(state, ctx, cmd);
        break;
      case 'moveInOrder':
        handleMoveInOrder(state, ctx, cmd);
        break;
      case 'attack':
        handleAttack(state, ctx, cmd);
        break;
      case 'harvest':
        handleHarvest(state, ctx, cmd);
        break;
      case 'stop':
        handleStop(state, ctx, cmd);
        break;
      case 'setStance':
        handleSetStance(state, ctx, cmd);
        break;
      case 'build':
        handleBuild(state, ctx, cmd);
        break;
      case 'deploy':
        handleDeploy(state, ctx, cmd);
        break;
      case 'pack':
        handlePack(state, ctx, cmd);
        break;
      case 'produce':
        handleProduce(state, ctx, cmd);
        break;
      case 'cancelProduce':
        handleCancelProduce(state, ctx, cmd);
        break;
      case 'research':
        handleResearch(state, ctx, cmd);
        break;
      case 'cancelResearch':
        handleCancelResearch(state, ctx, cmd);
        break;
      case 'setRally':
        handleSetRally(state, ctx, cmd);
        break;
      case 'sellBuilding':
        handleSellBuilding(state, ctx, cmd);
        break;
      case 'setRepair':
        handleSetRepair(state, ctx, cmd);
        break;
      case 'garrison':
        handleGarrison(state, ctx, cmd);
        break;
      case 'unloadGarrison':
        handleUnloadGarrison(state, ctx, cmd);
        break;
      case 'channel':
        handleChannel(state, ctx, cmd);
        break;
      case 'castSpell':
        handleSpell(state, ctx, cmd);
        break;
      case 'steerSuperweapon':
        handleSteerSuperweapon(state, ctx, cmd);
        break;
      case 'surrender':
        handleSurrender(state, ctx, cmd);
        break;
    }
  }
}
