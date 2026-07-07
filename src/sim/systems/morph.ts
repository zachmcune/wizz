// Mobile HQ deploy (unit → building) and pack (building → unit) progress.
import { TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, Entity } from '../types';
import { entitiesSorted } from '../queries';
import { spawnEntity, recomputePower, unlockTech } from '../factory';
import type { BuildingDef } from '../../data/defs';

export function morphSystem(state: GameState, ctx: StepContext): void {
  let powerDirty = false;
  for (const e of entitiesSorted(state)) {
    if (e.morphProgress === undefined || !e.morphAction) continue;

    if (e.morphAction === 'deploy' && e.kind === 'unit') {
      const udef = ctx.services.registry.units.get(e.defId);
      if (!udef?.deploysAs) continue;
      const seconds = udef.deployTime ?? 10;
      e.morphProgress += 1 / Math.max(1, seconds * 20);
      if (e.morphProgress >= 1) {
        finishDeploy(state, ctx, e, udef.deploysAs);
        powerDirty = true;
      }
      continue;
    }

    if (e.morphAction === 'pack' && e.kind === 'building') {
      const bdef = ctx.services.registry.buildings.get(e.defId);
      if (!bdef?.packsInto) continue;
      const seconds = bdef.packTime ?? 8;
      e.morphProgress += 1 / Math.max(1, seconds * 20);
      if (e.morphProgress >= 1) {
        finishPack(state, ctx, e, bdef);
        powerDirty = true;
      }
    }
  }
  if (powerDirty) recomputePower(state, ctx.services);
}

function finishDeploy(state: GameState, ctx: StepContext, unit: Entity, buildingDefId: string): void {
  const bdef = ctx.services.registry.buildings.get(buildingDefId);
  if (!bdef || !unit.morphTargetPos) {
    state.entities.delete(unit.id);
    return;
  }
  const ratio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
  const pos = unit.morphTargetPos;
  const b = spawnEntity(state, ctx.services, ctx, buildingDefId, unit.owner, pos.x, pos.y);
  b.hp = Math.max(1, Math.floor(b.maxHp * ratio));
  unlockTech(state, unit.owner, buildingDefId);
  ctx.events.push({ type: 'mobileHQDeployed', id: b.id, defId: buildingDefId, owner: unit.owner });
  ctx.events.push({ type: 'buildingComplete', id: b.id, defId: buildingDefId, owner: unit.owner });
  state.entities.delete(unit.id);
}

function finishPack(state: GameState, ctx: StepContext, building: Entity, bdef: BuildingDef): void {
  const unitDefId = bdef.packsInto;
  if (!unitDefId) return;
  const udef = ctx.services.registry.units.get(unitDefId);
  if (!udef) return;

  const ratio = building.maxHp > 0 ? building.hp / building.maxHp : 1;
  const tx = Math.floor((building.pos.x - (bdef.footprint * TILE) / 2) / TILE);
  const ty = Math.floor((building.pos.y - (bdef.footprint * TILE) / 2) / TILE);
  ctx.services.nav.setBuildingBlock(tx, ty, bdef.footprint, false);
  ctx.services.flow.invalidate();

  const u = spawnEntity(state, ctx.services, ctx, unitDefId, building.owner, building.pos.x, building.pos.y);
  u.hp = Math.max(1, Math.floor(u.maxHp * ratio));
  ctx.events.push({ type: 'mobileHQPacked', id: u.id, defId: unitDefId, owner: building.owner });
  state.entities.delete(building.id);
}
