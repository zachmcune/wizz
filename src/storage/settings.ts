// Persisted user settings (IndexedDB). Small and forgiving; defaults on any read failure.
import { get, set } from 'idb-keyval';
import { parseGraphicsQualityPref, type GraphicsQualityPref } from '../render/graphics-quality';

export type { GraphicsQualityPref };

export interface Settings {
  volume: number;
  muted: boolean;
  dragMode: 'pan' | 'select';
  /** Show full building names on the map (off by default). */
  showBuildingNames: boolean;
  /** Defaults to High. Auto still steps down on phones and 2-core / 2 GB machines. */
  graphicsQuality: GraphicsQualityPref;
  /**
   * First-match teaching coach. Defaults on for new players.
   * Skip / finish turns this off; Settings can turn it back on to replay.
   */
  showTips: boolean;
}

const KEY = 'arcane:settings';
const DEFAULTS: Settings = {
  volume: 0.6,
  muted: false,
  dragMode: 'select',
  showBuildingNames: false,
  graphicsQuality: 'high',
  showTips: true,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const s = (await get(KEY)) as Partial<Settings> | undefined;
    const merged = { ...DEFAULTS, ...(s ?? {}) };
    merged.graphicsQuality = parseGraphicsQualityPref(merged.graphicsQuality);
    return merged;
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
