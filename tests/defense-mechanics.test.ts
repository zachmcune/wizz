import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, recomputePower, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { hasBuff, strongestSlowAttackCooldownFactor, strongestSlowMoveFactor } from '../src/sim/queries';
import { getBeamWeapon, ensureTurretWeapon } from '../src/sim/capabilities';

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

    let sawBeam = false;
    for (let i = 0; i < 80; i++) {
      sim.step();
      const beacon = [...state.entities.values()].find((e) => e.kind === 'building' && e.defId === 'inferno_beacon');
      if (beacon && beacon.kind === 'building' && getBeamWeapon(beacon)) sawBeam = true;
    }

    expect(a.hp).toBeLessThan(hpA);
    expect(b.hp).toBeLessThan(hpB);
    expect([...state.entities.values()].some((e) => e.kind === 'projectile' && e.defId === 'inferno_orb')).toBe(false);
    expect(sawBeam).toBe(true);
  });

  it('applies slow status from Frost Spire hits', () => {
    const { state, services, sim } = setup();
    spawnEntity(state, services, null, 'frost_spire', 'player0', 640, 640);
    const target = spawnEntity(state, services, null, 'stone_golem', 'player1', 760, 640);

    let sawBeam = false;
    for (let i = 0; i < 80; i++) {
      sim.step();
      const spire = [...state.entities.values()].find((e) => e.kind === 'building' && e.defId === 'frost_spire');
      if (spire && spire.kind === 'building' && getBeamWeapon(spire)) sawBeam = true;
    }

    expect(hasBuff(target, 'slow', state.tick)).toBe(true);
    expect(strongestSlowMoveFactor(target, state.tick)).toBeLessThan(0.85);
    expect(strongestSlowAttackCooldownFactor(target, state.tick)).toBeGreaterThan(1.1);
    expect([...state.entities.values()].some((e) => e.kind === 'projectile' && e.defId === 'frost_bolt')).toBe(false);
    expect(sawBeam).toBe(true);
  });

  it('stops beam immediately when target leaves range', () => {
    const { state, services, sim } = setup();
    const spire = spawnEntity(state, services, null, 'frost_spire', 'player0', 640, 640);
    const target = spawnEntity(state, services, null, 'stone_golem', 'player1', 760, 640);

    for (let i = 0; i < 20; i++) sim.step();
    expect(spire.kind === 'building' && getBeamWeapon(spire)).toBeTruthy();

    target.pos.x = 1200;
    target.pos.y = 1200;
    for (let i = 0; i < 5; i++) sim.step();
    expect(spire.kind === 'building' && !getBeamWeapon(spire)).toBe(true);
  });

  it('chains lightning from Storm Conductor to nearby enemies', () => {
    const { state, services, sim } = setup();
    spawnEntity(state, services, null, 'storm_conductor', 'player0', 640, 640);
    const a = spawnEntity(state, services, null, 'stone_golem', 'player1', 760, 640);
    const b = spawnEntity(state, services, null, 'stone_golem', 'player1', 800, 640);
    const hpB = b.hp;

    let sawCharge = false;
    let sawChain = false;
    for (let i = 0; i < 80; i++) {
      const result = sim.step();
      if (result.events.some((e) => e.type === 'attackCharging')) sawCharge = true;
      if (result.events.some((e) => e.type === 'chainLightningFired' && e.hits.length >= 2)) sawChain = true;
    }

    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(hpB);
    expect(sawCharge).toBe(true);
    expect(sawChain).toBe(true);
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
    expect(cannon.kind).toBe('building');
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

  it('fires rapid arcane bolts with smooth turret tracking', () => {
    const { state, services, sim } = setup();
    const sentry = spawnEntity(state, services, null, 'arcane_sentry', 'player0', 640, 640);
    const target = spawnEntity(state, services, null, 'stone_golem', 'player1', 760, 640);
    const hp0 = target.hp;

    let sawProjectile = false;
    for (let i = 0; i < 40; i++) {
      sim.step();
      if ([...state.entities.values()].some((e) => e.kind === 'projectile' && e.defId === 'arcane_bolt')) {
        sawProjectile = true;
      }
    }

    expect(sawProjectile).toBe(true);
    expect(target.hp).toBeLessThan(hp0);
    expect(sentry.kind).toBe('building');
    if (sentry.kind === 'building') {
      expect(ensureTurretWeapon(sentry).crystalIndex).toBeGreaterThan(0);
    }
  });

  it('preserves sustained DPS after rapid-fire redesign', () => {
    const { state, services, sim } = setup();
    spawnEntity(state, services, null, 'arcane_sentry', 'player0', 640, 640);
    const target = spawnEntity(state, services, null, 'stone_golem', 'player1', 760, 640);

    for (let i = 0; i < 20; i++) sim.step();
    const hpStart = target.hp;

    for (let i = 0; i < 40; i++) sim.step();
    const damage = hpStart - target.hp;

    // 3 dmg × 10/sec × 0.9 vs heavy ≈ 27 DPS → ~54 HP over 2 seconds
    expect(damage).toBeGreaterThan(45);
    expect(damage).toBeLessThan(65);
  });
});
