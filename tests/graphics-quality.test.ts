import { afterEach, describe, expect, it } from 'vitest';
import {
  canvasResolution,
  detectConstrainedDevice,
  graphicsProfile,
  parseGraphicsQualityPref,
  resolveGraphicsLevel,
  type DeviceHints,
} from '../src/render/graphics-quality';
import {
  collectFogRuns,
  FOG_FILL_COLOR,
  fogGeometryKey,
  fogRunProjectedCorners,
  visibilityFingerprint,
  visibleTileBounds,
  visibleWorldAabb,
} from '../src/render/fog-draw';
import { TILE } from '../src/core/constants';
import { screenToWorld } from '../src/core/coords';
import { setProjectionMode } from '../src/core/projection';
import { Camera } from '../src/render/camera';
import { setVfxDensity, vfxCount, vfxDecorEnabled, vfxDensity } from '../src/render/vfx-quality';

const desktop: DeviceHints = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
  hardwareConcurrency: 8,
  deviceMemory: 8,
  coarsePointer: false,
  innerWidth: 1600,
};

const chromebook: DeviceHints = {
  userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/120.0.0.0',
  hardwareConcurrency: 4,
  deviceMemory: 4,
  coarsePointer: true,
  innerWidth: 1366,
};

const phone: DeviceHints = {
  userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile',
  hardwareConcurrency: 6,
  deviceMemory: 4,
  coarsePointer: true,
  innerWidth: 720,
};

describe('graphics quality', () => {
  it('treats ChromeOS as constrained', () => {
    expect(detectConstrainedDevice(chromebook)).toBe(true);
    expect(detectConstrainedDevice(desktop)).toBe(false);
  });

  it('Auto picks Low on Chromebooks and High on capable desktops', () => {
    expect(resolveGraphicsLevel('auto', chromebook)).toBe('low');
    expect(resolveGraphicsLevel('auto', desktop)).toBe('high');
    expect(resolveGraphicsLevel('auto', phone)).toBe('medium');
    expect(resolveGraphicsLevel('high', chromebook)).toBe('high');
  });

  it('Low profile disables antialias, shadows, and expensive VFX', () => {
    const low = graphicsProfile('low');
    expect(low.antialias).toBe(false);
    expect(low.shadows).toBe(false);
    expect(low.cheapFog).toBe(true);
    expect(low.preferWebGL).toBe(true);
    expect(low.resolutionCap).toBeLessThanOrEqual(1);
    expect(low.vfxDensity).toBeLessThan(0.5);
    expect(graphicsProfile('high').antialias).toBe(true);
  });

  it('caps backing-store resolution to the profile', () => {
    expect(canvasResolution(graphicsProfile('low'), 2)).toBe(1);
    expect(canvasResolution(graphicsProfile('high'), 3)).toBe(2);
    expect(canvasResolution(graphicsProfile('medium'), 1)).toBe(1);
  });

  it('parses stored quality prefs and falls back to Auto', () => {
    expect(parseGraphicsQualityPref('low')).toBe('low');
    expect(parseGraphicsQualityPref('nope')).toBe('auto');
    expect(parseGraphicsQualityPref(undefined)).toBe('auto');
  });
});

