import { describe, it, expect } from 'vitest';
import {
  ObliqueProjection,
  facingToDirection,
  VISUAL_HEIGHT_STEP,
} from '../src/core/projection';
import { worldToScreen, screenToWorld, projectionSortKey } from '../src/core/coords';

const cam = { x: 100, y: 80, zoom: 1.5 };

describe('2.5D projection', () => {
  it('round-trips screen/world on the ground plane', () => {
    const world = { x: 512, y: 384 };
    const screen = worldToScreen(world, cam);
    const back = screenToWorld(screen, cam);
    expect(back.x).toBeCloseTo(world.x, 4);
    expect(back.y).toBeCloseTo(world.y, 4);
  });

  it('visual height lifts screen Y', () => {
    const ground = ObliqueProjection.worldToScreen({ x: 200, y: 200 }, cam, 0);
    const raised = ObliqueProjection.worldToScreen({ x: 200, y: 200 }, cam, 2);
    expect(raised.y).toBeLessThan(ground.y);
    expect(raised.x).toBeCloseTo(ground.x, 5);
    expect(ground.y - raised.y).toBeCloseTo(2 * VISUAL_HEIGHT_STEP * cam.zoom, 4);
  });

  it('sortKey increases toward screen bottom', () => {
    const north = projectionSortKey({ x: 200, y: 100 }, cam);
    const south = projectionSortKey({ x: 200, y: 400 }, cam);
    expect(south).toBeGreaterThan(north);
  });

  it('facingToDirection maps 8 directions', () => {
    expect(facingToDirection(0)).toBe(0);
    expect(facingToDirection(Math.PI / 2)).toBe(2);
    expect(facingToDirection(Math.PI)).toBe(4);
  });
});
