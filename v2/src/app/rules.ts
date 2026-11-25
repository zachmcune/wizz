// RULES READOUTS — pure predicates the UI needs about what the simulation will accept.
//
// The sim is the authority: every command is validated again in `src/sim/systems/commands.ts`, and a
// refusal comes back as a `commandRejected` event. These helpers exist so the UI can grey out an
// unaffordable tile and show WHY, instead of letting a player tap it and reading an error. They must
// therefore mirror the sim's rules exactly; `tests/app/rules.test.ts` checks them against the sim by
// issuing real commands and comparing outcomes.
//
// Nothing here mutates state and nothing here is imported by `src/sim`.

import type { GameState, PlayerId } from '../sim/types';
import type { Registry } from '../data/registry';
import { KIND_BUILDING, KIND_UNIT } from '../sim/entity-store';

/** The player record for an id, or undefined. */
export function playerOf(state: GameState, id: PlayerId) {
  return state.players.find((p) => p.id === id);
}

/**
 * Tech gate: every entry in `requires` must be a completed structure or research for this player.
 *
 * The sim treats a `requires` entry as satisfied when either the building is completed (it is in
 * `unlockedTech`) or the research is completed. Structural buildings are added to `unlockedTech` by
 * the production system when they finish, which is what makes the same list serve both.
 */
export function requirementsMetPublic(state: GameState, playerId: PlayerId, requires: readonly string[]): boolean {
  if (requires.length === 0) return true;
  const p = playerOf(state, playerId);
  if (!p) return false;
  const have = new Set([...p.unlockedTech, ...p.completedResearch]);
  for (const r of requires) if (!have.has(r)) return false;
  return true;
}

/** Why a building cannot be built right now, in player-facing words; empty when it can. */
export function buildingBlocker(
  state: GameState,
  registry: Registry,
  playerId: PlayerId,
  defId: string,
): string {
  const def = registry.buildings.get(defId);
  if (!def) return 'Unknown structure.';
  const p = playerOf(state, playerId);
  if (!p) return 'No player.';
  if (!requirementsMetPublic(state, playerId, def.requires)) return 'Requires a structure you do not have.';
  if (def.factions && p.factionId && !def.factions.includes(p.factionId)) return 'Not available to your faction.';
  if (p.mana < def.cost) return 'Not enough mana.';
  return '';
}

/** Why a unit cannot be trained right now, in player-facing words; empty when it can. */
export function unitBlocker(state: GameState, registry: Registry, playerId: PlayerId, defId: string): string {
  const def = registry.units.get(defId);
  if (!def) return 'Unknown unit.';
  const p = playerOf(state, playerId);
  if (!p) return 'No player.';
  if (!requirementsMetPublic(state, playerId, def.requires)) return 'Requires a structure you do not have.';
  if (def.factions && p.factionId && !def.factions.includes(p.factionId)) return 'Not available to your faction.';
  if (p.mana < def.cost) return 'Not enough mana.';
  return '';
}

/** Why a research cannot be started right now, in player-facing words; empty when it can. */
export function researchBlocker(state: GameState, registry: Registry, playerId: PlayerId, defId: string): string {
  const def = registry.research.get(defId);
  if (!def) return 'Unknown research.';
  const p = playerOf(state, playerId);
  if (!p) return 'No player.';
  if (p.completedResearch.includes(defId)) return 'Already researched.';
  if (!requirementsMetPublic(state, playerId, def.requires)) return 'Requires earlier research.';
  if (def.factions && p.factionId && !def.factions.includes(p.factionId)) return 'Not available to your faction.';
  if (p.mana < def.cost) return 'Not enough mana.';
  return '';
}

/** Owned buildings, as slots. */
export function ownedBuildingSlots(state: GameState, playerId: PlayerId): number[] {
  const store = state.entities;
  const idx = store.ownerIndexFor(playerId);
  const out: number[] = [];
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.ownerIndex[slot] !== idx) continue;
    out.push(slot);
  }
  return out;
}

/** Owned units, as slots. */
export function ownedUnitSlots(state: GameState, playerId: PlayerId): number[] {
  const store = state.entities;
  const idx = store.ownerIndexFor(playerId);
  const out: number[] = [];
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    if (store.ownerIndex[slot] !== idx) continue;
    out.push(slot);
  }
  return out;
}

export interface PowerReadout {
  produced: number;
  used: number;
  /** 0..1 — how much of the produced power is consumed. Clamped so the bar never overflows. */
  load: number;
  /** True when demand exceeds supply, which is what browns out radar and defences. */
  short: boolean;
}

/** Power meter for the HUD, from the values the power system already maintains. */
export function powerReadout(state: GameState, playerId: PlayerId): PowerReadout {
  const p = playerOf(state, playerId);
  const produced = p?.power ?? 0;
  const used = p?.powerUsed ?? 0;
  const load = produced <= 0 ? (used > 0 ? 1 : 0) : Math.min(1, used / produced);
  return { produced, used, load, short: used > produced };
}

export interface ProductionReadout {
  /** Items waiting, oldest first. */
  queue: { defId: string; name: string; progress: number; required: number }[];
  /** The item currently being built, if any. */
  active: { defId: string; name: string; progress: number; required: number } | null;
  /** 0..1 progress of the active item. */
  fraction: number;
}

/**
 * What a producer is doing, for the production tile's progress bar and queue badge.
 *
 * Reads the same `caps.production` payload the production system writes, so the numbers on screen are
 * the simulation's own rather than a UI estimate.
 */
export function productionReadout(state: GameState, registry: Registry, buildingId: number): ProductionReadout {
  const slot = state.entities.slotOf(buildingId);
  if (slot < 0) return { queue: [], active: null, fraction: 0 };
  const cap = state.entities.extras[slot]!.caps.production as
    | { productionQueue?: { defId: string; progress: number; required: number }[] }
    | undefined;
  const raw = cap?.productionQueue ?? [];
  const items = raw.map((it) => ({
    defId: it.defId,
    name: registry.units.get(it.defId)?.name ?? it.defId,
    progress: it.progress,
    required: it.required,
  }));
  const active = items[0] ?? null;
  return {
    queue: items.slice(1),
    active,
    fraction: active && active.required > 0 ? Math.max(0, Math.min(1, active.progress / active.required)) : 0,
  };
}

/** Research queue on a building, same shape as production. */
export function researchReadout(state: GameState, registry: Registry, buildingId: number): ProductionReadout {
  const slot = state.entities.slotOf(buildingId);
  if (slot < 0) return { queue: [], active: null, fraction: 0 };
  const cap = state.entities.extras[slot]!.caps.production as
    | { researchQueue?: { defId: string; progress: number; required: number }[] }
    | undefined;
  const raw = cap?.researchQueue ?? [];
  const items = raw.map((it) => ({
    defId: it.defId,
    name: registry.research.get(it.defId)?.name ?? it.defId,
    progress: it.progress,
    required: it.required,
  }));
  const active = items[0] ?? null;
  return {
    queue: items.slice(1),
    active,
    fraction: active && active.required > 0 ? Math.max(0, Math.min(1, active.progress / active.required)) : 0,
  };
}
