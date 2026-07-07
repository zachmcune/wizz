import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OrthoProjection,
  ObliqueProjection,
  setProjectionMode,
  getProjectionMode,
  facingToDirection,
  resolveProjectionMode,
  VISUAL_HEIGHT_STEP,
} from '../src/core/projection';
import { worldToScreen, screenToWorld, projectionSortKey } from '../src/core/coords';

const cam = { x: 100, y: 80, zoom: 1.5 };

describe('projection', () => {
  beforeEach(() => {
    setProjectionMode('ortho');
  });

  it('ortho worldToScreen matches legacy formula', () => {
    const world = { x: 250, y: 180 };
    expect(OrthoProjection.worldToScreen(world, cam)).toEqual({
      x: (world.x - cam.x) * cam.zoom,
      y: (world.y - cam.y) * cam.zoom,
    });
  });

  it('ortho round-trips screen/world', () => {
    const world = { x: 400, y: 320 };
    const screen = OrthoProjection.worldToScreen(world, cam);
    const back = OrthoProjection.screenToWorld(screen, cam);
    expect(back.x).toBeCloseTo(world.x, 5);
    expect(back.y).toBeCloseTo(world.y, 5);
  });

  it('oblique round-trips screen/world on ground plane', () => {
    setProjectionMode('oblique');
    const world = { x: 512, y: 384 };
    const screen = worldToScreen(world, cam);
    const back = screenToWorld(screen, cam);
    expect(back.x).toBeCloseTo(world.x, 4);
    expect(back.y).toBeCloseTo(world.y, 4);
  });

  it('oblique visual height lifts screen Y', () => {
    const ground = ObliqueProjection.worldToScreen({ x: 200, y: 200 }, cam, 0);
    const raised = ObliqueProjection.worldToScreen({ x: 200, y: 200 }, cam, 2);
    expect(raised.y).toBeLessThan(ground.y);
    expect(raised.x).toBeCloseTo(ground.x, 5);
    expect(ground.y - raised.y).toBeCloseTo(2 * VISUAL_HEIGHT_STEP * cam.zoom, 4);
  });

  it('oblique sortKey increases toward screen bottom', () => {
    setProjectionMode('oblique');
    const north = projectionSortKey({ x: 200, y: 100 }, cam);
    const south = projectionSortKey({ x: 200, y: 400 }, cam);
    expect(south).toBeGreaterThan(north);
  });

  it('facingToDirection maps 8 directions', () => {
    expect(facingToDirection(0)).toBe(0);
    expect(facingToDirection(Math.PI / 2)).toBe(2);
    expect(facingToDirection(Math.PI)).toBe(4);
  });

  it('resolveProjectionMode prefers URL override', () => {
    vi.stubGlobal('window', { location: { search: '?view=2d' } });
    expect(resolveProjectionMode('oblique')).toBe('ortho');
    vi.stubGlobal('window', { location: { search: '?view=oblique' } });
    expect(resolveProjectionMode('ortho')).toBe('oblique');
    vi.unstubAllGlobals();
  });

  it('getProjectionMode tracks setProjectionMode', () => {
    setProjectionMode('oblique');
    expect(getProjectionMode()).toBe('oblique');
    setProjectionMode('ortho');
    expect(getProjectionMode()).toBe('ortho');
  });
});
