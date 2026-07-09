import { describe, it, expect } from 'vitest';
import { deepMerge, applyDataOverlays } from '../src/data/mod-loader';

describe('mod loader', () => {
  it('deepMerge overlays nested objects', () => {
    const base = { a: 1, nested: { x: 1, y: 2 } };
    const overlay = { nested: { y: 9, z: 3 } };
    expect(deepMerge(base, overlay)).toEqual({ a: 1, nested: { x: 1, y: 9, z: 3 } });
  });

  it('applyDataOverlays returns modules unchanged when manifest has no overlays', () => {
    const modules = { '/data/balance.json': { startingMana: 900 } };
    expect(applyDataOverlays(modules)).toEqual(modules);
  });
});
