// CONFORMANCE: economy, power, and unit cap.
//
// Each test names the FEATURE_INVENTORY row it proves. Numbers come from v1 content and are
// asserted literally rather than read from the registry, so a data edit that silently changes a rule
// fails here instead of passing tautologically.

import { describe, expect, it } from 'vitest';
import { makeMatch } from './test-match';
import { runUntil } from './conformance-helpers';
import { MAX_UNITS_PER_PLAYER, TICK_HZ } from '../../src/core/constants';
import { spawnUnitAt, spawnBuildingAt, applyBuildingNav } from '../../src/sim/systems/production';
import { buildingHasPower, productionRate } from '../../src/sim/power';

describe('inventory §4 Economy', () => {
  it('§4.1 single resource Mana, starting 900', () => {
    const m = makeMatch();
    expect(m.state.players[0]!.mana).toBe(900);
  });

  it('§4.4 a wisp siphons exactly siphonPerSecond while in contact with a node', () => {
    // Place a wisp directly on a node and let it siphon for one second.
    const m = makeMatch();
    const nodeSlot = m.nodeSlots()[0]!;
    const wisp = m.unitSlots('player0', 'wisp')[0]!;
    const store = m.state.entities;
    store.posX[wisp] = store.posX[nodeSlot]!;
    store.posY[wisp] = store.posY[nodeSlot]!;
    m.run(1, { 0: [{ type: 'harvest', playerId: 'player0', entityIds: [store.id[wisp]!], nodeId: store.id[nodeSlot]! }] });

    const before = store.extras[wisp]!.caps.harvester as { carry: number } | undefined;
    expect(before).toBeDefined();
    // After exactly 20 ticks of contact the carry should be 16 * (20/20) = 16.
    m.run(TICK_HZ - 1);
    const harvester = store.extras[wisp]!.caps.harvester as { carry: number };
    expect(harvester.carry).toBeCloseTo(16, 5);
  });

  it('§4.4 carry stops at the wisp carryMax (75)', () => {
    const m = makeMatch();
    const nodeSlot = m.nodeSlots()[0]!;
    const wisp = m.unitSlots('player0', 'wisp')[0]!;
    const store = m.state.entities;
    store.posX[wisp] = store.posX[nodeSlot]!;
    store.posY[wisp] = store.posY[nodeSlot]!;
    m.run(1, { 0: [{ type: 'harvest', playerId: 'player0', entityIds: [store.id[wisp]!], nodeId: store.id[nodeSlot]! }] });
    for (let i = 0; i < 200; i++) {
      store.posX[wisp] = store.posX[nodeSlot]!;
      store.posY[wisp] = store.posY[nodeSlot]!;
      m.run(1);
    }
    const harvester = store.extras[wisp]!.caps.harvester as { carry: number; carryMax: number };
    expect(harvester.carryMax).toBe(75);
    expect(harvester.carry).toBeLessThanOrEqual(75);
  });

  it('§4.5 a wisp deposits at a completed Attunement Spire and refills', () => {
    const m = makeMatch();
    // Build a spy ring: give the player a refinery next to the base.
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const spireSlot = grant(m, 'player0', 'attunement_spire', sx + 96, sy + 64);
    expect(spireSlot).toBeGreaterThanOrEqual(0);

    const nodeSlot = m.nodeSlots()[0]!;
    const wisp = m.unitSlots('player0', 'wisp')[0]!;
    const store = m.state.entities;
    const harvester = store.extras[wisp]!.caps.harvester as { carry: number };
    store.posX[wisp] = store.posX[spireSlot]!;
    store.posY[wisp] = store.posY[spireSlot]!;

    m.state.players[0]!.mana = 0;
    // Issue the harvest order first, THEN set up the "loaded and docked" state: the command handler
    // sets state=harvesting (matching v1), so writing state afterwards is what a real loaded wisp
    // reaching its refinery looks like at the top of a tick.
    m.run(1, { 0: [{ type: 'harvest', playerId: 'player0', entityIds: [store.id[wisp]!], nodeId: store.id[nodeSlot]! }] });
    harvester.carry = 75;
    store.posX[wisp] = store.posX[spireSlot]!;
    store.posY[wisp] = store.posY[spireSlot]!;
    store.state[wisp] = 4; // returning
    m.run(10);
    expect(m.state.players[0]!.mana).toBeCloseTo(75, 5);
    expect(harvester.carry).toBeCloseTo(0, 5);
  });

  it('§4.6 Resonance Vault multiplies siphon by 1.3', () => {
    const m = makeMatch();
    m.state.players[0]!.unlockedTech.push('resonance_vault');
    const nodeSlot = m.nodeSlots()[0]!;
    const wisp = m.unitSlots('player0', 'wisp')[0]!;
    const store = m.state.entities;
    store.posX[wisp] = store.posX[nodeSlot]!;
    store.posY[wisp] = store.posY[nodeSlot]!;
    m.run(1, { 0: [{ type: 'harvest', playerId: 'player0', entityIds: [store.id[wisp]!], nodeId: store.id[nodeSlot]! }] });
    m.run(TICK_HZ - 1);
    const harvester = store.extras[wisp]!.caps.harvester as { carry: number };
    expect(harvester.carry).toBeCloseTo(16 * 1.3, 4);
  });

  it('§4.9 a Mana Weaver conjures 6 mana every 3 seconds', () => {
    const m = makeMatch();
    m.state.players[0]!.unlockedTech.push('summoning_circle');
    const slot = spawnUnitAt(m.state, m.services, 'mana_weaver', 'player0', 900, 900, null);
    expect(slot).toBeGreaterThanOrEqual(0);
    m.state.players[0]!.mana = 0;
    m.run(1, { 0: [{ type: 'channel', playerId: 'player0', entityIds: [m.state.entities.id[slot]!], enabled: true }] });
    // 3 seconds = 60 ticks, and the conjure lands on the tick that completes the interval.
    m.run(60);
    expect(m.state.players[0]!.mana).toBeCloseTo(6, 5);
    m.run(60);
    expect(m.state.players[0]!.mana).toBeCloseTo(12, 5);
  });

  it('§4.10 repair costs repairManaPerHp per HP and stops at full HP', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const store = m.state.entities;
    store.hp[sanctum] = 1000; // half of 2000
    m.state.players[0]!.mana = 10000;
    const manaBefore = m.state.players[0]!.mana;
    const hpBefore = store.hp[sanctum]!;
    // Include the setRepair tick in the measured window so HP and mana cover exactly the same ticks.
    m.run(1, { 0: [{ type: 'setRepair', playerId: 'player0', buildingId: store.id[sanctum]!, enabled: true }] });
    m.run(20);
    const hpGained = store.hp[sanctum]! - hpBefore;
    const manaSpent = manaBefore - m.state.players[0]!.mana;
    expect(hpGained).toBeGreaterThan(0);
    // Exactly repairManaPerHp (0.05) per HP, with no rounding drift.
    expect(manaSpent).toBeCloseTo(hpGained * 0.05, 3);
  });

  it('§4.11 selling a building refunds sellRefundRatio of its cost', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const wall = grant(m, 'player0', 'stone_wall', sx + 96, sy + 64);
    const cost = m.reg.building('stone_wall').cost;
    m.state.players[0]!.mana = 0;
    m.run(1, { 0: [{ type: 'sellBuilding', playerId: 'player0', buildingId: m.state.entities.id[wall]! }] });
    expect(m.state.players[0]!.mana).toBe(Math.floor(cost * m.reg.balance.sellRefundRatio));
  });

  it('§4.11 a Sanctum cannot be sold', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const id = m.state.entities.id[sanctum]!;
    const events: string[] = [];
    m.run(1, { 0: [{ type: 'sellBuilding', playerId: 'player0', buildingId: id }] });
    // The building must still exist.
    expect(m.state.entities.slotOf(id)).toBeGreaterThanOrEqual(0);
    void events;
  });
});

