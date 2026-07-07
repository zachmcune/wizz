import type { StepContext } from '../../context';
import type { GameState, Entity, EntityId, PlayerId } from '../../types';
import { isAlive } from '../../queries';
import { recomputePower } from '../../factory';
import { clearBuildingNav } from '../../building-nav';

export function ownedAliveUnits(state: GameState, playerId: PlayerId, ids: EntityId[]): Entity[] {
  const out: Entity[] = [];
  for (const id of ids) {
    const e = state.entities.get(id);
    if (e && e.owner === playerId && isAlive(e) && e.kind === 'unit') out.push(e);
  }
  return out;
}

export function requirementsMet(player: { unlockedTech: string[] }, requires: string[]): boolean {
  return requires.every((r) => player.unlockedTech.includes(r));
}

export function removeBuildingFromWorld(state: GameState, ctx: StepContext, building: Entity): void {
  const bdef = ctx.services.registry.buildings.get(building.defId);
  if (bdef) {
    clearBuildingNav(ctx.services.nav, bdef, building.pos.x, building.pos.y);
    ctx.services.flow.invalidate();
  }
  state.entities.delete(building.id);
  recomputePower(state, ctx.services);
}
