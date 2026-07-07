// Persisted user settings (IndexedDB). Small and forgiving; defaults on any read failure.
import { get, set } from 'idb-keyval';

export type ProjectionModeSetting = 'ortho' | 'oblique';

export interface Settings {
  volume: number;
  muted: boolean;
  dragMode: 'pan' | 'select';
  /** @deprecated View mode is chosen in the match lobby; kept for URL dev override only. */
  projectionMode: ProjectionModeSetting;
}

const KEY = 'arcane:settings';
const DEFAULTS: Settings = { volume: 0.6, muted: false, dragMode: 'select', projectionMode: 'ortho' };

export async function loadSettings(): Promise<Settings> {
  try {
    const s = (await get(KEY)) as Partial<Settings> | undefined;
    return { ...DEFAULTS, ...(s ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await set(KEY, s);
  } catch {
    // ignore storage failures (private mode etc.)
  }
}