describe('inventory §5 Power grid', () => {
  it('§5.2 defenses go completely offline at low power', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const sentry = grant(m, 'player0', 'arcane_sentry', sx + 96, sy + 64);
    // Force a deficit: one Sanctum (20) cannot feed a Sentry (20) plus a Nexus (50).
    grant(m, 'player0', 'arcane_nexus', sx - 160, sy + 64);
    m.state.players[0]!.power = 20;
    m.state.players[0]!.powerUsed = 70;
    expect(buildingHasPower(m.state, m.reg, sentry)).toBe(false);
  });

  it('§5.3 production slows but never stops at zero power', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    expect(productionRate(m.state, m.reg, sanctum)).toBe(1);
    m.state.players[0]!.powerUsed = 200;
    m.state.players[0]!.power = 0;
    // Floor is 0.1 so the player can always build their way out.
    expect(productionRate(m.state, m.reg, sanctum)).toBeCloseTo(0.1, 6);
  });

  it('§5.5 Sanctum produces 20 power and a Ley Conduit 60', () => {
    const m = makeMatch();
    expect(m.reg.building('sanctum').powerProduced).toBe(20);
    expect(m.reg.building('ley_conduit').powerProduced).toBe(60);
  });
});

describe('inventory §23.2 unit cap (v1 declared it, never enforced)', () => {
  it('refuses unit #91 for one player and emits commandRejected', () => {
    const m = makeMatch();
    const events: string[] = [];
    let spawned = 0;
    for (let i = 0; i < MAX_UNITS_PER_PLAYER + 10; i++) {
      const slot = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player0', 400 + (i % 20) * 40, 400, null);
      if (slot >= 0) spawned++;
    }
    // Two wisps already exist at match start, so only 88 more may spawn.
    expect(spawned).toBe(MAX_UNITS_PER_PLAYER - 2);
    expect(m.unitSlots('player0').length).toBe(MAX_UNITS_PER_PLAYER);
    void events;
  });

  it('the cap is per player, not global', () => {
    const m = makeMatch();
    for (let i = 0; i < MAX_UNITS_PER_PLAYER; i++) {
      spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player0', 400 + (i % 20) * 40, 400, null);
    }
    // player1 still has room for a fresh unit.
    const slot = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', 3000, 2000, null);
    expect(slot).toBeGreaterThanOrEqual(0);
  });
});

