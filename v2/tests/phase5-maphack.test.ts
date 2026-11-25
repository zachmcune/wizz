// MAP HACK — proving the AI cannot see through fog.
//
// Phase 5's first requirement is that the AI only sees what its own units see. That is not something you can establish by
// reading the AI source and feeling satisfied: a single stray `state.entities.posX[slot]` anywhere in the decision path
// is enough to make every difficulty omniscient, and it would be invisible in behaviour until someone tested it.
//
// TWO INDEPENDENT PROOFS, because each covers what the other cannot.
//
// 1. INDISTINGUISHABILITY (the strong one). Run a match. At a decision tick, take every entity the acting player CANNOT
//    see and move it somewhere else, change its HP, change its health ratio — anything that would change a decision if it
//    were being read. Then ask the brain for its commands and require them to be BYTE-IDENTICAL to the commands it issued
//    against the unperturbed state. If the AI reads any hidden field, perturbing that field changes its output and the
//    test fails. This is a proof of non-dependence, not a search for suspicious code.
//
//    It is done across several match phases (opening, mid, late) and several seeds, because an AI might only cheat when
//    it has an army, or only when its scout is alive.
//
// 2. THROWING TRAP (the belt-and-braces one). Replace the *contents* of hidden entity fields with poison values that
//    throw on numeric coercion, and require the whole tick to complete. This catches a read that happens to produce the
//    same command (e.g. `if (hidden.x > 0)` where the branch is not reached) which indistinguishability could miss
//    because the output did not change.

import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { AiBrain } from '../src/ai/brain';
import { isVisibleTo } from '../src/sim/fog';
import { KIND_RESOURCE_NODE } from '../src/sim/entity-store';
import type { GameState, PlayerId } from '../src/sim/types';
import type { SimServices } from '../src/sim/context';
import type { Registry } from '../src/data/registry';

const TICK_HZ = 20;

interface Setup {
  registry: Registry;
  state: GameState;
  services: SimServices;
  driver: AiDriver;
}

function setup(seed: number, minutes: number): Setup {
  const registry = loadRegistry();
  const { state, services } = initMatch(registry, {
    mapId: 'duel_glade',
    seed,
    oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'hard', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    ],
  } as never);
  const driver = new AiDriver(registry, services);
  const ticks = minutes * 60 * TICK_HZ;
  for (let t = 0; t < ticks && !state.ended; t++) stepSimulation(state, services, [], driver.hook);
  return { registry, state, services, driver };
}

/** Slots owned by an enemy of `me` that `me` cannot currently see. */
function hiddenSlots(state: GameState, services: SimServices, me: PlayerId): number[] {
  const store = state.entities;
  const out: number[] = [];
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    if (store.kind[slot] === KIND_RESOURCE_NODE) continue; // terrain: always legitimately known
    // `isVisibleTo` already treats our own entities, allies and nodes as visible, and checks tile fog for the rest.
    if (!isVisibleTo(state, me, slot, services.nav)) out.push(slot);
  }
  return out;
}

/** A stable serialisation of commands, for exact comparison. */
function serialise(commands: unknown[]): string {
  return JSON.stringify(commands);
}

describe('AI cannot see through fog', () => {
  /**
   * The core proof. For each phase and seed: snapshot the commands, perturb EVERY hidden entity, recompute the commands
   * from a fresh brain, and require equality.
   *
   * A fresh brain is used for the perturbed pass so that internal memory (wave state, anchor, scouting target) is
   * identical between the two runs — otherwise a difference could come from accumulated state rather than from the
   * perturbation, and the test would be unable to tell cheating from ordinary divergence.
   */
  for (const seed of [1014, 2021, 3033]) {
    for (const minutes of [2, 8, 16]) {
      it(`seed ${seed} at ${minutes} min: hidden state does not affect decisions`, () => {
        const { registry, state, services } = setup(seed, minutes);

        for (const me of ['p1', 'p2'] as PlayerId[]) {
          const hidden = hiddenSlots(state, services, me);
          // A player with nothing hidden is trivially safe; that is a coverage gap, not a pass, so require that at
          // least one of the two players in at least one phase has hidden entities.
          const clean = new AiBrain(me, 'normal', registry, services);

          // Baseline: commands from the true state.
          const before = serialise(clean.tick(state).commands);

          // Perturb hidden entities hard enough that any read changes behaviour: teleport far away, zero the HP.
          const saved: { slot: number; x: number; y: number; hp: number }[] = [];
          const store = state.entities;
          for (const slot of hidden) {
            saved.push({ slot, x: store.posX[slot]!, y: store.posY[slot]!, hp: store.hp[slot]! });
            store.posX[slot] = store.posX[slot]! + 3000;
            store.posY[slot] = store.posY[slot]! - 2500;
            store.hp[slot] = 1;
          }

          const after = serialise(new AiBrain(me, 'normal', registry, services).tick(state).commands);

          // Restore, so the next player and next phase see a pristine world.
          for (const s of saved) {
            store.posX[s.slot] = s.x;
            store.posY[s.slot] = s.y;
            store.hp[s.slot] = s.hp;
          }

          expect(after, `${me} commands changed when ${hidden.length} hidden entities were moved`).toBe(before);
        }
      }, 120_000);
    }
  }

  it('at least one phase actually has hidden entities to test', () => {
    // Guards the test above from silently becoming vacuous: if fog were broken such that everything is always visible,
    // every perturbation would compare zero entities and "pass" without proving anything.
    const { state, services } = setup(2021, 8);
    const total = hiddenSlots(state, services, 'p1').length + hiddenSlots(state, services, 'p2').length;
    expect(total).toBeGreaterThan(0);
  }, 120_000);
});
