// Removes dead entities and frees their nav-grid footprint (buildings).
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { clearBuildingNav } from '../building-nav';
import { recomputePower } from '../factory';

export function deathSystem(state: GameState, ctx: StepContext): void {
  const dead: number[] = [];
  for (const [id, e] of state.entities) {
    const deadEntity =
      e.kind === 'resource_node' ? (e.amount ?? 0) <= 0 : e.state === 'dead' || e.hp <= 0;
    if (deadEntity) dead.push(id);
  }
  if (!dead.length) return;
  dead.sort((a, b) => a - b);
  let buildingDied = false;
  for (const id of dead) {
    const e = state.entities.get(id);
    if (!e) continue;
    if (e.kind === 'building') {
      const b = ctx.services.registry.buildings.get(e.defId);
      if (b) {
        clearBuildingNav(ctx.services.nav, b, e.pos.x, e.pos.y);
        ctx.services.flow.invalidate();
        buildingDied = true;
      }
    }
    state.entities.delete(id);
  }
  if (buildingDied) recomputePower(state, ctx.services);
}
