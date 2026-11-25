// 2.5D projection: round-tripping, sorting, panning, and the "no 2D mode" invariant.
//
// The projection is the single world↔screen mapping, so a bug here misplaces every sprite and
// every click. Round-tripping is the strongest property and gets the most attention.

import { describe, expect, it } from 'vitest';
import {
  facingToDirection,
  FLYER_HOVER_LEVELS,
  ObliqueProjection,
  OBLIQUE_SCALE_X,
  OBLIQUE_SCALE_Y,
  VISUAL_HEIGHT_STEP,
  visibleWorldAabb,
} from '../../src/core/projection';
import type { CameraView } from '../../src/core/projection';

const cam: CameraView = { x: 500, y: 300, zoom: 1 };

describe('projection: scale constants', () => {
  it('is a 2:1 dimetric projection (X halves, Y quarters)', () => {
    expect(OBLIQUE_SCALE_X).toBe(0.5);
    expect(OBLIQUE_SCALE_Y).toBe(0.25);
    expect(VISUAL_HEIGHT_STEP).toBe(16);
    expect(FLYER_HOVER_LEVELS).toBe(2);
  });

  it('projects the world origin consistently', () => {
    const p = ObliqueProjection.projectGround({ x: 0, y: 0 });
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it('moves along the screen diagonal for a pure +X world step', () => {
    const a = ObliqueProjection.projectGround({ x: 0, y: 0 });
    const b = ObliqueProjection.projectGround({ x: 100, y: 0 });
    expect(b.x - a.x).toBeCloseTo(50, 6); // 100 * 0.5
    expect(b.y - a.y).toBeCloseTo(25, 6); // 100 * 0.25
  });

  it('moves the opposite way in X for a pure +Y world step', () => {
    const a = ObliqueProjection.projectGround({ x: 0, y: 0 });
    const b = ObliqueProjection.projectGround({ x: 0, y: 100 });
    expect(b.x - a.x).toBeCloseTo(-50, 6);
    expect(b.y - a.y).toBeCloseTo(25, 6);
  });

  it('visual height lifts the sprite up-screen only', () => {
    const ground = ObliqueProjection.projectGround({ x: 100, y: 100 }, 0);
    const lifted = ObliqueProjection.projectGround({ x: 100, y: 100 }, 1);
    expect(lifted.x).toBe(ground.x);
    expect(lifted.y - ground.y).toBeCloseTo(-VISUAL_HEIGHT_STEP, 6);
  });
});

describe('projection: round-trip', () => {
  const samples = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
    { x: 1024, y: 768 },
    { x: 3632, y: 2352 },
    { x: -500, y: -500 },
  ];

  it('screenToWorld inverts worldToScreen at zoom 1', () => {
    for (const world of samples) {
      const screen = ObliqueProjection.worldToScreen(world, cam);
      const back = ObliqueProjection.screenToWorld(screen, cam);
      expect(back.x).toBeCloseTo(world.x, 6);
      expect(back.y).toBeCloseTo(world.y, 6);
    }
  });

  it('round-trips at several zoom levels', () => {
    for (const zoom of [0.4, 0.75, 1, 1.5, 2]) {
      const c: CameraView = { x: 300, y: 200, zoom };
      for (const world of samples) {
        const screen = ObliqueProjection.worldToScreen(world, c);
        const back = ObliqueProjection.screenToWorld(screen, c);
        expect(back.x, `zoom ${zoom}`).toBeCloseTo(world.x, 6);
        expect(back.y, `zoom ${zoom}`).toBeCloseTo(world.y, 6);
      }
    }
  });

  it('round-trips with a visual height offset supplied on both sides', () => {
    const world = { x: 800, y: 640 };
    const screen = ObliqueProjection.worldToScreen(world, cam, 2);
    const back = ObliqueProjection.screenToWorld(screen, cam, 2);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });
});

describe('projection: depth sorting', () => {
  it('a nearer entity (larger screen Y) sorts in front', () => {
    const near = ObliqueProjection.sortKey({ x: 600, y: 600 }, cam);
    const far = ObliqueProjection.sortKey({ x: 100, y: 100 }, cam);
    expect(near).toBeGreaterThan(far);
  });

  it('a lifted entity sorts behind the same ground position', () => {
    const ground = ObliqueProjection.sortKey({ x: 400, y: 400 }, cam, 0);
    const lifted = ObliqueProjection.sortKey({ x: 400, y: 400 }, cam, 1);
    expect(lifted).toBeLessThan(ground);
  });
});

describe('projection: panning', () => {
  it('panning content with the pointer keeps the grabbed point under the pointer', () => {
    // Drag right by 40 px: the world point under the original cursor should still be under it.
    const c: CameraView = { x: 200, y: 150, zoom: 1 };
    const grabScreen = { x: 300, y: 250 };
    const grabbedWorld = ObliqueProjection.screenToWorld(grabScreen, c);

    const delta = ObliqueProjection.screenPanToCameraDelta(40, 0, c.zoom);
    const moved: CameraView = { x: c.x + delta.x, y: c.y + delta.y, zoom: c.zoom };
    const afterScreen = ObliqueProjection.worldToScreen(grabbedWorld, moved);

    expect(afterScreen.x).toBeCloseTo(grabScreen.x + 40, 6);
    expect(afterScreen.y).toBeCloseTo(grabScreen.y, 6);
  });

  it('pan delta scales inversely with zoom', () => {
    const d1 = ObliqueProjection.screenPanToCameraDelta(10, 0, 1);
    const d2 = ObliqueProjection.screenPanToCameraDelta(10, 0, 2);
    expect(d2.x).toBeCloseTo(d1.x / 2, 6);
    expect(d2.y).toBeCloseTo(d1.y / 2, 6);
  });
});

describe('projection: visible bounds', () => {
  it('the visible AABB contains all four viewport corners', () => {
    const rect = visibleWorldAabb(cam, 800, 600);
    for (const screen of [
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 0, y: 600 },
      { x: 800, y: 600 },
    ]) {
      const w = ObliqueProjection.screenToWorld(screen, cam);
      expect(w.x).toBeGreaterThanOrEqual(rect.minX - 1e-6);
      expect(w.x).toBeLessThanOrEqual(rect.maxX + 1e-6);
      expect(w.y).toBeGreaterThanOrEqual(rect.minY - 1e-6);
      expect(w.y).toBeLessThanOrEqual(rect.maxY + 1e-6);
    }
  });

  it('a larger viewport covers more world', () => {
    const small = visibleWorldAabb(cam, 400, 300);
    const large = visibleWorldAabb(cam, 1600, 1200);
    expect(large.maxX - large.minX).toBeGreaterThan(small.maxX - small.minX);
    expect(large.maxY - large.minY).toBeGreaterThan(small.maxY - small.minY);
  });
});