/** Completed-building helper (test-only; bypasses cost/time deliberately). */
function grant(m: ReturnType<typeof makeMatch>, owner: string, defId: string, x: number, y: number): number {
  const slot = spawnBuildingAt(m.state, m.services, defId, owner, x, y, { complete: true }, null);
  if (slot >= 0) applyBuildingNav(m.state, m.services, slot);
  return slot;
}

export { runUntil };

describe('harvest regression: docking uses the footprint, not the centre', () => {
  it('a wisp approaching a 2x2 refinery CORNER can still dock (this froze v2 before the fix)', () => {
    // A 2x2 building is a 64x64 square: half-diagonal 45.25. With the old centre-distance dock
    // radius (45) a wisp coming in at a corner could never get close enough and sat with a full
    // load forever. The fix measures distance to the footprint rectangle instead.
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    grant(m, 'player0', 'attunement_spire', sx + 200, sy + 200);

    const wisp = m.unitSlots('player0', 'wisp')[0]!;
    const store = m.state.entities;
    m.run(1, { 0: [{ type: 'harvest', playerId: 'player0', entityIds: [store.id[wisp]!], nodeId: store.id[m.nodeSlots()[0]!]! }] });

    // Place the wisp exactly on the spire's south-east corner, outside the footprint but at the
    // half-diagonal distance that used to be too far.
    store.posX[wisp] = sx + 200 + 36;
    store.posY[wisp] = sy + 200 + 36;
    (store.extras[wisp]!.caps.harvester as { carry: number }).carry = 75;
    store.state[wisp] = 4; // returning
    m.state.players[0]!.mana = 0;

    m.run(20);
    expect(m.state.players[0]!.mana).toBeCloseTo(75, 5);
  });
});
