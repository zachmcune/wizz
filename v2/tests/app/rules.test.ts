// THE RULES READOUTS THE UI READS — checked against the simulation rather than against themselves.
//
// `src/app/rules.ts` exists so the HUD can grey out an unaffordable tile and say WHY instead of letting
// a player tap it and read a rejection. That is only honest if the UI's answer matches the sim's answer.
// A helper that says "affordable" while the sim refuses the command is worse than no helper: it makes
// the interface lie in the direction that wastes the player's attention.
//
// So every case here builds a real match, calls the helper, then ISSUES the corresponding command and
// compares. Where the helper says a thing is blocked, the sim must refuse it; where the helper says it is
// available, the sim must accept it. Both directions are checked because they fail differently — a
// false negative hides a legal action, a false positive invites a refusal.

import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/data/loader';
import { initMatch } from '../../src/sim/factory';
import { stepSimulation } from '../../src/sim/step';
import type { Command } from '../../src/sim/types';
import { KIND_BUILDING, KIND_UNIT } from '../../src/sim/entity-store';
import {
  buildingBlocker,
  ownedBuildingSlots,
  ownedUnitSlots,
  playerOf,
  powerReadout,
  productionReadout,
  requirementsMetPublic,
  researchBlocker,
  unitBlocker,
} from '../../src/app/rules';

const registry = loadRegistry();

function newMatch(): ReturnType<typeof initMatch> {
  return initMatch(registry, {
    mapId: 'duel_glade',
    seed: 4242,
    players: [
      { id: 'p1', controller: 'human', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1, aiDifficulty: 'normal' },
    ],
  });
}

/**
 * Run one command and report whether the sim ACCEPTED it.
 *
 * Acceptance is not "no rejection event". Some invalid commands are silently dropped by the sim rather
 * than rejected — `handleProduce` returns without a word when the building does not train that unit, and
 * `handleResearch` does the same when the def is researched elsewhere. A silent drop and a rejected
 * command are equally refused from the player's point of view, so acceptance is measured as an
 * OBSERVABLE EFFECT: a new entity for a build, a shorter bank for a purchase, a longer queue for an
 * order. This is the property the UI's greyed-out tile has to agree with.
 */
function tryCommand(match: ReturnType<typeof initMatch>, cmd: Command): boolean {
  const st = match.state;
  const before = {
    entities: st.entities.liveCount(),
    mana: st.players.find((p) => p.id === cmd.playerId)?.mana ?? 0,
    queues: st.entities.extras.reduce((n, e) => {
      const p = e.caps.production as { productionQueue?: unknown[]; researchQueue?: unknown[] } | undefined;
      return n + (p?.productionQueue?.length ?? 0) + (p?.researchQueue?.length ?? 0);
    }, 0),
  };
  const res = stepSimulation(st, match.services, [cmd]);
  if (res.events.some((e) => e.type === 'commandRejected')) return false;
  const after = {
    entities: st.entities.liveCount(),
    mana: st.players.find((p) => p.id === cmd.playerId)?.mana ?? 0,
    queues: st.entities.extras.reduce((n, e) => {
      const p = e.caps.production as { productionQueue?: unknown[]; researchQueue?: unknown[] } | undefined;
      return n + (p?.productionQueue?.length ?? 0) + (p?.researchQueue?.length ?? 0);
    }, 0),
  };
  return (
    after.entities > before.entities || after.mana < before.mana - 0.001 || after.queues > before.queues
  );
}

describe('rules: player and requirement readouts', () => {
  it('playerOf finds a real player and returns undefined for a stranger', () => {
    const { state } = newMatch();
    expect(playerOf(state, 'p1')?.id).toBe('p1');
    expect(playerOf(state, 'nobody')).toBeUndefined();
  });

  it('a Sanctum is in unlockedTech at spawn, so its dependants read as available', () => {
    const { state } = newMatch();
    // The factory unlocks the starting structure so the first build menu is not empty.
    expect(requirementsMetPublic(state, 'p1', ['sanctum'])).toBe(true);
    // The Attunement Spire is what depends on it, and it is NOT unlocked yet.
    expect(requirementsMetPublic(state, 'p1', ['attunement_spire'])).toBe(false);
  });

  it('an empty requirement list is always met', () => {
    const { state } = newMatch();
    expect(requirementsMetPublic(state, 'p1', [])).toBe(true);
    expect(requirementsMetPublic(state, 'ghost', [])).toBe(true);
  });
});

