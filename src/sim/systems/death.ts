// Removes dead entities and frees their nav-grid footprint (buildings).
import { TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { recomputePower } from '../factory';

export function deathSystem(state: GameState, ctx: StepContext): void {
  const dead: number[] = [];
  for (const [id, e] of state.entities) {
    if (e.state === 'dead' || e.hp <= 0) dead.push(id);
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
        const tx = Math.floor((e.pos.x - (b.footprint * TILE) / 2) / TILE);
        const ty = Math.floor((e.pos.y - (b.footprint * TILE) / 2) / TILE);
        ctx.services.nav.setBuildingBlock(tx, ty, b.footprint, false);
        ctx.services.flow.invalidate();
        buildingDied = true;
      }
    }
    state.entities.delete(id);
  }
  if (buildingDied) recomputePower(state, ctx.services);
}
