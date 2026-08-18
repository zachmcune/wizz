import { describe, expect, it, vi } from 'vitest';
import { TILE } from '../src/core/constants';
import { InputController } from '../src/input/controller';
import type { Camera } from '../src/render/camera';
import type { NavGrid } from '../src/sim/nav-grid';
import type { GameState } from '../src/sim/types';
import { getRegistry } from './helpers';

function makeController(): InputController {
  const registry = getRegistry();
  return new InputController(
    () =>
      ({
        entities: new Map(),
        players: [],
        tick: 0,
      }) as unknown as GameState,
    {
      view: () => ({ x: 0, y: 0, zoom: 1 }),
      visibleWorldRect: () => ({ x: 0, y: 0, w: 800, h: 600 }),
    } as unknown as Camera,
    registry,
    {} as unknown as NavGrid,
    'p1',
    vi.fn(),
    vi.fn(),
    () => true,
    () => true,
    () => false,
  );
}

describe('build ghost under the pointer', () => {
  it('places the ghost at the last pointer world position when a building is selected', () => {
    const controller = makeController();
    controller.notePointerWorld({ x: 250, y: 260 });
    controller.startBuild('ley_conduit');

    expect(controller.session.mode).toBe('build');
    expect(controller.session.buildDefId).toBe('ley_conduit');
    expect(controller.session.buildGhost).toMatchObject({
      x: (Math.floor((250 - TILE) / TILE) + 1) * TILE,
      y: (Math.floor((260 - TILE) / TILE) + 1) * TILE,
      valid: true,
    });
  });

  it('falls back to a camera-relative anchor when the pointer has not moved yet', () => {
    const controller = makeController();
    controller.startBuild('ley_conduit');

    expect(controller.session.buildGhost).toMatchObject({
      x: (Math.floor((100 - TILE) / TILE) + 1) * TILE,
      y: (Math.floor((100 - TILE) / TILE) + 1) * TILE,
    });
  });
});
