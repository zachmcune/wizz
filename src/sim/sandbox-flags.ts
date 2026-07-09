import type { GameState } from './types';
import type { SandboxSettings } from './sandbox-types';

export function sandboxSettings(state: GameState): SandboxSettings | null {
  return state.sandbox?.enabled ? state.sandbox.settings : null;
}

export function isSandbox(state: GameState): boolean {
  return state.sandbox?.enabled === true;
}

export function sandboxNoCosts(state: GameState): boolean {
  const s = sandboxSettings(state);
  return !!s?.economy.noCosts || !!s?.economy.infiniteMana;
}

export function sandboxInfiniteMana(state: GameState): boolean {
  return sandboxSettings(state)?.economy.infiniteMana === true;
}

export function sandboxInstantBuild(state: GameState): boolean {
  return sandboxSettings(state)?.economy.instantBuild === true;
}

export function sandboxInstantProduce(state: GameState): boolean {
  return sandboxSettings(state)?.economy.instantProduce === true;
}

export function sandboxInstantResearch(state: GameState): boolean {
  return sandboxSettings(state)?.economy.instantResearch === true;
}

export function sandboxIgnoreTech(state: GameState): boolean {
  return sandboxSettings(state)?.economy.ignoreTechRequirements === true;
}

export function sandboxIgnorePlacement(state: GameState): boolean {
  return sandboxSettings(state)?.build.ignorePlacementRestrictions === true;
}

export function sandboxDisableWinCheck(state: GameState): boolean {
  return sandboxSettings(state)?.gameplay.disableWinCheck === true;
}

export function sandboxFreezeUnits(state: GameState): boolean {
  return sandboxSettings(state)?.gameplay.freezeUnits === true;
}

export function sandboxFreezeProjectiles(state: GameState): boolean {
  return sandboxSettings(state)?.gameplay.freezeProjectiles === true;
}

export function sandboxNoSpellCooldowns(state: GameState): boolean {
  return sandboxSettings(state)?.spells.noCooldowns === true;
}

export function sandboxNoSpellCost(state: GameState): boolean {
  return sandboxSettings(state)?.spells.noManaCost === true;
}

export function sandboxFogEnabled(state: GameState): boolean {
  const s = sandboxSettings(state);
  if (!s) return true;
  if (s.map.revealMap) return false;
  return s.map.fogEnabled;
}
