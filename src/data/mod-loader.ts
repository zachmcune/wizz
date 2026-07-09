// Data mod overlay loader — deep-merges manifest overlays onto base JSON before validation.
import manifest from '../../data/manifest.json';

export interface DataManifest {
  version: number;
  overlays: Record<string, unknown>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursively merge overlay into base (overlay wins on scalar conflicts). */
export function deepMerge<T>(base: T, overlay: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overlay)) return (overlay as T) ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const prev = out[key];
    if (isPlainObject(prev) && isPlainObject(value)) out[key] = deepMerge(prev, value);
    else out[key] = value;
  }
  return out as T;
}

function normalizeDataPath(path: string): string {
  if (path.startsWith('/data/')) return path;
  if (path.startsWith('data/')) return `/${path}`;
  return `/data/${path}`;
}

/** Apply manifest overlays to eager glob modules (last manifest entry wins per path). */
export function applyDataOverlays(modules: Record<string, unknown>): Record<string, unknown> {
  const m = manifest as DataManifest;
  if (!m.overlays || Object.keys(m.overlays).length === 0) return modules;

  const result = { ...modules };
  for (const [rawPath, overlay] of Object.entries(m.overlays)) {
    const path = normalizeDataPath(rawPath);
    const base = result[path];
    if (base !== undefined) result[path] = deepMerge(base, overlay);
    else result[path] = overlay;
  }
  return result;
}
