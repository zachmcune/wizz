// Test helpers: load the real v2 content set once, and build synthetic module maps for
// failure-path tests.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadRegistryFromModules } from '../src/data/registry-builder';
import { EMPTY_MANIFEST, type DataManifest } from '../src/data/mod-loader';
import type { Registry } from '../src/data/registry';
import type { MapData } from '../src/data/defs';

const v2Root = process.cwd();
const dataRoot = join(v2Root, 'data');

/**
 * Read every JSON file under v2/data into the same `path → JSON` shape Vite's
 * `import.meta.glob('/data/**\/*.json')` produces (keys start with `/data/`).
 */
export function readDataModules(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      const rel = relative(dataRoot, full).split('\\').join('/');
      out[`/data/${rel}`] = JSON.parse(readFileSync(full, 'utf8'));
    }
  };
  walk(dataRoot);
  return out;
}

export function shippedManifest(): DataManifest {
  try {
    return JSON.parse(readFileSync(join(dataRoot, 'manifest.json'), 'utf8')) as DataManifest;
  } catch {
    return EMPTY_MANIFEST;
  }
}

let cached: Registry | null = null;

/** The real content registry, validated exactly as the app validates it. */
export function getRegistry(): Registry {
  if (!cached) cached = loadRegistryFromModules(readDataModules(), shippedManifest());
  return cached;
}

export function resetRegistry(): void {
  cached = null;
}

export function mapOf(id: string): MapData {
  return getRegistry().map(id);
}

/** A minimal valid map module, used as a base for negative tests. */
export function validMapModule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '/data/maps/test_map.json': {
      id: 'test_map',
      name: 'Test Map',
      maxPlayers: 2,
      tileW: 8,
      tileH: 8,
      tiles: buildTiles(8, 8),
      heights: new Array(64).fill(0),
      startLocations: [
        { x: 64, y: 64 },
        { x: 192, y: 192 },
      ],
      manaNodes: [
        { x: 96, y: 96, amount: 3000 },
        { x: 160, y: 160, amount: 3000 },
      ],
      ...overrides,
    },
  };
}

function buildTiles(w: number, h: number): number[] {
  const t = new Array(w * h).fill(0);
  for (let x = 0; x < w; x++) {
    t[x] = 1;
    t[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    t[y * w] = 1;
    t[y * w + (w - 1)] = 1;
  }
  return t;
}
