// App-side data loader. This is the ONLY file in the data layer that knows about the bundler.
//
// It collects the real JSON files with Vite's `import.meta.glob` and hands them to the pure
// builder in `registry-builder.ts`. Keeping the glob here means the builder stays importable from
// plain Node (tooling, CI, and the corruption-error demo) without a bundler present.

import { loadRegistryFromModules, DataLoadError, classifyPath } from './registry-builder';
import type { Registry } from './registry';
import type { DataManifest } from './mod-loader';

export { DataLoadError, classifyPath, loadRegistryFromModules };

const rawModules = import.meta.glob('/data/**/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>;

let cached: Registry | null = null;

/** Load the real content set once and memoize it. */
export function loadRegistry(manifest?: DataManifest): Registry {
  if (!cached) cached = loadRegistryFromModules(rawModules, manifest);
  return cached;
}

/** Test-only escape hatch so a suite can assert a fresh load. */
export function resetRegistryCache(): void {
  cached = null;
}
