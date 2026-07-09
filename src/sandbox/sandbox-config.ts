import type { MatchConfig } from '../sim/types';
import type { ProjectionMode } from '../core/projection';
import { defaultSandboxSettings } from '../sim/sandbox-types';

/** Developer sandbox always runs in oblique 2.5D for parity with the voxel art pipeline. */
export const SANDBOX_PROJECTION_MODE: ProjectionMode = 'oblique';

export function getSandboxProjectionMode(): ProjectionMode {
  return SANDBOX_PROJECTION_MODE;
}

export function isSandboxFeatureEnabled(): boolean {
  return true;
}

export function shouldOpenSandbox(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('sandbox') === '1' || params.get('sandbox') === 'true';
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
