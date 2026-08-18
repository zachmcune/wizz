import type { Vec2 } from '../../core/coords';
import type { EntityId } from '../../sim/types';
import { isHarvester, isEnemy, canUnitGarrison, garrisonFreeCapacity } from '../../sim/views';
import {
  pickEntityForInput,
  pickResourceNodeForInput,
  unitsInScreenBox,
} from '../projected-pick';
import type { InputContext, ModeTapHandler } from '../input-context';

export const normalMode: ModeTapHandler = {
  onTap(ctx, screen, world): void {
    const st = ctx.getState();
    const cam = ctx.camera.view();
    const node = pickResourceNodeForInput(st, ctx.playerId, world, screen, cam, ctx.nav, ctx.registry);
    const picked = node ?? pickEntityForInput(st, ctx.playerId, world, screen, cam, ctx.nav, ctx.registry);
    const combatUnits = ctx.ownCombatSelected();
    const wisps = ctx.ownWispsSelected();
    const harvesters = wisps.length ? wisps : ctx.allOwnWisps();
    const movable = ctx.selectionEntities()
      .filter((e) => e.owner === ctx.playerId && e.kind === 'unit')
      .map((e) => e.id);

    if (combatUnits.length > 0) {
      if (picked && isEnemy(st, ctx.playerId, picked.owner)) {
        ctx.emit({ type: 'attack', playerId: ctx.playerId, entityIds: combatUnits, targetId: picked.id });
        ctx.onOrderFeedback('attack', picked.pos);
        return;
      }
      if (picked && picked.owner === ctx.playerId && picked.kind === 'unit') {
        ctx.setSelection([picked.id]);
        return;
      }
      if (picked && picked.owner === ctx.playerId && picked.kind === 'building') {
        const garrisonIds = combatUnits.filter((id) => {
          const unit = st.entities.get(id);
          return unit && unit.kind === 'unit' && canUnitGarrison(ctx.registry, unit, picked);
        });
        if (garrisonIds.length && garrisonFreeCapacity(ctx.registry, picked) > 0) {
          ctx.emit({ type: 'garrison', playerId: ctx.playerId, unitIds: garrisonIds, buildingId: picked.id });
          ctx.onOrderFeedback('garrison', picked.pos);
          return;
        }
        ctx.setSelection([picked.id]);
        return;
      }
      if (movable.length) {
        ctx.emit({ type: 'move', playerId: ctx.playerId, entityIds: movable, x: world.x, y: world.y });
        ctx.onOrderFeedback('move', world);
        return;
      }
    }

    if (node && harvesters.length) {
      ctx.issueHarvest(node, harvesters);
      return;
    }

    if (picked) {
      if (picked.owner === ctx.playerId && picked.kind === 'building') {
        const garrisonIds = movable.filter((id) => {
          const unit = st.entities.get(id);
          return unit && unit.kind === 'unit' && canUnitGarrison(ctx.registry, unit, picked);
        });
        if (garrisonIds.length && garrisonFreeCapacity(ctx.registry, picked) > 0) {
          ctx.emit({ type: 'garrison', playerId: ctx.playerId, unitIds: garrisonIds, buildingId: picked.id });
          ctx.onOrderFeedback('garrison', picked.pos);
          return;
        }
      }
      if (picked.owner === ctx.playerId && ctx.session.selection.has(picked.id)) {
        ctx.setSelection([...ctx.session.selection].filter((id) => id !== picked.id));
        return;
      }
      if (picked.kind === 'resource_node' && harvesters.length) {
        ctx.issueHarvest(picked, harvesters);
        return;
      }
      if (isHarvester(picked) && picked.owner === ctx.playerId) {
        ctx.setSelection([picked.id]);
        return;
      }
      ctx.setSelection([picked.id]);
      return;
    }

    if (movable.length) {
      ctx.emit({ type: 'move', playerId: ctx.playerId, entityIds: movable, x: world.x, y: world.y });
      ctx.onOrderFeedback('move', world);
      return;
    }
    ctx.setSelection([]);
  },
};

export function doubleTapSelectType(ctx: InputContext, screen: Vec2, world: Vec2): void {
  const st = ctx.getState();
  const cam = ctx.camera.view();
  const picked = pickEntityForInput(st, ctx.playerId, world, screen, cam, ctx.nav, ctx.registry);
  if (!picked || picked.owner !== ctx.playerId || picked.kind !== 'unit') {
    normalMode.onTap(ctx, screen, world);
    return;
  }
  const rect = ctx.camera.visibleWorldRect();
  const ids: EntityId[] = [];
  for (const e of st.entities.values()) {
    if (e.owner !== ctx.playerId || e.kind !== 'unit' || e.defId !== picked.defId) continue;
    if (e.pos.x >= rect.x && e.pos.x <= rect.x + rect.w && e.pos.y >= rect.y && e.pos.y <= rect.y + rect.h) ids.push(e.id);
  }
  ctx.setSelection(ids);
}

export function boxSelect(ctx: InputContext, a: Vec2, b: Vec2): void {
  const st = ctx.getState();
  const cam = ctx.camera.view();
  const units = unitsInScreenBox(st, ctx.playerId, a, b, cam, ctx.nav, ctx.registry);
  ctx.setSelection(units);
  ctx.session.boxRect = null;
}
