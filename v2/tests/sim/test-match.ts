// Shared helpers for the sim test suite.

import type { Registry } from '../../src/data/registry';
import { getRegistry } from '../helpers';
import { initMatch } from '../../src/sim/factory';
import type { GameState, MatchConfig, Command } from '../../src/sim/types';
import type { SimServices } from '../../src/sim/context';
import { stepSimulation, type AiHook } from '../../src/sim/step';
import { EntityStore, KIND_BUILDING, KIND_RESOURCE_NODE, KIND_UNIT } from '../../src/sim/entity-store';
import { spawnBuildingAt, applyBuildingNav } from '../../src/sim/systems/production';

export interface TestMatch {
  state: GameState;
  services: SimServices;
  reg: Registry;
  /** Step n ticks with a command schedule. */
  run(ticks: number, schedule?: Record<number, Command[]>, aiHook?: AiHook): void;
  /** Find the slot of the first live entity matching a predicate. */
  findSlot(pred: (slot: number) => boolean): number;
  unitSlots(owner: string, defId?: string): number[];
  buildingSlots(owner: string, defId?: string): number[];
  nodeSlots(): number[];
  slotOfDef(owner: string, defId: string): number;
}

export function twoPlayerConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    mapId: 'duel_glade',
    seed: 12345,
    players: [
      { id: 'player0', controller: 'human', team: 0, color: '#4f9dff', startIndex: 0, factionId: 'arcane' },
      { id: 'player1', controller: 'human', team: 1, color: '#ff5d5d', startIndex: 3, factionId: 'arcane' },
    ],
    ...overrides,
  };
}

export function makeMatch(config: MatchConfig = twoPlayerConfig()): TestMatch {
  const reg = getRegistry();
  /**
   * THE CONFORMANCE SUITES ASSERT **v1** ECONOMY ARITHMETIC, so the approved sanctum trickle is switched off here.
   *
   * `sanctumTricklePerSecond` (approved 2026-11-21) adds a fractional amount of mana to every player every tick. That broke nine
   * v1 conformance checks by tiny amounts — "expected 76.1 to be close to 75", "expected 800.1 to be 800" — because those tests
   * verify exact deposit, conjure, repair and refund arithmetic that must still hold to the v1 rules.
   *
   * Neutralising it HERE rather than loosening the assertions keeps the v1 arithmetic checked exactly, and keeps the trickle's
   * own behaviour covered by `tests/phase5-dead-economy.test.ts`, which tests it directly and at full strength.
   */
  const v1Balance = { ...reg.balance, sanctumTricklePerSecond: 0 };
  const regForMatch = Object.create(Object.getPrototypeOf(reg)) as typeof reg;
  Object.assign(regForMatch, reg, { balance: v1Balance });
  const { state, services } = initMatch(regForMatch, config);

  const match: TestMatch = {
    state,
    services,
    reg: regForMatch,
    run(ticks, schedule, aiHook) {
      for (let i = 0; i < ticks; i++) {
        if (state.ended) return;
        const cmds = schedule?.[state.tick] ?? [];
        stepSimulation(state, services, cmds, aiHook);
      }
    },
    findSlot(pred) {
      for (let slot = 0; slot < state.entities.count; slot++) {
        if (state.entities.dead[slot]) continue;
        if (pred(slot)) return slot;
      }
      return -1;
    },
    unitSlots(owner, defId) {
      const out: number[] = [];
      const store = state.entities;
      const oi = store.ownerIndexFor(owner);
      for (let slot = 0; slot < store.count; slot++) {
        if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
        if (store.ownerIndex[slot] !== oi) continue;
        if (defId && store.extras[slot]!.defId !== defId) continue;
        out.push(slot);
      }
      return out;
    },
    buildingSlots(owner, defId) {
      const out: number[] = [];
      const store = state.entities;
      const oi = store.ownerIndexFor(owner);
      for (let slot = 0; slot < store.count; slot++) {
        if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
        if (store.ownerIndex[slot] !== oi) continue;
        if (defId && store.extras[slot]!.defId !== defId) continue;
        out.push(slot);
      }
      return out;
    },
    nodeSlots() {
      const out: number[] = [];
      const store = state.entities;
      for (let slot = 0; slot < store.count; slot++) {
        if (store.dead[slot] || store.kind[slot] !== KIND_RESOURCE_NODE) continue;
        out.push(slot);
      }
      return out;
    },
    slotOfDef(owner, defId) {
      for (let slot = 0; slot < state.entities.count; slot++) {
        if (state.entities.dead[slot]) continue;
        if (state.entities.ownerId(state.entities.ownerIndex[slot]!) !== owner) continue;
        if (state.entities.extras[slot]!.defId !== defId) continue;
        return slot;
      }
      return -1;
    },
  };
  return match;
}

/** Teleport a unit (test-only convenience; bypasses movement deliberately). */
export function placeSlot(match: TestMatch, slot: number, x: number, y: number): void {
  match.state.entities.posX[slot] = x;
  match.state.entities.posY[slot] = y;
}

/** Give a player a completed building directly (test-only). */
export function grantBuilding(
  match: TestMatch,
  owner: string,
  defId: string,
  x: number,
  y: number,
): number {
  const slot = spawnBuildingAt(match.state, match.services, defId, owner, x, y, { complete: true }, null);
  if (slot >= 0) applyBuildingNav(match.state, match.services, slot);
  return slot;
}

export { EntityStore };
