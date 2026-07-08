import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, recomputePower, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { hasBuff } from '../src/sim/queries';

const reg = getRegistry();

function setup() {
  const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
  const sim = new Simulation(state, services);
  sim.setAiEnabled(false);
  spawnEntity(state, services, null, 'ley_conduit', 'player0', 580, 560);
  spawnEntity(state, services, null, 'ley_conduit', 'player0', 700, 560);
  recomputePower(state, services);
  return { state, services, sim };
}

describe('advanced defense mechanics', () => {
  it('applies splash damage for anti-swarm weapons', () => {
    const { state, services, sim } = setup();
    spawnEntity(state, services, null, 'inferno_beacon', 'player0', 640, 640);
    const a = spawnEntity(state, services, null, 'imp_swarmling', 'player1', 760, 640);
    const b = spawnEntity(state, services, null, 'imp_swarmling', 'player1', 772, 650);
    const hpA = a.hp;
    const hpB = b.hp;

    for (let i = 0; i < 80; i++) sim.step();

    expect(a.hp).toBeLessThan(hpA);
    expect(b.hp).toBeLessThan(hpB);
  });

  it('applies slow status from Frost Spire hits', () => {
    const { state, services, sim } = setup();
    spawnEntity(state, services, null, 'frost_spire', 'player0', 640, 640);
    const target = spawnEntity(state, services, null, 'stone_golem', 'player1', 760, 640);

    for (let i = 0; i < 80; i++) sim.step();

    expect(hasBuff(target, 'slow', state.tick)).toBe(true);
  });

  it('chains lightning from Storm Conductor to nearby enemies', () => {
    const { state, services, sim } = setup();
    spawnEntity(state, services, null, 'storm_conductor', 'player0', 640, 640);
    const a = spawnEntity(state, services, null, 'stone_golem', 'player1', 760, 640);
    const b = spawnEntity(state, services, null, 'stone_golem', 'player1', 800, 640);
    const hpB = b.hp;

    for (let i = 0; i < 80; i++) sim.step();

    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(hpB);
  });

  it('charges artillery, respects minimum range, and damages an impact area', () => {
    const { state, services, sim } = setup();
    const cannon = spawnEntity(state, services, null, 'celestial_cannon', 'player0', 640, 640);
    const near = spawnEntity(state, services, null, 'stone_golem', 'player1', 720, 640);
    const farA = spawnEntity(state, services, null, 'stone_golem', 'player1', 980, 640);
    const farB = spawnEntity(state, services, null, 'stone_golem', 'player1', 1010, 650);
    const nearHp = near.hp;

    for (let i = 0; i < 180; i++) sim.step();

    expect(near.hp).toBe(nearHp);
    expect(farA.hp).toBeLessThan(farA.maxHp);
    expect(farB.hp).toBeLessThan(farB.maxHp);
    expect(cannon.kind === 'building' ? cannon.chargingAttack : undefined).toBeUndefined();
  });

  it('heals friendly units with Sanctuary Spire aura', () => {
    const { state, services, sim } = setup();
    spawnEntity(state, services, null, 'sanctuary_spire', 'player0', 640, 640);
    const ally = spawnEntity(state, services, null, 'stone_golem', 'player0', 700, 640);
    ally.hp = ally.maxHp - 20;

    for (let i = 0; i < 20; i++) sim.step();

    expect(ally.hp).toBeGreaterThan(ally.maxHp - 20);
    expect(ally.hp).toBeLessThanOrEqual(ally.maxHp);
  });
});
