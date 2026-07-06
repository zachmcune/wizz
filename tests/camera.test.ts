import { describe, it, expect } from 'vitest';
import { Camera } from '../src/render/camera';
import { worldToScreen, screenToWorld, tileToWorld, worldToTileX } from '../src/core/coords';
import { MIN_ZOOM, MAX_ZOOM, TILE } from '../src/core/constants';

describe('camera & coordinate math', () => {
  it('clamps position to map bounds', () => {
    const cam = new Camera(800, 600, 2000, 1500);
    cam.centerOn(-1000, -1000);
    expect(cam.x).toBeGreaterThanOrEqual(0);
    expect(cam.y).toBeGreaterThanOrEqual(0);
    cam.centerOn(99999, 99999);
    expect(cam.x).toBeLessThanOrEqual(2000 - 800 / cam.zoom);
    expect(cam.y).toBeLessThanOrEqual(1500 - 600 / cam.zoom);
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
});
