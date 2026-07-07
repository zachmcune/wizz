import { describe, it, expect, beforeEach } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { setProjectionMode } from '../src/core/projection';
import { worldToScreen } from '../src/core/coords';
import { pickEntityForInput, unitsInScreenBox } from '../src/input/projected-pick';

const reg = getRegistry();

describe('oblique screen picking', () => {
  beforeEach(() => {
    setProjectionMode('oblique');
  });

  it('selects a unit when tapping its projected screen position', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const unit = [...state.entities.values()].find((e) => e.owner === 'player0' && e.kind === 'unit')!;
    const cam = { x: unit.pos.x - 200, y: unit.pos.y - 150, zoom: 1 };
    const screen = worldToScreen(unit.pos, cam);
    const picked = pickEntityForInput(state, 'player0', { x: 0, y: 0 }, screen, cam, services.nav);
    expect(picked?.id).toBe(unit.id);
  });

  it('box-selects units inside a screen drag rectangle', () => {
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    const unit = [...state.entities.values()].find((e) => e.owner === 'player0' && e.kind === 'unit')!;
    const cam = { x: unit.pos.x - 200, y: unit.pos.y - 150, zoom: 1 };
    const screen = worldToScreen(unit.pos, cam);
    const ids = unitsInScreenBox(
      state,
      'player0',
      { x: screen.x - 20, y: screen.y - 20 },
      { x: screen.x + 20, y: screen.y + 20 },
      cam,
    );
    expect(ids).toContain(unit.id);
  });

  it('does not box-select units outside the screen drag rectangle', () => {
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    const unit = [...state.entities.values()].find((e) => e.owner === 'player0' && e.kind === 'unit')!;
    const cam = { x: unit.pos.x - 200, y: unit.pos.y - 150, zoom: 1 };
    const screen = worldToScreen(unit.pos, cam);
    const ids = unitsInScreenBox(
      state,
      'player0',
      { x: screen.x + 80, y: screen.y + 80 },
      { x: screen.x + 120, y: screen.y + 120 },
      cam,
    );
    expect(ids).not.toContain(unit.id);
  });
});
