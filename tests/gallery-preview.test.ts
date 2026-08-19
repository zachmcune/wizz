import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { secondsToTicks } from '../src/core/constants';
import { isChanneling } from '../src/sim/capabilities';
import {
  galleryPreviewHint,
  isDefenseBuilding,
  isGalleryPreviewable,
  previewScenarioFor,
  previewShouldReset,
  setupPreviewScene,
  PREVIEW_RESET_TICKS,
} from '../src/ui/gallery-preview-scene';

const reg = getRegistry();

function stepUntil(
  sim: { step(): { events: { type: string; sourceId?: number }[] } },
  pred: (events: { type: string; sourceId?: number }[]) => boolean,
  maxTicks: number,
): boolean {
  for (let i = 0; i < maxTicks; i++) {
    const { events } = sim.step();
    if (pred(events)) return true;
  }
  return false;
}

describe('gallery live preview scenarios', () => {
  it('covers every troop from unit data without fake combat for non-fighters', () => {
    const kinds: Record<string, string> = {};
    for (const def of reg.units.values()) {
      const scenario = previewScenarioFor(reg, 'unit', def.id);
      kinds[def.id] = scenario.kind;
      expect(isGalleryPreviewable(reg, 'unit', def.id)).toBe(true);
      if (def.weapon) expect(scenario.kind).toBe('combat');
      else if (def.isHarvester) expect(scenario.kind).toBe('harvest');
      else if (def.canConjureMana) expect(scenario.kind).toBe('channel');
      else if (def.deploysAs) expect(scenario.kind).toBe('deploy');
      else expect(scenario.kind).toBe('move');
    }
    expect(kinds['imp_swarmling']).toBe('combat');
    expect(kinds['arcane_archer']).toBe('combat');
    expect(kinds['stone_golem']).toBe('combat');
    expect(kinds['rift_skimmer']).toBe('combat');
    expect(kinds['storm_caster']).toBe('combat');
    expect(kinds['wisp']).toBe('harvest');
    expect(kinds['mana_weaver']).toBe('channel');
    expect(kinds['waystone_wagon']).toBe('deploy');
    expect(galleryPreviewHint(previewScenarioFor(reg, 'unit', 'wisp'))).toMatch(/Harvest/i);
    expect(galleryPreviewHint(previewScenarioFor(reg, 'unit', 'imp_swarmling'))).toMatch(/Combat/i);
  });

  it('keeps defense cards on the combat overlay path', () => {
    expect(isDefenseBuilding(reg, 'arcane_sentry')).toBe(true);
    expect(isGalleryPreviewable(reg, 'building', 'arcane_sentry')).toBe(true);
    expect(isGalleryPreviewable(reg, 'building', 'sanctum')).toBe(false);
    const scenario = previewScenarioFor(reg, 'building', 'arcane_sentry');
    expect(scenario.subject).toBe('building');
    expect(scenario.kind).toBe('combat');
    expect(scenario.attackerUnit).toBe('stone_golem');
  });

  it('siege troops attack a building dummy; melee troops do not', () => {
    const behemoth = previewScenarioFor(reg, 'unit', 'siege_behemoth');
    expect(behemoth.kind).toBe('combat');
    expect(behemoth.dummyKind).toBe('building');
    const golem = previewScenarioFor(reg, 'unit', 'stone_golem');
    expect(golem.dummyKind).toBe('unit');
    const skimmer = previewScenarioFor(reg, 'unit', 'rift_skimmer');
    expect(skimmer.dummyKind).toBe('unit');
  });
});

describe('gallery live preview vignettes', () => {
  it('lets a combat troop fire so attack tells can play', () => {
    const { sim, focusEntityId } = setupPreviewScene(reg, 'unit', 'imp_swarmling', '#4f9dff');
    const fired = stepUntil(sim, (events) => events.some((ev) => ev.type === 'attackFired' && ev.sourceId === focusEntityId), 120);
    expect(fired).toBe(true);
  });

  it('shows archer, golem, skimmer, and storm caster attacking', () => {
    for (const id of ['arcane_archer', 'stone_golem', 'rift_skimmer', 'storm_caster'] as const) {
      const { sim, focusEntityId } = setupPreviewScene(reg, 'unit', id, '#4f9dff');
      const fired = stepUntil(sim, (events) => events.some((ev) => ev.type === 'attackFired' && ev.sourceId === focusEntityId), 160);
      expect(fired, `${id} should fire`).toBe(true);
    }
  });

  it('runs a harvest loop for the wisp', () => {
    const { sim, state, focusEntityId } = setupPreviewScene(reg, 'unit', 'wisp', '#4f9dff');
    const wisp = state.entities.get(focusEntityId);
    expect(wisp?.defId).toBe('wisp');
    const deposited = stepUntil(sim, (events) => events.some((ev) => ev.type === 'manaDeposited'), 280);
    expect(deposited).toBe(true);
  });

  it('channels mana for the weaver', () => {
    const { sim, state, focusEntityId } = setupPreviewScene(reg, 'unit', 'mana_weaver', '#4f9dff');
    const weaver = state.entities.get(focusEntityId)!;
    const ticks = secondsToTicks(reg.balance.conjureManaIntervalSeconds) + 4;
    const conjured = stepUntil(sim, (events) => events.some((ev) => ev.type === 'manaConjured'), ticks);
    expect(isChanneling(weaver)).toBe(true);
    expect(conjured).toBe(true);
  });

  it('deploys the waystone wagon into a camp', () => {
    const { sim, scenario } = setupPreviewScene(reg, 'unit', 'waystone_wagon', '#4f9dff');
    expect(scenario.kind).toBe('deploy');
    const deployed = stepUntil(sim, (events) => events.some((ev) => ev.type === 'mobileHQDeployed'), 12 * 20 + 8);
    expect(deployed).toBe(true);
    expect([...sim.state.entities.values()].some((e) => e.defId === 'waystone_camp')).toBe(true);
  });

  it('still lets Arcane Sentry fire at attackers', () => {
    const { sim, focusEntityId, scenario } = setupPreviewScene(reg, 'building', 'arcane_sentry', '#4f9dff');
    expect(scenario.kind).toBe('combat');
    const fired = stepUntil(sim, (events) => events.some((ev) => ev.type === 'attackFired' && ev.sourceId === focusEntityId), 80);
    expect(fired).toBe(true);
  });

  it('resets combat when the featured troop dies or time runs out', () => {
    const { state, scenario, focusEntityId, opposingIds } = setupPreviewScene(reg, 'unit', 'imp_swarmling', '#4f9dff');
    expect(previewShouldReset(state, scenario, focusEntityId, opposingIds, PREVIEW_RESET_TICKS)).toBe(true);
    expect(previewShouldReset(state, scenario, focusEntityId, opposingIds, 10)).toBe(false);
    const featured = state.entities.get(focusEntityId)!;
    featured.hp = 0;
    expect(previewShouldReset(state, scenario, focusEntityId, opposingIds, 10)).toBe(true);
  });
});
