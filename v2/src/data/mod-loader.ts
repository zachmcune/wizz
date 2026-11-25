// Content mod overlays: deep-merge a manifest's overlays onto base JSON before validation.
//
// The manifest is passed EXPLICITLY rather than held in module scope. Module-level mutable state
// silently leaks between tests (and between matches in the same process), and it made the v1
// overlay path untestable without reloading the module. Callers that want the shipped manifest
// read it once and pass it in.

export interface DataManifest {
  version: number;
  overlays: Record<string, unknown>;
}

export const EMPTY_MANIFEST: DataManifest = { version: 1, overlays: {} };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursively merge overlay into base (overlay wins on scalar conflicts, arrays replaced). */
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

export function normalizeDataPath(path: string): string {
  if (path.startsWith('/data/')) return path;
  if (path.startsWith('data/')) return `/${path}`;
  return `/data/${path}`;
}

/**
 * Apply a manifest's overlays to eager glob modules.
 *
 * Overlay keys are matched leniently: `units/wisp.json`, `data/units/wisp.json`, and
 * `/data/units/wisp.json` all resolve to the same module, because a data author should not have
 * to know which spelling the bundler happened to produce.
 */
export function applyDataOverlays(
  modules: Record<string, unknown>,
  manifest: DataManifest = EMPTY_MANIFEST,
): Record<string, unknown> {
  if (!manifest.overlays || Object.keys(manifest.overlays).length === 0) return modules;

  // Build a suffix index so an overlay key can match a full module key by its tail.
  const bySuffix = new Map<string, string>();
  for (const key of Object.keys(modules)) {
    bySuffix.set(key, key);
    const marker = key.indexOf('/data/');
    if (marker >= 0) bySuffix.set(`/data/${key.slice(marker + 6)}`, key);
  }

  const result = { ...modules };
  for (const [rawPath, overlay] of Object.entries(manifest.overlays)) {
    const wanted = normalizeDataPath(rawPath);
    const tail = wanted.slice('/data/'.length);
    const target =
      bySuffix.get(wanted) ??
      bySuffix.get(`/data/${tail}`) ??
      Object.keys(modules).find((k) => k.endsWith(`/data/${tail}`)) ??
      undefined;

    if (target !== undefined) result[target] = deepMerge(result[target], overlay);
    else result[wanted] = overlay;
  }
  return result;
}
