// Presentation-only graphics quality. Never imported by the sim.
// Default is High. Auto still maps phones and 2-core / 2 GB machines onto a cheaper
// profile; Chromebooks stay on High.

export type GraphicsQualityPref = 'auto' | 'low' | 'medium' | 'high';
export type GraphicsLevel = 'low' | 'medium' | 'high';

export interface DeviceHints {
  userAgent: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  saveData?: boolean;
  coarsePointer?: boolean;
  innerWidth?: number;
}

export interface GraphicsProfile {
  level: GraphicsLevel;
  /** Cap on `devicePixelRatio` used as the Pixi backing-store resolution. */
  resolutionCap: number;
  antialias: boolean;
  preferWebGL: boolean;
  textureResolution: number;
  shadows: boolean;
  occlusionMarkers: boolean;
  vfxDensity: number;
  maxEffects: number;
  /** Merge fog tiles into cheap spans instead of per-tile diamonds. */
  cheapFog: boolean;
  fogPadTiles: number;
}

export function readDeviceHints(): DeviceHints {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const win = typeof window !== 'undefined' ? window : undefined;
  const conn =
    nav && 'connection' in nav
      ? (nav as Navigator & { connection?: { saveData?: boolean } }).connection
      : undefined;
  let coarsePointer = false;
  try {
    coarsePointer = !!win?.matchMedia?.('(pointer: coarse)')?.matches;
  } catch {
    coarsePointer = false;
  }
  return {
    userAgent: nav?.userAgent ?? '',
    hardwareConcurrency: nav?.hardwareConcurrency,
    deviceMemory: nav && 'deviceMemory' in nav ? (nav as Navigator & { deviceMemory?: number }).deviceMemory : undefined,
    saveData: conn?.saveData,
    coarsePointer,
    innerWidth: win?.innerWidth,
  };
}

/** Chromebooks, low-core / low-RAM machines, and typical phones. */
export function detectConstrainedDevice(hints: DeviceHints): boolean {
  if (/CrOS/i.test(hints.userAgent)) return true;
  if ((hints.hardwareConcurrency ?? 8) <= 4) return true;
  if (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) return true;
  if (hints.saveData) return true;
  if (hints.coarsePointer && (hints.innerWidth ?? 800) < 900) return true;
  return false;
}

export function resolveGraphicsLevel(pref: GraphicsQualityPref, hints: DeviceHints): GraphicsLevel {
  if (pref !== 'auto') return pref;
  if (!detectConstrainedDevice(hints)) return 'high';
  // Chromebooks handle High; only phones / very small machines step down.
  if (/CrOS/i.test(hints.userAgent)) return 'high';
  if ((hints.hardwareConcurrency ?? 8) <= 2) return 'low';
  if (hints.deviceMemory !== undefined && hints.deviceMemory <= 2) return 'low';
  return 'medium';
}

export function graphicsProfile(level: GraphicsLevel): GraphicsProfile {
  if (level === 'low') {
    return {
      level,
      resolutionCap: 1,
      antialias: false,
      preferWebGL: true,
      textureResolution: 1,
      shadows: false,
      occlusionMarkers: false,
      vfxDensity: 0.25,
      maxEffects: 48,
      cheapFog: true,
      fogPadTiles: 6,
    };
  }
  if (level === 'medium') {
    return {
      level,
      resolutionCap: 1.25,
      antialias: false,
      preferWebGL: true,
      textureResolution: 1,
      shadows: false,
      occlusionMarkers: true,
      vfxDensity: 0.55,
      maxEffects: 160,
      cheapFog: false,
      fogPadTiles: 8,
    };
  }
  return {
    level,
    resolutionCap: 2,
    antialias: true,
    preferWebGL: false,
    textureResolution: 2,
    shadows: true,
    occlusionMarkers: true,
    vfxDensity: 1,
    maxEffects: 400,
    cheapFog: false,
    fogPadTiles: 10,
  };
}

export function canvasResolution(profile: GraphicsProfile, devicePixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, profile.resolutionCap);
}

const QUALITY_PREFS: readonly GraphicsQualityPref[] = ['auto', 'low', 'medium', 'high'];

export function parseGraphicsQualityPref(value: unknown): GraphicsQualityPref {
  if (typeof value === 'string' && (QUALITY_PREFS as readonly string[]).includes(value)) {
    return value as GraphicsQualityPref;
  }
  return 'high';
}