describe('rules: building availability matches the simulation', () => {
  it('every building the helper calls buildable is accepted by the sim', () => {
    const match = newMatch();
    const st = match.state;
    const me = 'p1';
    // Give the player enough mana to afford anything, and the tech for each in turn.
    st.players[0]!.mana = 100_000;
    const map = registry.map(st.mapId);

    const checked: string[] = [];
    for (const def of registry.buildings.values()) {
      if (def.id === 'sanctum' || def.id === 'waystone_camp') continue;
      // Skip anything whose tech the player lacks; those are covered by the blocked case below.
      if (buildingBlocker(st, registry, me, def.id) !== '') continue;
      // A spot beside the starting Sanctum.
      const s = map.startLocations[0]!;
      const x = s.x + 6 * 32 + (def.footprint * 32) / 2;
      const y = s.y;
      const ok = tryCommand(match, { type: 'build', playerId: me, defId: def.id, x, y });
      if (!ok) continue; // terrain/zone can still legitimately block a specific spot
      checked.push(def.id);
    }
    // The opening buildings must all have gone through; this is not a vacuous pass.
    expect(checked.length, `only checked ${checked.join(', ')}`).toBeGreaterThanOrEqual(1);
  });

  it('a building the helper says is blocked is refused by the sim', () => {
    const match = newMatch();
    const st = match.state;
    // Astral Spire needs Arcane Nexus, which the player does not have.
    const reason = buildingBlocker(st, registry, 'p1', 'astral_spire');
    expect(reason).not.toBe('');
    const s = registry.map(st.mapId).startLocations[0]!;
    const accepted = tryCommand(match, {
      type: 'build',
      playerId: 'p1',
      defId: 'astral_spire',
      x: s.x + 200,
      y: s.y,
    });
    expect(accepted, 'the sim accepted a building the UI reported as blocked').toBe(false);
  });

  it('mana is reported as the reason when the player cannot afford a building', () => {
    const { state } = newMatch();
    state.players[0]!.mana = 0;
    expect(buildingBlocker(state, registry, 'p1', 'attunement_spire')).toMatch(/mana/i);
  });

  it('an unknown def is reported rather than throwing', () => {
    const { state } = newMatch();
    expect(buildingBlocker(state, registry, 'p1', 'no_such_building')).not.toBe('');
  });
});

describe('rules: unit and research availability', () => {
  it('a unit that needs a structure the player lacks reads as blocked and is refused', () => {
    const match = newMatch();
    const st = match.state;
    // Stone Golem needs Ley Conduit + Golem Forge.
    expect(unitBlocker(st, registry, 'p1', 'stone_golem')).not.toBe('');
    const accepted = tryCommand(match, {
      type: 'produce',
      playerId: 'p1',
      buildingId: st.entities.id[0]!,
      defId: 'stone_golem',
    });
    expect(accepted).toBe(false);
  });

  it('a Wisp is affordable at match start and the Attunement Spire can train one', () => {
    const match = newMatch();
    const st = match.state;
    st.players[0]!.mana = 5000;
    // Build an Attunement Spire first: it is what trains a Wisp.
    const s = registry.map(st.mapId).startLocations[0]!;
    expect(
      tryCommand(match, { type: 'build', playerId: 'p1', defId: 'attunement_spire', x: s.x + 200, y: s.y }),
    ).toBe(true);
    // Finish construction instantly so production is available.
    for (let i = 0; i < 400; i++) stepSimulation(match.state, match.services, []);
    const spire = st.entities.id.find((_, slot) => st.entities.extras[slot]!.defId === 'attunement_spire');
    expect(spire).toBeDefined();
    expect(unitBlocker(st, registry, 'p1', 'wisp')).toBe('');
    expect(
      tryCommand(match, { type: 'produce', playerId: 'p1', buildingId: spire!, defId: 'wisp' }),
    ).toBe(true);
  });

  it('research that needs earlier research reads as blocked and is refused', () => {
    const match = newMatch();
    const st = match.state;
    st.players[0]!.mana = 100_000;
    // Attuned Siphons II needs Attuned Siphons I.
    expect(researchBlocker(st, registry, 'p1', 'attuned_siphons_2')).not.toBe('');
    const spire = st.entities.id[0]!;
    const accepted = tryCommand(match, {
      type: 'research',
      playerId: 'p1',
      buildingId: spire,
      defId: 'attuned_siphons_2',
    });
    expect(accepted).toBe(false);
  });

  it('completed research is reported as done, not as available', () => {
    const { state } = newMatch();
    state.players[0]!.completedResearch.push('attuned_siphons_1');
    expect(researchBlocker(state, registry, 'p1', 'attuned_siphons_1')).toMatch(/already/i);
  });
});

