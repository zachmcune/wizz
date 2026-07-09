// Removes dead entities and frees their nav-grid footprint (buildings).
import type { StepContext } from '../context';
import type { BuildingEntity } from '../entity-types';
import type { GameState } from '../types';
import { clearBuildingNav } from '../building-nav';
import { recomputePower } from '../factory';
import { applyDamage } from '../combat-util';
import { findSpawnPosition } from './production';

function ejectGarrisonOnDeath(state: GameState, ctx: StepContext, building: BuildingEntity): void {
  const garrison = ctx.services.registry.buildings.get(building.defId)?.garrison;
  if (!garrison || !building.garrisonedIds?.length) return;
  for (const id of [...building.garrisonedIds].sort((a, b) => a - b)) {
    const unit = state.entities.get(id);
    if (!unit || unit.kind !== 'unit' || unit.garrisonedIn !== building.id) continue;
    const spawn = findSpawnPosition(state, ctx, building, unit.radius);
    unit.garrisonedIn = undefined;
    unit.pos = { x: spawn.x, y: spawn.y };
    unit.vel = { x: 0, y: 0 };
    unit.orders = [];
    unit.state = 'idle';
    unit.targetId = undefined;
    applyDamage(state, ctx, unit, unit.maxHp * garrison.damageOnHostDestroyedFraction, { light: 1, heavy: 1, building: 1 });
  }
  building.garrisonedIds = [];
  building.garrisonReservedIds = [];
}

export function deathSystem(state: GameState, ctx: StepContext): void {
  const dead: number[] = [];
  for (const [id, e] of state.entities) {
    const deadEntity =
      e.kind === 'resource_node'
        ? (e.amount ?? 0) <= 0
        : e.kind === 'projectile'
          ? e.hp <= 0
          : e.state === 'dead' || e.hp <= 0;
    if (deadEntity) dead.push(id);
  }
  if (!dead.length) return;
  dead.sort((a, b) => a - b);
  let buildingDied = false;
  for (const id of dead) {
    const e = state.entities.get(id);
    if (!e) continue;
    if (e.kind === 'building') {
      ejectGarrisonOnDeath(state, ctx, e);
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
