import type { BuildingDef } from '../../../data/defs';
import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { getPlayer } from '../../queries';
import { requirementsMet } from './shared';

export function handleProduce(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'produce' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const b = state.entities.get(cmd.buildingId);
  if (!b || b.owner !== cmd.playerId || b.kind !== 'building' || b.buildProgress !== undefined || b.morphProgress !== undefined) return;
  const bdef = ctx.services.registry.buildings.get(b.defId) as BuildingDef | undefined;
  const udef = ctx.services.registry.units.get(cmd.defId);
  if (!bdef || !udef || !bdef.producesUnits?.includes(cmd.defId)) return;
  if (!requirementsMet(player, udef.requires)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'requires' });
    return;
  }
  if (player.mana < udef.cost) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'mana' });
    return;
  }
  player.mana -= udef.cost;
  b.productionQueue ??= [];
  b.productionQueue.push({ defId: cmd.defId, progress: 0, required: Math.round(udef.buildTime * 20) });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

export function handleCancelProduce(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'cancelProduce' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const b = state.entities.get(cmd.buildingId);
  if (!b || b.owner !== cmd.playerId || !b.productionQueue) return;
  const item = b.productionQueue[cmd.index];
  if (!item) return;
  const udef = ctx.services.registry.units.get(item.defId);
  if (udef) {
    player.mana += udef.cost;
    ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
  }
  b.productionQueue.splice(cmd.index, 1);
}
