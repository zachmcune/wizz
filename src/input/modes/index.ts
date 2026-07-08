import type { InputMode } from '../session';
import type { InputContext, ModeTapHandler } from '../input-context';
import { attackMoveMode } from './attack-move-mode';
import { buildMode } from './build-mode';
import { deployMode } from './deploy-mode';
import { normalMode } from './normal-mode';
import { garrisonMode } from './garrison-mode';
import { rallyMode } from './rally-mode';
import { spellMode } from './spell-mode';
import { superweaponMode } from './superweapon-mode';

const TAP_HANDLERS: Record<InputMode, ModeTapHandler> = {
  normal: normalMode,
  build: buildMode,
  deploy: deployMode,
  spell: spellMode,
  rally: rallyMode,
  garrison: garrisonMode,
  attackMove: attackMoveMode,
  superweapon: superweaponMode,
};

export function handleModeTap(ctx: InputContext, mode: InputMode, screen: import('../../core/coords').Vec2, world: import('../../core/coords').Vec2): void {
  if (mode === 'spell' && !ctx.session.spellId) {
    normalMode.onTap(ctx, screen, world);
    return;
  }
  if (mode === 'superweapon' && !ctx.session.spellId) {
    normalMode.onTap(ctx, screen, world);
    return;
  }
  if (mode === 'rally' && !ctx.session.rallyBuildingId) {
    normalMode.onTap(ctx, screen, world);
    return;
  }
  if (mode === 'garrison' && ctx.session.garrisonUnitIds.length === 0) {
    normalMode.onTap(ctx, screen, world);
    return;
  }
  TAP_HANDLERS[mode].onTap(ctx, screen, world);
}

export { normalMode, boxSelect, doubleTapSelectType } from './normal-mode';
export { attackMoveMode } from './attack-move-mode';
export * from './build-mode';
export * from './deploy-mode';
export * from './spell-mode';
export { superweaponMode } from './superweapon-mode';
export * from './rally-mode';
export * from './garrison-mode';
export { isWallBuild } from '../placement';
