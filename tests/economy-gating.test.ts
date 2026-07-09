import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity, unlockTech } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { ownedBy } from '../src/sim/queries';
import { expectBuilding } from './entity-helpers';
import { getProductionQueue } from '../src/sim/capabilities';

const reg = getRegistry();

describe('economy gating', () => {
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
