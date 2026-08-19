import { describe, expect, it } from 'vitest';
import { getRegistry } from './helpers';
import { buildingInspectInfo, missingRequiresLabel } from '../src/ui/hud/building-inspect';

const reg = getRegistry();

function player(unlockedTech: string[], mana = 10_000) {
  return { mana, unlockedTech };
}

describe('building inspect info', () => {
  it('shows cost, power, and ready status for an unlocked affordable building', () => {
    const def = reg.building('ley_conduit');
    const info = buildingInspectInfo(def, reg, player(['sanctum', 'attunement_spire']));
    expect(info.unlocked).toBe(true);
    expect(info.canPlace).toBe(true);
    expect(info.subtitle).toBe(`${def.cost} mana · +${def.powerProduced} pwr`);
    expect(info.statsLine).toContain(`${def.cost} mana`);
    expect(info.statsLine).toContain(`${def.buildTime}s`);
    expect(info.statsLine).toContain(`${def.hp} HP`);
    expect(info.statusLine).toBe('Ready to place');
    expect(info.description).toContain('power');
    expect(info.facts.some((f) => f.label === 'Power' && f.text.includes('+60'))).toBe(true);
  });

  it('names the missing Attunement Spire on opening buildings', () => {
    const def = reg.building('ley_conduit');
    const info = buildingInspectInfo(def, reg, player(['sanctum'], def.cost));
    expect(info.unlocked).toBe(false);
    expect(info.subtitle).toBe('Needs Attunement Spire');
    expect(info.statusLine).toBe('Needs Attunement Spire');
    expect(info.missingRequires.map((r) => r.id)).toEqual(['attunement_spire']);
  });

  it('names the missing buildings instead of a generic Locked label', () => {
    const def = reg.building('golem_forge');
    const info = buildingInspectInfo(def, reg, player(['sanctum'], def.cost));
    expect(info.unlocked).toBe(false);
    expect(info.canPlace).toBe(false);
    expect(info.subtitle).toBe('Needs Ley Conduit');
    expect(info.statusLine).toBe('Needs Ley Conduit');
    expect(info.missingRequires.map((r) => r.id)).toEqual(['ley_conduit']);
    expect(info.requires.find((r) => r.id === 'ley_conduit')?.met).toBe(false);
  });

  it('joins multiple missing requirements', () => {
    const def = reg.building('scrying_obelisk');
    const info = buildingInspectInfo(def, reg, player(['sanctum']));
    expect(info.subtitle).toBe('Needs Attunement Spire + Ley Conduit');
    expect(missingRequiresLabel(info.missingRequires)).toBe('Needs Attunement Spire + Ley Conduit');
  });

  it('marks requirements met once the player has built them', () => {
    const def = reg.building('scrying_obelisk');
    const info = buildingInspectInfo(
      def,
      reg,
      player(['sanctum', 'attunement_spire', 'ley_conduit'], def.cost),
    );
    expect(info.unlocked).toBe(true);
    expect(info.requires.every((r) => r.met)).toBe(true);
    expect(info.facts.some((f) => f.label === 'Radar')).toBe(true);
  });

  it('reports not enough mana without hiding the cost', () => {
    const def = reg.building('summoning_circle');
    const info = buildingInspectInfo(def, reg, player(['sanctum', 'attunement_spire'], def.cost - 1));
    expect(info.unlocked).toBe(true);
    expect(info.affordable).toBe(false);
    expect(info.canPlace).toBe(false);
    expect(info.subtitle).toBe(`${def.cost} mana`);
    expect(info.statusLine).toBe(`Need ${def.cost} mana`);
  });

  it('lists what a production building trains and what a tech building unlocks', () => {
    const forge = buildingInspectInfo(reg.building('golem_forge'), reg, player(['ley_conduit']));
    const trains = forge.facts.find((f) => f.label === 'Trains')?.text ?? '';
    expect(trains).toContain('Stone Golem');
    expect(trains).toContain('Siege Behemoth');
    expect(trains).toContain('Waystone Wagon');

    const ley = buildingInspectInfo(reg.building('ley_conduit'), reg, player(['sanctum']));
    const unlocks = ley.facts.find((f) => f.label === 'Unlocks')?.text ?? '';
    expect(unlocks).toContain('Golem Forge');
    expect(unlocks).toContain('Scrying Obelisk');
    expect(unlocks).toContain('Resonance Vault');
  });

  it('summarizes combat, garrison, and heal roles', () => {
    const sentry = buildingInspectInfo(reg.building('arcane_sentry'), reg, player(['sanctum']));
    const combat = sentry.facts.find((f) => f.label === 'Combat')?.text ?? '';
    expect(combat).toContain('range');
    expect(combat).toContain('hits air');

    const bunker = buildingInspectInfo(reg.building('arcane_bunker'), reg, player(['sanctum']));
    const garrison = bunker.facts.find((f) => f.label === 'Garrison')?.text ?? '';
    expect(garrison).toContain('4');
    expect(garrison).toContain('Arcane Archer');

    const sanctuary = buildingInspectInfo(reg.building('sanctuary_spire'), reg, player(['arcane_nexus']));
    const aura = sanctuary.facts.find((f) => f.label === 'Aura')?.text ?? '';
    expect(aura).toMatch(/Heals/i);
  });
});
