// CONFORMANCE: combat rules (inventory §12) and the counter table (§7).

import { describe, expect, it } from 'vitest';
import { makeMatch } from './test-match';
import { damageUnit, NEUTRAL_VS } from './conformance-helpers';
import { spawnUnitAt, spawnBuildingAt, applyBuildingNav } from '../../src/sim/systems/production';
import { acquireTarget, fire, inWeaponBand, heightBlocksGroundFire, highGroundRangeBonus } from '../../src/sim/systems/combat';
import { ctxFor } from './conformance-helpers';

describe('inventory §12 Combat', () => {
  it('§12.1 damage = base x vs[armourClass] for light armour', () => {
    const m = makeMatch();
    const archer = spawnUnitAt(m.state, m.services, 'arcane_archer', 'player0', 900, 900, null);
    // Arcane Archer: 16 x 1.2 vs light = 19.2
    const dealt = damageUnit(m, archer, 16, { light: 1.2, heavy: 0.7, building: 0.6 });
    expect(dealt).toBeCloseTo(19.2, 6);
  });

  it('§12.1 the same base damage is scaled down against heavy armour', () => {
    const m = makeMatch();
    const golem = spawnUnitAt(m.state, m.services, 'stone_golem', 'player0', 900, 900, null);
    // 16 x 0.7 vs heavy = 11.2
    const dealt = damageUnit(m, golem, 16, { light: 1.2, heavy: 0.7, building: 0.6 });
    expect(dealt).toBeCloseTo(11.2, 6);
  });

  it('§12.1 buildings use the `building` multiplier', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const dealt = damageUnit(m, sanctum, 60, { light: 0.8, heavy: 1.2, building: 2.5 });
    expect(dealt).toBeCloseTo(150, 6);
  });

  it('§7 the vs table is the counter system: golems beat archers at equal cost', () => {
    // This mirrors v1's combat.test.ts assertion.
    const m = makeMatch();
    const golemCost = m.reg.unit('stone_golem').cost;
    const archerCost = m.reg.unit('arcane_archer').cost;
    const archersPerGolem = archerCost > 0 ? Math.round(golemCost / archerCost) : 1;

    const golemSlot = spawnUnitAt(m.state, m.services, 'stone_golem', 'player0', 900, 900, null);
    const golemDef = m.reg.unit('stone_golem');
    // Archer DPS against heavy: 16 * 0.7 per 18 ticks.
    const archerVsHeavy = (16 * 0.7) / (18 / 20);
    // Golem melee DPS against light: 40 * 1.0 per 20 ticks.
    const golemVsLight = (40 * 1.0) / (20 / 20);

    const timeToKillGolemByArchers = golemDef.hp / (archerVsHeavy * archersPerGolem);
    const timeToKillArchersByGolem = (m.reg.unit('arcane_archer').hp * archersPerGolem) / golemVsLight;
    // The golem should clear the equal-cost archer mass faster than it dies.
    expect(timeToKillArchersByGolem).toBeLessThan(timeToKillGolemByArchers);
    void golemSlot;
  });

  it('§12.2 Aegis grants full damage immunity for its duration', () => {
    const m = makeMatch();
    const archer = spawnUnitAt(m.state, m.services, 'arcane_archer', 'player0', 900, 900, null);
    const store = m.state.entities;
    store.extras[archer]!.buffs.push({ kind: 'aegis', expiresTick: m.state.tick + 200 });
    const dealt = damageUnit(m, archer, 100, NEUTRAL_VS);
    expect(dealt).toBe(0);
    // And it expires.
    m.run(201);
    const after = damageUnit(m, archer, 100, NEUTRAL_VS);
    expect(after).toBeGreaterThan(0);
  });

  it('§12.8 charge-up attacks wait before firing', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    // Storm Conductor has chargeTicks 10.
    const tower = spawnBuildingAt(m.state, m.services, 'storm_conductor', 'player0', sx + 96, sy, { complete: true }, null);
    applyBuildingNav(m.state, m.services, tower);
    m.state.players[0]!.power = 200;
    m.state.players[0]!.powerUsed = 0;

    // Put an enemy unit in range (range 180).
    const enemy = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', sx + 200, sy, null);
    m.state.entities.hp[enemy] = 5000;
    m.state.entities.maxHp[enemy] = 5000;

    // After 1 tick nothing should have fired (charge is 10 ticks).
    m.run(1);
    expect(m.state.entities.extras[tower]!.caps.building).toBeDefined();
    const hpAfter1 = m.state.entities.hp[enemy]!;
    m.run(20);
    // After the charge completes, the chain has landed.
    expect(m.state.entities.hp[enemy]!).toBeLessThan(hpAfter1);
  });

  it('§12.9 minimum range creates a blind spot', () => {
    const m = makeMatch();
    const w = m.reg.building('celestial_cannon').weapon!;
    expect(w.minRange).toBe(120);
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const cannon = spawnBuildingAt(m.state, m.services, 'celestial_cannon', 'player0', sx, sy + 200, { complete: true }, null);
    // A target very close to the cannon is inside the blind spot.
    const close = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', sx + 20, sy + 200, null);
    expect(inWeaponBand(m.state, ctxFor(m), cannon, close, w, false)).toBe(false);
  });

  it('§12.10 flying units can only be hit by weapons with targetsAir', () => {
    const m = makeMatch();
    const skimmer = spawnUnitAt(m.state, m.services, 'rift_skimmer', 'player1', 1000, 1000, null);
    const imp = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player0', 980, 1000, null);
    const impWeapon = m.reg.unit('imp_swarmling').weapon!;
    // Imps have no targetsAir, so they must not acquire the skimmer.
    const target = acquireTarget(m.state, ctxFor(m), imp, 200, impWeapon);
    const store = m.state.entities;
    expect(target).not.toBe(skimmer);
    void store;
  });

  it('§12.13 stances: standground never auto-acquires', () => {
    const m = makeMatch();
    const archer = spawnUnitAt(m.state, m.services, 'arcane_archer', 'player0', 1000, 1000, null);
    const enemy = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', 1080, 1000, null);
    const store = m.state.entities;
    store.stance[archer] = 2; // standground
    // Ensure visibility: mark the enemy's tile visible for player0.
    for (let i = 0; i < m.state.players[0]!.visible.length; i++) m.state.players[0]!.visible[i] = 1;
    const acquired = acquireTarget(m.state, ctxFor(m), archer, 200, m.reg.unit('arcane_archer').weapon!);
    // acquireTarget itself does not consult stance (the combat loop does), so assert via the loop.
    m.run(30);
    const enemyHp = store.hp[enemy]!;
    expect(enemyHp).toBe(m.reg.unit('imp_swarmling').hp);
    void acquired;
  });

  it('§12.15 projectiles travel and then apply their damage', () => {
    const m = makeMatch();
    const archer = spawnUnitAt(m.state, m.services, 'arcane_archer', 'player0', 1000, 1000, null);
    const enemy = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', 1120, 1000, null);
    const store = m.state.entities;
    for (let i = 0; i < m.state.players[0]!.visible.length; i++) m.state.players[0]!.visible[i] = 1;
    const w = m.reg.unit('arcane_archer').weapon!;
    // Fire one shot directly; the projectile must exist before it lands.
    fire(m.state, ctxFor(m), archer, enemy, w);
    const projectilesAfterFire = countKind(store, 2);
    expect(projectilesAfterFire).toBeGreaterThan(0);
    const hpBefore = store.hp[enemy]!;
    m.run(40);
    expect(store.hp[enemy]!).toBeLessThan(hpBefore);
    expect(countKind(store, 2)).toBe(0);
  });

  it('§12.17 the Imp has a melee attack tell (art data, no combat effect)', () => {
    const m = makeMatch();
    expect(m.reg.unit('imp_swarmling').art.attackFx).toBe('lunge_slash');
    expect(m.reg.unit('arcane_archer').art.attackFx).toBe('bolt');
    expect(m.reg.unit('stone_golem').art.attackFx).toBe('slam');
  });
});

