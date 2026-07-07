// Persisted user settings (IndexedDB). Small and forgiving; defaults on any read failure.
import { get, set } from 'idb-keyval';

export type ProjectionModeSetting = 'ortho' | 'oblique';

export interface Settings {
  volume: number;
  muted: boolean;
  dragMode: 'pan' | 'select';
  /** Classic top-down (ortho) vs RA2-style oblique view. */
  projectionMode: ProjectionModeSetting;
}

const KEY = 'arcane:settings';
const DEFAULTS: Settings = { volume: 0.6, muted: false, dragMode: 'select', projectionMode: 'oblique' };

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
