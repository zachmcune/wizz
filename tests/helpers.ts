import { loadRegistry } from '../src/data/loader';
import type { Registry } from '../src/data/registry';

let cached: Registry | null = null;

export function getRegistry(): Registry {
  if (!cached) cached = loadRegistry();
  return cached;
}
