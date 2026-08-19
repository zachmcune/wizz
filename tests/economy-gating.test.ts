import { describe, it, expect } from 'vitest';
import { TILE } from '../src/core/constants';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity, unlockTech } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { ownedBy } from '../src/sim/queries';
import { expectBuilding } from './entity-helpers';
import { getProductionQueue } from '../src/sim/capabilities';

const reg = getRegistry();

/** Buildings that used to need only the Sanctum and could drain starting mana before a drop-off exists. */
const OPENING_GATED_BUILDINGS = [
  'ley_conduit',
  'summoning_circle',
  'arcane_sentry',
  'arcane_bunker',
  'stone_wall',
  'arcane_gate',
] as const;

describe('economy gating', () => {
  it('gates every menu building except the Attunement Spire behind a completed refinery', () => {
    expect(reg.building('attunement_spire').isRefinery).toBe(true);
    expect(reg.building('attunement_spire').requires).toEqual(['sanctum']);
    for (const id of OPENING_GATED_BUILDINGS) {
      expect(reg.building(id).requires, id).toContain('attunement_spire');
    }
  });

  it('still lets the opening Attunement Spire be placed from starting mana', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.id === 'player0')!;
    const sanctum = expectBuilding(ownedBy(state, human.id).find((e) => e.defId === 'sanctum')!);
    const startMana = human.mana;

    sim.enqueueNow([
      {
        type: 'build',
        playerId: human.id,
        defId: 'attunement_spire',
        x: sanctum.pos.x + 4 * TILE,
        y: sanctum.pos.y,
      },
    ]);
    const placed = sim.step();
    expect(placed.events.some((e) => e.type === 'buildingPlaced' && e.defId === 'attunement_spire')).toBe(true);
    expect(ownedBy(state, human.id).some((e) => e.defId === 'attunement_spire')).toBe(true);
    expect(human.mana).toBe(startMana - reg.building('attunement_spire').cost);
  });

  it('rejects other structures until an Attunement Spire is complete', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.id === 'player0')!;
    const sanctum = expectBuilding(ownedBy(state, human.id).find((e) => e.defId === 'sanctum')!);
    human.mana = 9999;
    const startMana = human.mana;

    for (const defId of OPENING_GATED_BUILDINGS) {
      sim.enqueueNow([
        { type: 'build', playerId: human.id, defId, x: sanctum.pos.x + 4 * TILE, y: sanctum.pos.y },
      ]);
      const res = sim.step();
      expect(ownedBy(state, human.id).some((e) => e.defId === defId), defId).toBe(false);
      expect(
        res.events.some((e) => e.type === 'commandRejected' && e.reason === 'requires'),
        defId,
      ).toBe(true);
    }
    expect(human.mana).toBe(startMana);
  });

  it('unlocks other structures after the Attunement Spire finishes', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.id === 'player0')!;
    const sanctum = expectBuilding(ownedBy(state, human.id).find((e) => e.defId === 'sanctum')!);
    spawnEntity(state, services, null, 'attunement_spire', human.id, sanctum.pos.x + 4 * TILE, sanctum.pos.y);
    unlockTech(state, human.id, 'attunement_spire');
    human.mana = 9999;

    sim.enqueueNow([
      {
        type: 'build',
        playerId: human.id,
        defId: 'ley_conduit',
        x: sanctum.pos.x,
        y: sanctum.pos.y + 4 * TILE,
      },
    ]);
    const res = sim.step();
    expect(res.events.some((e) => e.type === 'buildingPlaced' && e.defId === 'ley_conduit')).toBe(true);
    expect(ownedBy(state, human.id).some((e) => e.defId === 'ley_conduit')).toBe(true);
  });

  it('rejects mana weaver production without resonance_vault tech', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.id === 'player0')!;
    const sanctum = expectBuilding(ownedBy(state, human.id).find((e) => e.defId === 'sanctum')!);
    const spire = expectBuilding(
      spawnEntity(state, services, null, 'attunement_spire', human.id, sanctum.pos.x + 80, sanctum.pos.y),
    );
    unlockTech(state, human.id, 'attunement_spire');
    human.mana = 9999;

    sim.enqueueNow([{ type: 'produce', playerId: human.id, buildingId: spire.id, defId: 'mana_weaver' }]);
    sim.step();

    expect(getProductionQueue(spire)?.length ?? 0).toBe(0);
    expect(ownedBy(state, human.id).filter((e) => e.defId === 'mana_weaver').length).toBe(0);
  });

  it('allows mana weaver production from resonance_vault when unlocked', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const human = state.players.find((p) => p.id === 'player0')!;
    const sanctum = expectBuilding(ownedBy(state, human.id).find((e) => e.defId === 'sanctum')!);
    const vault = expectBuilding(
      spawnEntity(state, services, null, 'resonance_vault', human.id, sanctum.pos.x + 160, sanctum.pos.y),
    );
    unlockTech(state, human.id, 'resonance_vault');
    human.mana = 9999;

    sim.enqueueNow([{ type: 'produce', playerId: human.id, buildingId: vault.id, defId: 'mana_weaver' }]);
    sim.step();
    expect(getProductionQueue(vault)?.length ?? 0).toBe(1);
  });
});