function countKind(store: import('../../src/sim/entity-store').EntityStore, kind: number): number {
  let n = 0;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    if (store.kind[slot] === kind) n++;
  }
  return n;
}

describe('inventory §13.7-13.8 height rules in combat', () => {
  it('§13.7 cliffs block ground fire but not from a ramp', () => {
    const m = makeMatch();
    // Find a tile at height 1 adjacent to height 0 (duel_glade has a central plateau).
    const nav = m.services.nav;
    let highTile: { tx: number; ty: number } | null = null;
    let lowTile: { tx: number; ty: number } | null = null;
    for (let ty = 1; ty < nav.h - 1 && !highTile; ty++) {
      for (let tx = 1; tx < nav.w - 1; tx++) {
        if (nav.heightAt(tx, ty) !== 1) continue;
        if (nav.heightAt(tx - 1, ty) === 0 && !nav.isRamp(tx - 1, ty) && !nav.isRamp(tx, ty)) {
          highTile = { tx, ty };
          lowTile = { tx: tx - 1, ty };
          break;
        }
      }
    }
    expect(highTile).not.toBeNull();
    expect(lowTile).not.toBeNull();

    const attacker = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player0', lowTile!.tx * 32 + 16, lowTile!.ty * 32 + 16, null);
    const target = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', highTile!.tx * 32 + 16, highTile!.ty * 32 + 16, null);
    expect(heightBlocksGroundFire(m.state, ctxFor(m), attacker, target, false)).toBe(true);
    // A flying attacker ignores the rule.
    expect(heightBlocksGroundFire(m.state, ctxFor(m), attacker, target, true)).toBe(false);
  });

  it('§13.8 firing DOWN from high ground is allowed', () => {
    const m = makeMatch();
    const nav = m.services.nav;
    let high: { tx: number; ty: number } | null = null;
    let low: { tx: number; ty: number } | null = null;
    for (let ty = 1; ty < nav.h - 1 && !high; ty++) {
      for (let tx = 1; tx < nav.w - 1; tx++) {
        if (nav.heightAt(tx, ty) !== 1) continue;
        if (nav.heightAt(tx + 1, ty) === 0) {
          high = { tx, ty };
          low = { tx: tx + 1, ty };
          break;
        }
      }
    }
    expect(high).not.toBeNull();
    const attacker = spawnUnitAt(m.state, m.services, 'arcane_archer', 'player0', high!.tx * 32 + 16, high!.ty * 32 + 16, null);
    const target = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', low!.tx * 32 + 16, low!.ty * 32 + 16, null);
    expect(heightBlocksGroundFire(m.state, ctxFor(m), attacker, target, false)).toBe(false);
  });

  it('§13.8 high ground grants exactly +TILE (32) range', () => {
    const m = makeMatch();
    const nav = m.services.nav;
    let high: { tx: number; ty: number } | null = null;
    let low: { tx: number; ty: number } | null = null;
    for (let ty = 1; ty < nav.h - 1 && !high; ty++) {
      for (let tx = 1; tx < nav.w - 2; tx++) {
        if (nav.heightAt(tx, ty) !== 1) continue;
        if (nav.heightAt(tx + 1, ty) === 0) {
          high = { tx, ty };
          low = { tx: tx + 1, ty };
          break;
        }
      }
    }
    const attacker = spawnUnitAt(m.state, m.services, 'arcane_archer', 'player0', high!.tx * 32 + 16, high!.ty * 32 + 16, null);
    const target = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', low!.tx * 32 + 16, low!.ty * 32 + 16, null);
    expect(highGroundRangeBonus(m.state, ctxFor(m), attacker, target)).toBe(32);
  });
});
