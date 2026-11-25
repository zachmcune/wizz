// CONFORMANCE: command handling (inventory §10, §6, §7). Every command either applies or emits
// commandRejected — never silently ignored.

import { describe, expect, it } from 'vitest';
import { makeMatch } from './test-match';
import { TILE } from '../../src/core/constants';
import type { Command } from '../../src/sim/types';
import { stepSimulation } from '../../src/sim/step';
import { spawnBuildingAt, spawnUnitAt, applyBuildingNav } from '../../src/sim/systems/production';

function rejected(m: ReturnType<typeof makeMatch>, cmd: Command, ticks = 1): string[] {
  const reasons: string[] = [];
  const seen: unknown[] = [];
  m.run(ticks, { 0: [cmd] });
  // Events are not retained by TestMatch.run, so call step directly for command tests.
  void seen;
  return reasons;
}

/** Run one step with commands and return the emitted events. */
function stepOnce(m: ReturnType<typeof makeMatch>, cmds: Command[]) {
  return stepSimulation(m.state, m.services, cmds);
}

describe('inventory §10 commands', () => {
  it('§10.1 move sets a move order and the unit eventually arrives', () => {
    const m = makeMatch();
    const wisp = m.unitSlots('player0', 'wisp')[0]!;
    const store = m.state.entities;
    const startX = store.posX[wisp]!;
    const startY = store.posY[wisp]!;
    m.run(1, { 0: [{ type: 'move', playerId: 'player0', entityIds: [store.id[wisp]!], x: startX + 96, y: startY }] });
    expect(store.extras[wisp]!.orders[0]).toMatchObject({ type: 'move' });
    m.run(200);
    expect(Math.hypot(store.posX[wisp]! - (startX + 96), store.posY[wisp]! - startY)).toBeLessThan(TILE);
  });

  it('§10.8 stop clears orders and zeroes velocity', () => {
    const m = makeMatch();
    const wisp = m.unitSlots('player0', 'wisp')[0]!;
    const store = m.state.entities;
    const id = store.id[wisp]!;
    stepOnce(m, [{ type: 'move', playerId: 'player0', entityIds: [id], x: 2000, y: 2000 }]);
    m.run(10);
    stepOnce(m, [{ type: 'stop', playerId: 'player0', entityIds: [id] }]);
    expect(store.extras[wisp]!.orders).toHaveLength(0);
    expect(store.velX[wisp]).toBe(0);
    expect(store.velY[wisp]).toBe(0);
  });

  it('§10.8 setStance changes the stance code', () => {
    const m = makeMatch();
    const wisp = m.unitSlots('player0', 'wisp')[0]!;
    const id = m.state.entities.id[wisp]!;
    stepOnce(m, [{ type: 'setStance', playerId: 'player0', entityIds: [id], stance: 'hold' }]);
    expect(m.state.entities.stance[wisp]).toBe(1);
    stepOnce(m, [{ type: 'setStance', playerId: 'player0', entityIds: [id], stance: 'standground' }]);
    expect(m.state.entities.stance[wisp]).toBe(2);
  });

  it('§6.1 build places a building, charges mana, and starts at 10% HP', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const manaBefore = m.state.players[0]!.mana;
    const res = stepOnce(m, [{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: sx + 128, y: sy + 64 }]);
    expect(res.events.some((e) => e.type === 'buildingPlaced')).toBe(true);
    expect(m.state.players[0]!.mana).toBe(manaBefore - 750);
    const spire = m.buildingSlots('player0', 'attunement_spire')[0]!;
    expect(spire).toBeGreaterThanOrEqual(0);
    // Under construction at ~10% HP.
    const hpFrac = m.state.entities.hp[spire]! / m.state.entities.maxHp[spire]!;
    expect(hpFrac).toBeLessThan(0.2);
  });

  it('§6.1 build is rejected without enough mana', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    m.state.players[0]!.mana = 10;
    const res = stepOnce(m, [{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: sx + 128, y: sy + 64 }]);
    expect(res.events.some((e) => e.type === 'commandRejected' && e.reason === 'mana')).toBe(true);
  });

  it('§6.1 build is rejected outside the build zone', () => {
    const m = makeMatch();
    const res = stepOnce(m, [{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 2000, y: 2000 }]);
    expect(res.events.some((e) => e.type === 'commandRejected' && e.reason === 'range')).toBe(true);
  });

  it('§6.1 build is rejected without the required tech', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    m.state.players[0]!.mana = 99999;
    // golem_forge requires ley_conduit, which the player does not have.
    const res = stepOnce(m, [{ type: 'build', playerId: 'player0', defId: 'golem_forge', x: sx + 128, y: sy + 64 }]);
    expect(res.events.some((e) => e.type === 'commandRejected' && e.reason === 'requires')).toBe(true);
  });

  it('§6.1 one superweapon per player is enforced', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    m.state.players[0]!.mana = 99999;
    m.state.players[0]!.unlockedTech.push('arcane_nexus');
    spawnBuildingAt(m.state, m.services, 'astral_spire', 'player0', sx + 160, sy + 96, { complete: true }, null);
    const res = stepOnce(m, [{ type: 'build', playerId: 'player0', defId: 'astral_spire', x: sx - 160, y: sy + 96 }]);
    expect(res.events.some((e) => e.type === 'commandRejected' && e.reason === 'limit')).toBe(true);
  });

  it('§6.2 producing a wisp charges mana and completes after buildTime', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const spire = spawnBuildingAt(m.state, m.services, 'attunement_spire', 'player0', sx + 128, sy + 64, { complete: true }, null);
    applyBuildingNav(m.state, m.services, spire);
    m.state.players[0]!.mana = 1000;
    m.state.players[0]!.unlockedTech.push('attunement_spire');
    const wispsBefore = m.unitSlots('player0', 'wisp').length;
    const res = stepOnce(m, [{ type: 'produce', playerId: 'player0', buildingId: m.state.entities.id[spire]!, defId: 'wisp' }]);
    expect(res.events.some((e) => e.type === 'manaChanged')).toBe(true);
    expect(m.state.players[0]!.mana).toBe(800);
    // wisp buildTime is 5 s = 100 ticks; give a margin for the queue starting next tick.
    m.run(110);
    expect(m.unitSlots('player0', 'wisp').length).toBe(wispsBefore + 1);
  });

  it('§4.13 cancelling a queued unit refunds its full cost', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const spire = spawnBuildingAt(m.state, m.services, 'attunement_spire', 'player0', sx + 128, sy + 64, { complete: true }, null);
    applyBuildingNav(m.state, m.services, spire);
    m.state.players[0]!.mana = 1000;
    m.state.players[0]!.unlockedTech.push('attunement_spire');
    const id = m.state.entities.id[spire]!;
    stepOnce(m, [{ type: 'produce', playerId: 'player0', buildingId: id, defId: 'wisp' }]);
    expect(m.state.players[0]!.mana).toBe(800);
    stepOnce(m, [{ type: 'cancelProduce', playerId: 'player0', buildingId: id, index: 0 }]);
    expect(m.state.players[0]!.mana).toBe(1000);
  });

  it('§10.9 setRally makes produced units walk to the rally point', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const spire = spawnBuildingAt(m.state, m.services, 'attunement_spire', 'player0', sx + 128, sy + 64, { complete: true }, null);
    applyBuildingNav(m.state, m.services, spire);
    m.state.players[0]!.mana = 1000;
    m.state.players[0]!.unlockedTech.push('attunement_spire');
    const id = m.state.entities.id[spire]!;
    stepOnce(m, [{ type: 'setRally', playerId: 'player0', buildingId: id, x: sx + 300, y: sy + 64 }]);
    stepOnce(m, [{ type: 'produce', playerId: 'player0', buildingId: id, defId: 'wisp' }]);
    m.run(110);
    const wisps = m.unitSlots('player0', 'wisp');
    const newest = wisps[wisps.length - 1]!;
    expect(m.state.entities.extras[newest]!.orders.length).toBeGreaterThan(0);
  });

  it('§4.5 harvest order is rejected for non-harvesters', () => {
    const m = makeMatch();
    const archer = (() => {
        return spawnUnitAt(m.state, m.services, 'arcane_archer', 'player0', 900, 900, null);
    })();
    const node = m.nodeSlots()[0]!;
    m.run(1, { 0: [{ type: 'harvest', playerId: 'player0', entityIds: [m.state.entities.id[archer]!], nodeId: m.state.entities.id[node]! }] });
    // No harvest order should have been attached.
    expect(m.state.entities.extras[archer]!.orders).toHaveLength(0);
  });

  it('§1.17 surrender marks the player defeated', () => {
    const m = makeMatch();
    const res = stepOnce(m, [{ type: 'surrender', playerId: 'player0' }]);
    expect(res.events.some((e) => e.type === 'playerDefeated' && e.playerId === 'player0')).toBe(true);
    expect(m.state.players[0]!.defeated).toBe(true);
  });

  it('§1.18 the match ends when one team has no HQ left', () => {
    const m = makeMatch();
    const sanctum1 = m.buildingSlots('player1', 'sanctum')[0]!;
    m.state.entities.kill(sanctum1);
    m.run(3);
    expect(m.state.ended).toBe(true);
    expect(m.state.winnerTeam).toBe(0);
  });

  it('rejects commands from unknown players without mutating state', () => {
    const m = makeMatch();
    const before = m.state.entities.liveCount();
    stepOnce(m, [{ type: 'surrender', playerId: 'nobody' }]);
    expect(m.state.entities.liveCount()).toBe(before);
  });

  it('rejects dev-scale commands on unowned units', () => {
    const m = makeMatch();
    const enemy = m.unitSlots('player1', 'wisp')[0]!;
    const startX = m.state.entities.posX[enemy]!;
    m.run(1, { 0: [{ type: 'move', playerId: 'player0', entityIds: [m.state.entities.id[enemy]!], x: 0, y: 0 }] });
    expect(m.state.entities.posX[enemy]).toBe(startX);
    expect(m.state.entities.extras[enemy]!.orders).toHaveLength(0);
  });

  it('faction-restricted units cannot be produced by the wrong faction', () => {
    const m = makeMatch();
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const circle = spawnBuildingAt(m.state, m.services, 'summoning_circle', 'player0', sx + 128, sy + 64, { complete: true }, null);
    applyBuildingNav(m.state, m.services, circle);
    m.state.players[0]!.mana = 5000;
    m.state.players[0]!.unlockedTech.push('summoning_circle');
    // player0 is Arcane; thornling is Verdant-only.
    const res = stepOnce(m, [{ type: 'produce', playerId: 'player0', buildingId: m.state.entities.id[circle]!, defId: 'thornling' }]);
    expect(res.events.some((e) => e.type === 'commandRejected' && e.reason === 'faction')).toBe(true);
  });
});

export { rejected };
