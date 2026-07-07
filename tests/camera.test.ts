import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Camera } from '../src/render/camera';
import { worldToScreen, screenToWorld, tileToWorld, worldToTileX } from '../src/core/coords';
import { MIN_ZOOM, MAX_ZOOM, TILE } from '../src/core/constants';
import { setProjectionMode } from '../src/core/projection';

describe('camera & coordinate math', () => {
  afterEach(() => {
    setProjectionMode('ortho');
  });

  beforeEach(() => {
    setProjectionMode('ortho');
  });
  it('clamps position to map bounds with overscroll margin', () => {
    const cam = new Camera(800, 600, 2000, 1500);
    cam.centerOn(-1000, -1000);
    expect(cam.x).toBeGreaterThanOrEqual(-800 * 0.45);
    expect(cam.y).toBeGreaterThanOrEqual(-600 * 0.45);
    cam.centerOn(99999, 99999);
    const maxX = 2000 - 800 / cam.zoom + 800 * 0.45;
    const maxY = 1500 - 600 / cam.zoom + 600 * 0.45;
    expect(cam.x).toBeLessThanOrEqual(maxX);
    expect(cam.y).toBeLessThanOrEqual(maxY);
  });

  it('allows extra horizontal overscroll in oblique mode', () => {
    setProjectionMode('ortho');
    let cam = new Camera(800, 600, 2048, 1408);
    cam.x = -1000;
    cam.setViewport(800, 600);
    const orthoMinX = cam.x;

    setProjectionMode('oblique');
    cam = new Camera(800, 600, 2048, 1408);
    cam.x = -1000;
    cam.setViewport(800, 600);
    expect(cam.x).toBeLessThan(orthoMinX);
  });

  it('clamps zoom to limits', () => {
    const cam = new Camera(800, 600, 4000, 4000);
    for (let i = 0; i < 50; i++) cam.zoomAt({ x: 400, y: 300 }, 1.5);
    expect(cam.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    for (let i = 0; i < 50; i++) cam.zoomAt({ x: 400, y: 300 }, 0.5);
    expect(cam.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it('screen<->world round-trips', () => {
    const cam = new Camera(800, 600, 4000, 4000);
    cam.centerOn(1500, 1200);
    const world = { x: 1450, y: 1180 };
    const screen = worldToScreen(world, cam.view());
    const back = screenToWorld(screen, cam.view());
    expect(back.x).toBeCloseTo(world.x, 4);
    expect(back.y).toBeCloseTo(world.y, 4);
  });

  it('tile<->world conversions are consistent', () => {
    const c = tileToWorld(3, 5);
    expect(c.x).toBe(3 * TILE + TILE / 2);
    expect(worldToTileX(c.x)).toBe(3);
  });

  it('screen<->world round-trips in oblique mode', () => {
    setProjectionMode('oblique');
    const cam = new Camera(800, 600, 4000, 4000);
    cam.centerOn(1500, 1200);
    const world = { x: 1450, y: 1180 };
    const screen = worldToScreen(world, cam.view());
    const back = screenToWorld(screen, cam.view());
    expect(back.x).toBeCloseTo(world.x, 4);
    expect(back.y).toBeCloseTo(world.y, 4);
  });

  it('oblique pan moves world content with the finger', () => {
    setProjectionMode('oblique');
    const cam = new Camera(800, 600, 4000, 4000);
    cam.centerOn(1500, 1200);
    const world = { x: 1450, y: 1180 };
    const before = worldToScreen(world, cam.view());
    cam.panByScreen(42, -28);
    const after = worldToScreen(world, cam.view());
    expect(after.x - before.x).toBeCloseTo(42, 0);
    expect(after.y - before.y).toBeCloseTo(-28, 0);
  });
});
