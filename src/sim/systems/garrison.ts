import type { StepContext } from '../context';
import type { Entity, UnitEntity } from '../entity-types';
import type { EntityId, GameState } from '../types';
import { garrisonedIds, garrisonedInId, hasMorph } from '../capabilities';
import { distSq } from '../math';
import { buildingHasPower } from '../power';
import { entitiesSorted, isAlive, isEnemy } from '../queries';
import { isVisibleTo } from '../fog';
import { fire } from './combat';

const scratch: EntityId[] = [];

function acquireGarrisonTarget(state: GameState, ctx: StepContext, unit: UnitEntity, range: number): Entity | null {
  const ids = ctx.services.spatial.queryRadius(unit.pos.x, unit.pos.y, range, scratch);
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const id of ids) {
    const target = state.entities.get(id);
    if (!target || target.kind === 'resource_node' || target.kind === 'projectile' || !isAlive(target)) continue;
    if (!isEnemy(state, unit.owner, target.owner)) continue;
    if (!isVisibleTo(state, unit.owner, target, ctx.services.nav)) continue;
    const d = distSq(unit.pos.x, unit.pos.y, target.pos.x, target.pos.y);
    if (d > range * range) continue;
    if (d < bestD || (d === bestD && (best === null || target.id < best.id))) {
      best = target;
      bestD = d;
    }
  }
  return best;
}

export function garrisonSystem(state: GameState, ctx: StepContext): void {
  for (const building of entitiesSorted(state)) {
    if (building.kind !== 'building' || !isAlive(building)) continue;
    if (building.buildProgress !== undefined || hasMorph(building)) continue;
    const ids = garrisonedIds(building);
    if (!ids.length) continue;
    if (!buildingHasPower(state, ctx.services.registry, building)) continue;
    const garrison = ctx.services.registry.buildings.get(building.defId)?.garrison;
    if (!garrison) continue;

    for (const id of [...ids].sort((a, b) => a - b)) {
      const unit = state.entities.get(id);
      if (!unit || unit.kind !== 'unit' || !isAlive(unit) || garrisonedInId(unit) !== building.id) continue;
      if (unit.cooldowns.attack && unit.cooldowns.attack > 0) unit.cooldowns.attack--;
      const weapon = ctx.services.registry.units.get(unit.defId)?.weapon;
      if (!weapon || (unit.cooldowns.attack ?? 0) > 0) continue;
      unit.pos = { x: building.pos.x, y: building.pos.y };
      const target = acquireGarrisonTarget(state, ctx, unit, weapon.range + (garrison.rangeBonus ?? 0));
      if (target) fire(state, ctx, unit, target, { ...weapon, range: weapon.range + (garrison.rangeBonus ?? 0) });
    }
  }
}
