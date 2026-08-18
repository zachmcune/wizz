import { describe, expect, it } from 'vitest';
import { TILE } from '../src/core/constants';
import { buildMatchOverlay } from '../src/app/match/overlay-builder';
import { createSession } from '../src/input/session';
import type { Camera } from '../src/render/camera';
import { initMatch } from '../src/sim/factory';
import { getRegistry } from './helpers';

const reg = getRegistry();

function fakeCamera(): Camera {
  return {
    view: () => ({ x: 0, y: 0, zoom: 1 }),
    visibleWorldRect: () => ({ x: 0, y: 0, w: 4000, h: 3000 }),
  } as unknown as Camera;
}

describe('build placement overlay', () => {
  it('emits a tile-accurate build zone instead of overlapping radius squares', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const session = createSession();
    session.mode = 'build';
    session.buildDefId = 'attunement_spire';
    const overlay = buildMatchOverlay(state, services, reg, 'player0', session, fakeCamera(), { x: 0, y: 0 });

    expect(overlay.buildTiles?.length).toBeGreaterThan(100);
    expect(overlay.buildTiles?.some((t) => t.kind === 'open')).toBe(true);
    expect(overlay.buildTiles?.some((t) => t.kind === 'blocked')).toBe(true);
    expect('buildZones' in overlay).toBe(false);
  });

  it('forwards per-tile ghost cells so the cursor footprint can be painted', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sanctum = [...state.entities.values()].find((e) => e.defId === 'sanctum' && e.owner === 'player0')!;
    const session = createSession();
    session.mode = 'build';
    session.buildDefId = 'attunement_spire';
    session.buildGhost = {
      x: sanctum.pos.x + 4 * TILE,
      y: sanctum.pos.y,
      valid: true,
      cells: [
        { tx: 1, ty: 1, kind: 'ok' },
        { tx: 2, ty: 1, kind: 'ok' },
        { tx: 1, ty: 2, kind: 'ok' },
        { tx: 2, ty: 2, kind: 'blocked' },
      ],
    };
    const overlay = buildMatchOverlay(state, services, reg, 'player0', session, fakeCamera(), { x: 0, y: 0 });
    expect(overlay.ghost?.cells).toEqual(session.buildGhost.cells);
    expect(overlay.ghost?.valid).toBe(true);
  });

  it('omits the build-zone wash while deploying (deploy is not range-limited)', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const session = createSession();
    session.mode = 'deploy';
    session.buildGhost = { x: 100, y: 100, valid: true, cells: [{ tx: 3, ty: 3, kind: 'ok' }] };
    const overlay = buildMatchOverlay(state, services, reg, 'player0', session, fakeCamera(), { x: 0, y: 0 });
    expect(overlay.buildTiles).toBeUndefined();
    expect(overlay.ghost?.cells).toHaveLength(1);
  });
});
