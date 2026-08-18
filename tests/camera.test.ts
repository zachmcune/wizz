import { describe, it, expect } from 'vitest';
import { Camera } from '../src/render/camera';
import { worldToScreen, screenToWorld, tileToWorld, worldToTileX } from '../src/core/coords';
import { MIN_ZOOM, MAX_ZOOM, TILE } from '../src/core/constants';

describe('camera & coordinate math', () => {
  it('allows extra horizontal overscroll past the map edge', () => {
    const cam = new Camera(800, 600, 4096, 2816);
    cam.x = -1000;
    cam.setViewport(800, 600);
    expect(cam.x).toBeLessThan(0);
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

  it('centers a world point on screen', () => {
    const cam = new Camera(800, 600, 4096, 2816);
    cam.centerOn(2064, 1424);
    const screen = worldToScreen({ x: 2064, y: 1424 }, cam.view());
    expect(screen.x).toBeCloseTo(400, 0);
    expect(screen.y).toBeCloseTo(300, 0);
  });

  it('pan moves world content with the finger', () => {
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
