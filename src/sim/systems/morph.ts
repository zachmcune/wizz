// Mobile HQ deploy (unit → building) and pack (building → unit) progress.
import { clearBuildingNav } from '../building-nav';
import type { StepContext } from '../context';
import type { BuildingEntity, UnitEntity } from '../entity-types';
import type { GameState } from '../types';
import { entitiesSorted } from '../queries';
import { spawnEntity, recomputePower, unlockTech } from '../factory';
import { getMorph, hasMorph, ensureMorph } from '../capabilities';
import type { BuildingDef } from '../../data/defs';

export function morphSystem(state: GameState, ctx: StepContext): void {
  let powerDirty = false;
  for (const e of entitiesSorted(state)) {
    if (e.kind === 'unit' && hasMorph(e) && getMorph(e)?.action === 'deploy') {
      const udef = ctx.services.registry.units.get(e.defId);
      if (!udef?.deploysAs) continue;
      const seconds = udef.deployTime ?? 10;
      const morph = ensureMorph(e);
      morph.progress += 1 / Math.max(1, seconds * 20);
      if (morph.progress >= 1) {
        finishDeploy(state, ctx, e, udef.deploysAs);
        powerDirty = true;
      }
      continue;
    }

    if (e.kind === 'building' && hasMorph(e) && getMorph(e)?.action === 'pack') {
      const bdef = ctx.services.registry.buildings.get(e.defId);
      if (!bdef?.packsInto) continue;
      const seconds = bdef.packTime ?? 8;
      const morph = ensureMorph(e);
      morph.progress += 1 / Math.max(1, seconds * 20);
      if (morph.progress >= 1) {
        finishPack(state, ctx, e, bdef);
        powerDirty = true;
      }
    }
  }
  if (powerDirty) recomputePower(state, ctx.services);
}

function finishDeploy(state: GameState, ctx: StepContext, unit: UnitEntity, buildingDefId: string): void {
  const bdef = ctx.services.registry.buildings.get(buildingDefId);
  const targetPos = getMorph(unit)?.targetPos;
  if (!bdef || !targetPos) {
    state.entities.delete(unit.id);
    return;
  }
  const ratio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
  const pos = targetPos;
  const b = spawnEntity(state, ctx.services, ctx, buildingDefId, unit.owner, pos.x, pos.y);
  if (b.kind !== 'building') return;
  b.hp = Math.max(1, Math.floor(b.maxHp * ratio));
  unlockTech(state, unit.owner, buildingDefId);
  ctx.events.push({ type: 'mobileHQDeployed', id: b.id, defId: buildingDefId, owner: unit.owner });
  ctx.events.push({ type: 'buildingComplete', id: b.id, defId: buildingDefId, owner: unit.owner });
  state.entities.delete(unit.id);
}

function finishPack(state: GameState, ctx: StepContext, building: BuildingEntity, bdef: BuildingDef): void {
  const unitDefId = bdef.packsInto;
  if (!unitDefId) return;
  const udef = ctx.services.registry.units.get(unitDefId);
  if (!udef) return;

  const ratio = building.maxHp > 0 ? building.hp / building.maxHp : 1;
  clearBuildingNav(ctx.services.nav, bdef, building.pos.x, building.pos.y);
  ctx.services.flow.invalidate();

  const u = spawnEntity(state, ctx.services, ctx, unitDefId, building.owner, building.pos.x, building.pos.y);
  if (u.kind !== 'unit') return;
  u.hp = Math.max(1, Math.floor(u.maxHp * ratio));
  ctx.events.push({ type: 'mobileHQPacked', id: u.id, defId: unitDefId, owner: building.owner });
  state.entities.delete(building.id);
}
