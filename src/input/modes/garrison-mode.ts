import { canUnitGarrison, garrisonFreeCapacity } from '../../sim/garrison';
import { isAlive } from '../../sim/queries';
import { pickEntityForInput } from '../projected-pick';
import type { ModeTapHandler } from '../input-context';

export const garrisonMode: ModeTapHandler = {
  onTap(ctx, screen, world): void {
    const st = ctx.getState();
    const picked = pickEntityForInput(st, ctx.playerId, world, screen, ctx.camera.view(), ctx.nav);
    if (!picked || picked.owner !== ctx.playerId || picked.kind !== 'building') {
      ctx.setMode('normal');
      return;
    }
    if (garrisonFreeCapacity(ctx.registry, picked) <= 0) {
      ctx.setMode('normal');
      return;
    }
    const unitIds = ctx.session.garrisonUnitIds.filter((id) => {
      const unit = st.entities.get(id);
      return unit && unit.kind === 'unit' && isAlive(unit) && canUnitGarrison(ctx.registry, unit, picked);
    });
    if (unitIds.length) {
      ctx.emit({ type: 'garrison', playerId: ctx.playerId, unitIds, buildingId: picked.id });
      ctx.onOrderFeedback('garrison', picked.pos);
    }
    ctx.setMode('normal');
  },
};
