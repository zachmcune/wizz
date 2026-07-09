import type { MatchConfig } from '../sim/types';
import { defaultSandboxSettings } from '../sim/sandbox-types';

const SANDBOX_UNLOCK_KEY = 'arcane_sandbox_unlock';

declare const __SANDBOX_ENABLED__: boolean | undefined;

export function isSandboxFeatureEnabled(): boolean {
  if (typeof __SANDBOX_ENABLED__ !== 'undefined' && __SANDBOX_ENABLED__) return true;
  try {
    return localStorage.getItem(SANDBOX_UNLOCK_KEY) === '1';
  } catch {
    return import.meta.env.DEV;
  }
}

export function unlockSandboxFeature(): void {
  try {
    localStorage.setItem(SANDBOX_UNLOCK_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function shouldOpenSandbox(): boolean {
  if (!isSandboxFeatureEnabled()) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('sandbox') === '1' || params.get('sandbox') === 'true') {
    unlockSandboxFeature();
    return true;
  }
  return false;
}

export function scenarioIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('scenario');
}

export function buildSandboxMatchConfig(opts?: {
  mapId?: string;
  seed?: number;
  players?: MatchConfig['players'];
}): MatchConfig {
  return {
    id: 'sandbox',
    mode: 'sandbox',
    mapId: opts?.mapId ?? 'duel_glade',
    seed: opts?.seed ?? 42,
    players: opts?.players ?? [
      { id: 'player0', controller: 'human', team: 0, color: '#4f9dff', startIndex: 0 },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 1, aiDifficulty: 'normal' },
    ],
    oneSuperweaponPerPlayer: false,
    economyPacing: 'standard',
    deadSpectatorReveal: false,
    sandboxDefaults: defaultSandboxSettings(),
  };
}