describe('projection: facing to direction', () => {
  it('maps the cardinal directions to 8 indices', () => {
    expect(facingToDirection(0)).toBe(0); // east
    expect(facingToDirection(Math.PI / 2)).toBe(2); // north
    expect(facingToDirection(Math.PI)).toBe(4); // west
    expect(facingToDirection(-Math.PI / 2)).toBe(6); // south
  });

  it('wraps negative and >2π angles', () => {
    expect(facingToDirection(-Math.PI / 4)).toBe(facingToDirection((7 * Math.PI) / 4));
    expect(facingToDirection(Math.PI * 4)).toBe(0);
  });

  it('always returns a valid index', () => {
    for (let i = 0; i < 64; i++) {
      const d = facingToDirection((i / 64) * Math.PI * 2 - Math.PI);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(7);
      expect(Number.isInteger(d)).toBe(true);
    }
  });
});

describe('projection: no 2D fallback exists', () => {
  it('exposes exactly one projection and no mode switch', async () => {
    // The rebuild keeps v1's decision that 2.5D is the only camera. If someone adds a second
    // projection later, this test should be updated deliberately rather than by accident.
    const mod = await import('../../src/core/projection');
    const exported = Object.keys(mod);
    expect(exported).toContain('ObliqueProjection');
    expect(exported.filter((k) => /ortho|topdown|classic|isometric2d/i.test(k))).toEqual([]);
  });
});