describe('fog runs', () => {
  afterEach(() => {
    setProjectionMode('ortho');
  });

  it('merges consecutive fogged tiles on a row', () => {
    const fog = [1, 1, 1, 0, 1, 1];
    const runs = collectFogRuns((i) => fog[i] === 1, 6, 1, { minTx: 0, maxTx: 5, minTy: 0, maxTy: 0 });
    expect(runs).toEqual([
      { tx: 0, ty: 0, tw: 3 },
      { tx: 4, ty: 0, tw: 2 },
    ]);
  });

  it('clamps to the requested viewport and map size', () => {
    const allFog = new Array(16).fill(1);
    const runs = collectFogRuns((i) => allFog[i] === 1, 4, 4, { minTx: 1, maxTx: 2, minTy: 1, maxTy: 2 });
    expect(runs).toEqual([
      { tx: 1, ty: 1, tw: 2 },
      { tx: 1, ty: 2, tw: 2 },
    ]);
  });

  it('pads world bounds into inclusive tile ranges', () => {
    const b = visibleTileBounds(TILE * 2, TILE * 3, TILE * 4, TILE * 2, 1, 20, 20);
    expect(b.minTx).toBe(1);
    expect(b.maxTx).toBe(7);
    expect(b.minTy).toBe(2);
    expect(b.maxTy).toBe(6);
  });

  it('changes the cache key when vision or the view changes', () => {
    const vis = [0, 1, 0, 1];
    const bounds = { minTx: 0, maxTx: 3, minTy: 0, maxTy: 0 };
    const a = fogGeometryKey(visibilityFingerprint(vis), bounds, true, 'ortho');
    vis[0] = 1;
    const b = fogGeometryKey(visibilityFingerprint(vis), bounds, true, 'ortho');
    expect(a).not.toBe(b);
    const c = fogGeometryKey(visibilityFingerprint(vis), { ...bounds, minTx: 1 }, true, 'ortho');
    expect(b).not.toBe(c);
  });

  it('uses a dark veil instead of a light silver wash', () => {
    expect(FOG_FILL_COLOR).toBeLessThan(0x202028);
  });

  it('matches the camera rectangle in ortho and covers screen corners in oblique', () => {
    setProjectionMode('ortho');
    const orthoCam = new Camera(1280, 720, 4096, 2816);
    orthoCam.centerOn(800, 600);
    const orthoView = orthoCam.visibleWorldRect();
    const orthoAabb = visibleWorldAabb(orthoCam.view(), 1280, 720);
    expect(orthoAabb.x).toBeCloseTo(orthoView.x, 5);
    expect(orthoAabb.y).toBeCloseTo(orthoView.y, 5);
    expect(orthoAabb.w).toBeCloseTo(orthoView.w, 5);
    expect(orthoAabb.h).toBeCloseTo(orthoView.h, 5);

    setProjectionMode('oblique');
    const cam = new Camera(1280, 720, 4096, 2816);
    cam.centerOn(800, 600);
    const naive = cam.visibleWorldRect();
    const naiveBounds = visibleTileBounds(naive.x, naive.y, naive.w, naive.h, 0, 128, 88);
    const aabb = visibleWorldAabb(cam.view(), 1280, 720);
    const bounds = visibleTileBounds(aabb.x, aabb.y, aabb.w, aabb.h, 0, 128, 88);
    const corner = screenToWorld({ x: 1279, y: 719 }, cam.view());
    const ctx = Math.floor(corner.x / TILE);
    const cty = Math.floor(corner.y / TILE);
    expect(bounds.minTx).toBeLessThanOrEqual(ctx);
    expect(bounds.maxTx).toBeGreaterThanOrEqual(ctx);
    expect(bounds.minTy).toBeLessThanOrEqual(cty);
    expect(bounds.maxTy).toBeGreaterThanOrEqual(cty);
    const naiveCoversCorner =
      ctx >= naiveBounds.minTx && ctx <= naiveBounds.maxTx && cty >= naiveBounds.minTy && cty <= naiveBounds.maxTy;
    expect(naiveCoversCorner).toBe(false);
    setProjectionMode('ortho');
  });

  it('joins adjacent oblique fog runs on a shared edge', () => {
    setProjectionMode('oblique');
    const left = fogRunProjectedCorners(2, 5, 3);
    const right = fogRunProjectedCorners(5, 5, 2);
    expect(left[2]).toBeCloseTo(right[0]!, 5);
    expect(left[3]).toBeCloseTo(right[1]!, 5);
    expect(left[4]).toBeCloseTo(right[6]!, 5);
    expect(left[5]).toBeCloseTo(right[7]!, 5);
    setProjectionMode('ortho');
  });
});

describe('vfx density', () => {
  it('scales decorative counts and disables extras on Low', () => {
    setVfxDensity(1);
    expect(vfxCount(8)).toBe(8);
    expect(vfxDecorEnabled()).toBe(true);
    setVfxDensity(0.25);
    expect(vfxDensity()).toBe(0.25);
    expect(vfxCount(8)).toBe(2);
    expect(vfxDecorEnabled()).toBe(false);
    setVfxDensity(1);
  });
});
