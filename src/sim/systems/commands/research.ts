import { secondsToTicks } from '../../../core/constants';
import type { StepContext } from '../../context';
import type { Command, GameState } from '../../types';
import { getPlayer, isAlive } from '../../queries';
import { requirementsMet } from './shared';
import { sandboxIgnoreTech, sandboxNoCosts } from '../../sandbox-flags';

export function handleResearch(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'research' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const building = state.entities.get(cmd.buildingId);
  if (!building || building.owner !== cmd.playerId || building.kind !== 'building' || !isAlive(building)) return;
  if (building.buildProgress !== undefined || building.morphProgress !== undefined) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'busy' });
    return;
  }
  const research = ctx.services.registry.research.get(cmd.defId);
  if (!research || research.researchedAt !== building.defId) return;
  if (!sandboxIgnoreTech(state) && !requirementsMet(player, research.requires)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'requires' });
    return;
  }
  if (player.completedResearch.includes(research.id)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'duplicate' });
    return;
  }
  if (building.researchQueue?.some((item) => item.defId === research.id)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'duplicate' });
    return;
  }
  if (!sandboxNoCosts(state) && player.mana < research.cost) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'mana' });
    return;
  }
  if (!sandboxNoCosts(state)) player.mana -= research.cost;
  building.researchQueue ??= [];
  building.researchQueue.push({ defId: research.id, progress: 0, required: secondsToTicks(research.researchTime) });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

export function handleCancelResearch(
  state: GameState,
  ctx: StepContext,
  cmd: Extract<Command, { type: 'cancelResearch' }>,
): void {
  const player = getPlayer(state, cmd.playerId)!;
  const building = state.entities.get(cmd.buildingId);
  if (!building || building.owner !== cmd.playerId || building.kind !== 'building' || !isAlive(building)) return;
  const queue = building.researchQueue;
  if (!queue || cmd.index < 0 || cmd.index >= queue.length) return;
  const [item] = queue.splice(cmd.index, 1);
  if (!item) return;
  const research = ctx.services.registry.research.get(item.defId);
  if (research) {
    player.mana += research.cost;
    ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
  }
}
