// Data pipeline: loading, validation, and the error paths that matter.
//
// The negative tests are the point. A schema that only accepts good files is untested; what
// matters is that a broken file produces an actionable message naming the file and the field,
// because that is what a content author sees at 2am.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistryFromModules, DataLoadError, classifyPath } from '../../src/data/loader';
import { EMPTY_MANIFEST } from '../../src/data/mod-loader';
import { getRegistry, readDataModules, validMapModule } from '../helpers';

describe('data loading: the real content set', () => {
  it('loads v2/data without errors', () => {
    const reg = getRegistry();
    expect(reg.units.size).toBe(14);
    expect(reg.buildings.size).toBe(21);
    expect(reg.spells.size).toBe(4);
    expect(reg.projectiles.size).toBe(6);
    expect(reg.factions.size).toBe(3);
    expect(reg.maps.size).toBe(5);
    expect(reg.matches.size).toBe(4);
  });

  it('classifies every path into a known bucket', () => {
    expect(classifyPath('/data/units/wisp.json')).toBe('units');
    expect(classifyPath('/data/buildings/sanctum.json')).toBe('buildings');
    expect(classifyPath('/data/spells/meteor_storm.json')).toBe('spells');
    expect(classifyPath('/data/projectiles/arcane_bolt.json')).toBe('projectiles');
    expect(classifyPath('/data/research/attuned_siphons.json')).toBe('research');
    expect(classifyPath('/data/maps/duel_glade.json')).toBe('maps');
    expect(classifyPath('/data/factions/arcane.json')).toBe('factions');
    expect(classifyPath('/data/match/skirmish_1v1.json')).toBe('matches');
    expect(classifyPath('/data/balance.json')).toBe('balance');
    expect(classifyPath('/data/manifest.json')).toBe('ignore');
    expect(classifyPath('/data/ai/arcane_rush.json')).toBe('ignore');
  });

  it('every loaded def has the art fields v2 rendering requires', () => {
    const reg = getRegistry();
    for (const u of reg.units.values()) {
      expect(u.art.sprite, `unit ${u.id} missing art.sprite`).toBeTruthy();
      expect(u.art.size, `unit ${u.id} missing art.size`).toBeGreaterThan(0);
      expect(u.art.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    for (const b of reg.buildings.values()) {
      expect(b.art.sprite, `building ${b.id} missing art.sprite`).toBeTruthy();
      expect(b.art.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('sprite keys are unique across all defs so the atlas has one frame per key', () => {
    const reg = getRegistry();
    const seen = new Map<string, string>();
    const check = (sprite: string, origin: string) => {
      const prev = seen.get(sprite);
      expect(prev, `sprite "${sprite}" used by both ${prev} and ${origin}`).toBeUndefined();
      seen.set(sprite, origin);
    };
    for (const u of reg.units.values()) check(u.art.sprite, `unit:${u.id}`);
    for (const b of reg.buildings.values()) check(b.art.sprite, `building:${b.id}`);
    for (const p of reg.projectiles.values()) check(p.art.sprite, `projectile:${p.id}`);
  });
});

describe('data loading: failure paths', () => {
  const base = readDataModules();

  function loadWith(mutate: (m: Record<string, unknown>) => void) {
    const copy = structuredClone(base);
    mutate(copy);
    return () => loadRegistryFromModules(copy, EMPTY_MANIFEST);
  }

  it('reports the file path AND the field path for a schema violation', () => {
    const run = loadWith((m) => {
      const wisp = m['/data/units/wisp.json'] as Record<string, unknown>;
      wisp.hp = -5;
    });
    expect(run).toThrow(DataLoadError);
    try {
      run();
    } catch (e) {
      const err = e as DataLoadError;
      expect(err.issues[0]).toContain('/data/units/wisp.json');
      expect(err.issues[0]).toContain('hp');
    }
  });

  it('catches a missing required field by name', () => {
    const run = loadWith((m) => {
      const sanctum = m['/data/buildings/sanctum.json'] as Record<string, unknown>;
      delete sanctum.footprint;
    });
    expect(run).toThrow(/footprint/);
  });

  it('rejects a map whose heights length does not match its tiles', () => {
    const run = loadWith((m) => {
      const map = m['/data/maps/duel_glade.json'] as Record<string, unknown>;
      (map.heights as number[]).pop();
    });
    expect(run).toThrow(/heights length must equal tiles length/);
  });

  it('rejects a map with no heights at all (v2 requires elevation)', () => {
    const run = loadWith((m) => {
      const map = m['/data/maps/duel_glade.json'] as Record<string, unknown>;
      delete map.heights;
    });
    expect(run).toThrow(/heights/);
  });

  it('rejects an unknown art accent colour', () => {
    const run = loadWith((m) => {
      const wisp = m['/data/units/wisp.json'] as Record<string, unknown>;
      (wisp.art as Record<string, unknown>).accent = 'blue';
    });
    expect(run).toThrow(/accent must be a #rrggbb hex colour/);
  });

  it('rejects duplicate ids with the offending file named', () => {
    const run = loadWith((m) => {
      m['/data/units/wisp_dupe.json'] = { ...(m['/data/units/wisp.json'] as object) };
    });
    expect(run).toThrow(/Duplicate unit id "wisp"/);
  });

  it('rejects a dangling reference between files', () => {
    const run = loadWith((m) => {
      const archer = m['/data/units/arcane_archer.json'] as Record<string, unknown>;
      archer.producedBy = 'nonexistent_building';
    });
    expect(run).toThrow(/producedBy "nonexistent_building" is not a known building/);
  });

  it('rejects a match that references an unknown map', () => {
    const run = loadWith((m) => {
      const match = m['/data/match/skirmish_1v1.json'] as Record<string, unknown>;
      match.mapId = 'atlantis';
    });
    expect(run).toThrow(/mapId "atlantis" is not a known map/);
  });

  it('rejects a faction with nothing it can build', () => {
    const run = loadWith((m) => {
      m['/data/factions/empty.json'] = {
        id: 'empty',
        name: 'Empty',
        description: 'no content',
      };
    });
    expect(run).toThrow(/faction "Empty" has no exclusive content/);
  });

  it('reports MULTIPLE broken files in one load instead of stopping at the first', () => {
    const run = loadWith((m) => {
      (m['/data/units/wisp.json'] as Record<string, unknown>).hp = -1;
      (m['/data/units/imp_swarmling.json'] as Record<string, unknown>).speed = -1;
    });
    try {
      run();
      throw new Error('expected a DataLoadError');
    } catch (e) {
      const err = e as DataLoadError;
      expect(err.issues.length).toBeGreaterThanOrEqual(2);
      const joined = err.issues.join('\n');
      expect(joined).toContain('wisp.json');
      expect(joined).toContain('imp_swarmling.json');
    }
  });
});

describe('data loading: overlays', () => {
  it('applies a manifest overlay and the overlay wins on conflict', () => {
    const mods = validMapModule();
    const base = {
      ...readDataModules(),
      ...mods,
    };
    const manifest = { version: 1, overlays: { 'maps/test_map.json': { name: 'Overlaid Name' } } };
    // Overlaying an existing real file is the realistic case.
    const reg = loadRegistryFromModules(base, manifest);
    expect(reg.map('test_map').name).toBe('Overlaid Name');
  });

  it('deep-merges nested objects rather than replacing them', () => {
    const manifest = {
      version: 1,
      overlays: { 'units/wisp.json': { weapon: null, isHarvester: false } },
    };
    const reg = loadRegistryFromModules(readDataModules(), manifest);
    const wisp = reg.unit('wisp');
    expect(wisp.isHarvester).toBe(false);
    // Untouched fields survive the merge.
    expect(wisp.carry).toBe(75);
  });
});

describe('data loading: manifest file on disk', () => {
  it('the shipped manifest parses and is empty by default', () => {
    const raw = JSON.parse(readFileSync(join(process.cwd(), 'data', 'manifest.json'), 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.overlays).toEqual({});
  });
});
