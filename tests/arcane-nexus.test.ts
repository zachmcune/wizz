import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity, unlockTech } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { ownedBy } from '../src/sim/queries';
import { expectBuilding } from './entity-helpers';

const reg = getRegistry();

function setup() {
  const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
  const sim = new Simulation(state, services);
  sim.setAiEnabled(false);
  const player = state.players.find((p) => p.id === 'player0')!;
  player.mana = 20000;
  return { state, services, sim, player };
}

describe('Arcane Nexus tech center rework', () => {
  it('is a tech building and no longer produces units or unlocks normal battle spells directly', () => {
    const nexus = reg.building('arcane_nexus');
    expect(nexus.producesUnits ?? []).toEqual([]);
    expect(nexus.unlocksSpells ?? []).toEqual([]);
    expect(nexus.description).toContain('Major tech progression building');
  });

  it('moves Storm Caster production to the Summoning Circle while keeping Nexus as its tech gate', () => {
    const stormCaster = reg.unit('storm_caster');
    const circle = reg.building('summoning_circle');
    expect(stormCaster.producedBy).toBe('summoning_circle');
    expect(stormCaster.requires).toContain('arcane_nexus');
    expect(circle.producesUnits).toContain('storm_caster');
  });

  it('allows Storm Caster production only after Arcane Nexus is complete', () => {
    const { state, services, sim, player } = setup();
    const sanctum = expectBuilding(ownedBy(state, player.id).find((e) => e.defId === 'sanctum')!);
    const circle = expectBuilding(spawnEntity(state, services, null, 'summoning_circle', player.id, sanctum.pos.x + 96, sanctum.pos.y));
    unlockTech(state, player.id, 'summoning_circle');

    sim.enqueueNow([{ type: 'produce', playerId: player.id, buildingId: circle.id, defId: 'storm_caster' }]);
    sim.step();
    expect(circle.productionQueue?.length ?? 0).toBe(0);

    unlockTech(state, player.id, 'arcane_nexus');
    sim.enqueueNow([{ type: 'produce', playerId: player.id, buildingId: circle.id, defId: 'storm_caster' }]);
    sim.step();
    expect(circle.productionQueue?.length ?? 0).toBe(1);
  });

  it('does not allow normal battle spells from Nexus alone; Astral Spire unlocks them', () => {
    const { state, sim, player } = setup();
    unlockTech(state, player.id, 'arcane_nexus');

    sim.enqueueNow([{ type: 'castSpell', playerId: player.id, spellId: 'meteor_storm', x: 600, y: 600 }]);
    sim.step();
    expect(player.spellCooldowns.meteor_storm ?? 0).toBe(0);

    unlockTech(state, player.id, 'astral_spire');
    sim.enqueueNow([{ type: 'castSpell', playerId: player.id, spellId: 'meteor_storm', x: 600, y: 600 }]);
    sim.step();
    expect(player.spellCooldowns.meteor_storm).toBeGreaterThan(0);
  });

  it('gates requested advanced defenses on Nexus while leaving Arcane Bunker early', () => {
    expect(reg.building('arcane_bunker').requires).not.toContain('arcane_nexus');
    for (const id of ['frost_spire', 'inferno_beacon', 'storm_conductor', 'celestial_cannon', 'sanctuary_spire']) {
      expect(reg.building(id).requires).toContain('arcane_nexus');
    }
  });

  it('requires Nexus for Siege Behemoth but not Stone Golem or Waystone Wagon', () => {
    expect(reg.unit('siege_behemoth').requires).toContain('arcane_nexus');
    expect(reg.unit('stone_golem').requires).not.toContain('arcane_nexus');
    expect(reg.unit('waystone_wagon').requires).not.toContain('arcane_nexus');
  });
});