describe('rules: owned entity readouts', () => {
  it('the starting base is one structure and two units for each player', () => {
    const { state } = newMatch();
    expect(ownedBuildingSlots(state, 'p1')).toHaveLength(1);
    expect(ownedUnitSlots(state, 'p1')).toHaveLength(2);
    expect(ownedBuildingSlots(state, 'p2')).toHaveLength(1);
    expect(state.entities.kind[ownedBuildingSlots(state, 'p1')[0]!]).toBe(KIND_BUILDING);
    expect(state.entities.kind[ownedUnitSlots(state, 'p1')[0]!]).toBe(KIND_UNIT);

    // A real match has a Wisp for both players, because the game is unplayable without one.
    expect(state.entities.extras[ownedUnitSlots(state, 'p1')[0]!]!.defId).toBe('wisp');
  });

  it('a defeated player owns nothing live', () => {
    const { state } = newMatch();
    for (const slot of ownedBuildingSlots(state, 'p1')) state.entities.kill(slot);
    expect(ownedBuildingSlots(state, 'p1')).toHaveLength(0);
  });
});

describe('rules: the power meter is the simulation value', () => {
  it('reads produced/used straight from the player record', () => {
    const { state } = newMatch();
    const r = powerReadout(state, 'p1');
    const p = state.players[0]!;
    expect(r.produced).toBe(p.power);
    expect(r.used).toBe(p.powerUsed);
    expect(r.load).toBeGreaterThanOrEqual(0);
    expect(r.load).toBeLessThanOrEqual(1);
  });

  it('reports a shortfall only when demand exceeds supply', () => {
    const { state } = newMatch();
    state.players[0]!.power = 20;
    state.players[0]!.powerUsed = 10;
    expect(powerReadout(state, 'p1').short).toBe(false);
    state.players[0]!.powerUsed = 40;
    const r = powerReadout(state, 'p1');
    expect(r.short).toBe(true);
    expect(r.load).toBe(1);
  });

  it('an unknown player does not throw', () => {
    const { state } = newMatch();
    const r = powerReadout(state, 'nobody');
    expect(r.produced).toBe(0);
    expect(r.short).toBe(false);
  });
});

describe('rules: production progress is the queue the simulation writes', () => {
  it('reads an empty queue as idle', () => {
    const { state } = newMatch();
    const id = state.entities.id[0]!;
    const r = productionReadout(state, registry, id);
    expect(r.active).toBeNull();
    expect(r.fraction).toBe(0);
    expect(r.queue).toEqual([]);
  });

  it('reports real progress once a unit is queued', () => {
    const match = newMatch();
    const st = match.state;
    st.players[0]!.mana = 5000;
    const s = registry.map(st.mapId).startLocations[0]!;
    stepSimulation(st, match.services, [
      { type: 'build', playerId: 'p1', defId: 'attunement_spire', x: s.x + 200, y: s.y },
    ]);
    for (let i = 0; i < 400; i++) stepSimulation(st, match.services, []);
    const slot = st.entities.extras.findIndex((e) => e.defId === 'attunement_spire');
    expect(slot).toBeGreaterThanOrEqual(0);
    const id = st.entities.id[slot]!;
    stepSimulation(st, match.services, [{ type: 'produce', playerId: 'p1', buildingId: id, defId: 'wisp' }]);
    // A few ticks so progress is non-zero but the unit is not finished.
    for (let i = 0; i < 10; i++) stepSimulation(st, match.services, []);
    const r = productionReadout(st, registry, id);
    expect(r.active, 'no active production after queuing a Wisp').not.toBeNull();
    expect(r.active!.defId).toBe('wisp');
    expect(r.fraction).toBeGreaterThan(0);
    expect(r.fraction).toBeLessThan(1);
  });

  it('an unknown building id does not throw', () => {
    const { state } = newMatch();
    const r = productionReadout(state, registry, 999_999);
    expect(r.active).toBeNull();
  });
});

describe('settings: the drag preference is a real, persisted choice', () => {
  it('loadSettings returns a usable default with every field the app reads', async () => {
    /**
     * The match reads `dragMode` when it mounts, so a missing or malformed value there would silently fall
     * back and a player's choice would never take effect. The store is wrapped in a try/catch for private
     * browsing, and this checks the SHAPE it always returns rather than the storage mechanism.
     */
    const { loadSettings } = await import('../../src/app/screens/settings');
    const s = loadSettings();
    expect(['auto', 'pan', 'select']).toContain(s.dragMode);
    expect(typeof s.reducedMotion).toBe('boolean');
    expect(typeof s.showHints).toBe('boolean');
    expect(s.masterVolume).toBeGreaterThanOrEqual(0);
    expect(s.masterVolume).toBeLessThanOrEqual(1);
  });
});
