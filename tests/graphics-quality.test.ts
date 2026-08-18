import { describe, expect, it } from 'vitest';
import {
  canvasResolution,
  detectConstrainedDevice,
  graphicsProfile,
  parseGraphicsQualityPref,
  resolveGraphicsLevel,
  type DeviceHints,
} from '../src/render/graphics-quality';
import { collectFogRuns, fogGeometryKey, visibilityFingerprint, visibleTileBounds } from '../src/render/fog-draw';
import { TILE } from '../src/core/constants';
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
    expect(b.maxTx).toBe(6);
    expect(b.minTy).toBe(2);
    expect(b.maxTy).toBe(5);
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
