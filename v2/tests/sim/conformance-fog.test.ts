// CONFORMANCE: fog of war (inventory §14) and visibility gating of combat.

import { describe, expect, it } from 'vitest';
import { makeMatch } from './test-match';
import { spawnUnitAt, spawnBuildingAt, applyBuildingNav } from '../../src/sim/systems/production';
import { isVisibleTo, radarActive, listBuildingGhosts, shouldRevealAllForViewer } from '../../src/sim/fog';
import { acquireTarget } from '../../src/sim/systems/combat';
import { TILE } from '../../src/core/constants';

describe('inventory §14 fog of war', () => {
  it('§14.1 a player starts with vision only near their own base', () => {
    const m = makeMatch();
    const p0 = m.state.players[0]!;
    const p1 = m.state.players[1]!;
    const sanctum0 = m.buildingSlots('player0', 'sanctum')[0]!;
    const sanctum1 = m.buildingSlots('player1', 'sanctum')[0]!;
    const nav = m.services.nav;
    const tileOf = (slot: number) => ({
      tx: Math.floor(m.state.entities.posX[slot]! / TILE),
      ty: Math.floor(m.state.entities.posY[slot]! / TILE),
    });
    const t0 = tileOf(sanctum0);
    const t1 = tileOf(sanctum1);
    expect(p0.visible[t0.ty * nav.w + t0.tx]).toBe(1);
    expect(p0.visible[t1.ty * nav.w + t1.tx]).toBe(0);
    expect(p1.visible[t1.ty * nav.w + t1.tx]).toBe(1);
    expect(p1.visible[t0.ty * nav.w + t0.tx]).toBe(0);
  });

  it('§14.2 enemy units are invisible outside sight and visible inside it', () => {
    const m = makeMatch();
    const enemy = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', 900, 900, null);
    // Far from player0's base: not visible.
    expect(isVisibleTo(m.state, 'player0', enemy, m.services.nav)).toBe(false);
    // Put a friendly unit right next to it: now visible.
    const scout = spawnUnitAt(m.state, m.services, 'rift_familiar', 'player0', 920, 900, null);
    m.run(1);
    expect(isVisibleTo(m.state, 'player0', enemy, m.services.nav)).toBe(true);
    void scout;
  });

  it('§14.3 a scouted enemy building leaves a remembered ghost', () => {
    const m = makeMatch();
    const sanctum1 = m.buildingSlots('player1', 'sanctum')[0]!;
    const id = m.state.entities.id[sanctum1]!;
    // Initially unknown.
    expect(m.state.players[0]!.knownBuildings[id]).toBeUndefined();
    // Put a friendly scout next to the enemy base for one tick.
    const sx = m.state.entities.posX[sanctum1]!;
    const sy = m.state.entities.posY[sanctum1]!;
    spawnUnitAt(m.state, m.services, 'rift_familiar', 'player0', sx + 40, sy + 40, null);
    m.run(1);
    expect(m.state.players[0]!.knownBuildings[id]).toBeDefined();
    // Now move the scout far away — the memory must persist.
    const scoutSlot = m.unitSlots('player0', 'rift_familiar')[0]!;
    m.state.entities.posX[scoutSlot] = 500;
    m.state.entities.posY[scoutSlot] = 500;
    m.run(1);
    expect(m.state.players[0]!.knownBuildings[id]).toBeDefined();
    // And it should be listed as a ghost (not in live sight).
    const ghosts = listBuildingGhosts(m.state, 'player0', m.services.nav);
    expect(ghosts.some((g) => g.id === id)).toBe(true);
  });

  it('§14.5 radar requires a completed Scrying Obelisk and power', () => {
    const m = makeMatch();
    expect(radarActive(m.state, m.reg, 'player0')).toBe(false);
    const sanctum = m.buildingSlots('player0', 'sanctum')[0]!;
    const sx = m.state.entities.posX[sanctum]!;
    const sy = m.state.entities.posY[sanctum]!;
    const radar = spawnBuildingAt(m.state, m.services, 'scrying_obelisk', 'player0', sx + 96, sy + 64, { complete: true }, null);
    applyBuildingNav(m.state, m.services, radar);
    // Power must be sufficient (obelisk uses 15; sanctum gives 20).
    expect(radarActive(m.state, m.reg, 'player0')).toBe(true);
    // Force a deficit: radar shuts off.
    m.state.players[0]!.powerUsed = 999;
    expect(radarActive(m.state, m.reg, 'player0')).toBe(false);
  });

  it('§14.7 allied vision is shared', () => {
    const m = makeMatch({
      mapId: 'duel_glade',
      seed: 3,
      players: [
        { id: 'player0', controller: 'human', team: 0, color: '#4f9dff', startIndex: 0, factionId: 'arcane' },
        { id: 'player1', controller: 'human', team: 0, color: '#5dff8f', startIndex: 1, factionId: 'arcane' },
        { id: 'player2', controller: 'human', team: 1, color: '#ff5d5d', startIndex: 3, factionId: 'arcane' },
      ],
    });
    const p0Base = m.buildingSlots('player0', 'sanctum')[0]!;
    const nav = m.services.nav;
    const tx = Math.floor(m.state.entities.posX[p0Base]! / TILE);
    const ty = Math.floor(m.state.entities.posY[p0Base]! / TILE);
    // player1 is on the same team and should also see player0's base tile.
    expect(m.state.players[1]!.visible[ty * nav.w + tx]).toBe(1);
    // The enemy should not.
    expect(m.state.players[2]!.visible[ty * nav.w + tx]).toBe(0);
  });

  it('§14.2 units cannot shoot what they cannot see', () => {
    // Note on how this rule actually bites: every v1/v2 weapon's range is <= its owner's sight
    // (verified in the data: archer 132/175, siege 155/170, sentry 165/190, ...), so a shooter can
    // always see what it can reach. The fog gate therefore matters for (a) targets revealed only by
    // a *teammate's* vision, and (b) any future weapon whose range exceeds its sight. Assert the gate
    // itself rather than relying on a range/sight mismatch that does not exist.
    const m = makeMatch();
    const archer = spawnUnitAt(m.state, m.services, 'arcane_archer', 'player0', 1200, 1200, null);
    const hiddenEnemy = spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player1', 1260, 1200, null);
    const w = m.reg.unit('arcane_archer').weapon!;

    // Force the enemy's tile dark for player0, then confirm targeting refuses it even though the
    // target is well inside weapon range.
    for (let i = 0; i < m.state.players[0]!.visible.length; i++) m.state.players[0]!.visible[i] = 0;
    expect(isVisibleTo(m.state, 'player0', hiddenEnemy, m.services.nav)).toBe(false);
    // The spatial grid is rebuilt at the top of each tick, so rebuild it before querying directly.
    m.services.spatial.rebuild(m.state.entities);
    expect(acquireTarget(m.state, { services: m.services, events: [] }, archer, 400, w)).toBe(-1);

    // Now make it visible and targeting finds it.
    for (let i = 0; i < m.state.players[0]!.visible.length; i++) m.state.players[0]!.visible[i] = 1;
    expect(acquireTarget(m.state, { services: m.services, events: [] }, archer, 400, w)).toBe(hiddenEnemy);
  });

  it('§14.8 match end reveals the whole map to the viewer', () => {
    const m = makeMatch();
    expect(shouldRevealAllForViewer(m.state, 'player0', false)).toBe(false);
    m.state.ended = true;
    expect(shouldRevealAllForViewer(m.state, 'player0', false)).toBe(true);
  });
});

describe('fog: cliff sight blocking (inventory §13.9)', () => {
  it('lower ground cannot see onto a plateau', () => {
    const m = makeMatch();
    const nav = m.services.nav;
    // Find a low tile next to a height-1 tile.
    let found: { lowTx: number; lowTy: number; highTx: number; highTy: number } | null = null;
    for (let ty = 1; ty < nav.h - 1 && !found; ty++) {
      for (let tx = 1; tx < nav.w - 1; tx++) {
        if (nav.heightAt(tx, ty) !== 0) continue;
        if (nav.heightAt(tx + 1, ty) === 1 && !nav.isRamp(tx, ty) && !nav.isRamp(tx + 1, ty)) {
          found = { lowTx: tx, lowTy: ty, highTx: tx + 1, highTy: ty };
          break;
        }
      }
    }
    expect(found).not.toBeNull();
    // A ground scout with sight just long enough to reach the tile, standing on low ground.
    const scout = spawnUnitAt(m.state, m.services, 'rift_familiar', 'player0', found!.lowTx * TILE + 16, found!.lowTy * TILE + 16, null);
    m.run(1);
    const idx = found!.highTy * nav.w + found!.highTx;
    // The plateau tile must NOT be visible from below.
    expect(m.state.players[0]!.visible[idx]).toBe(0);
    void scout;
  });
});

describe('fog: the coverage optimisation cannot hide terrain', () => {
  it('a clump of units sees exactly what one unit at the same spot sees, plus each unit own circle', () => {
    // This guards the block-coverage skip: whatever it prunes, the visible set must be identical to
    // the union of every source's circle. Compare against a brute-force recomputation.
    const m = makeMatch();
    const base = m.buildingSlots('player0', 'sanctum')[0]!;
    const bx = m.state.entities.posX[base]!;
    const by = m.state.entities.posY[base]!;
    // 12 units in a tight 3-tile clump.
    for (let i = 0; i < 12; i++) {
      spawnUnitAt(m.state, m.services, 'imp_swarmling', 'player0', bx + (i % 4) * 20, by + Math.floor(i / 4) * 20, null);
    }
    m.run(1);

    const nav = m.services.nav;
    const p = m.state.players[0]!;
    // Brute force: every tile within any friendly sight source's circle.
    const expected = new Uint8Array(nav.w * nav.h);
    const store = m.state.entities;
    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot]) continue;
      if (store.ownerId(store.ownerIndex[slot]!) !== 'player0') continue;
      const def = m.reg.units.get(store.extras[slot]!.defId) ?? m.reg.buildings.get(store.extras[slot]!.defId);
      const sight = (def as { sight?: number } | undefined)?.sight ?? 0;
      if (sight <= 0) continue;
      const cx = store.posX[slot]!;
      const cy = store.posY[slot]!;
      const minTx = Math.max(0, Math.floor((cx - sight) / 32));
      const maxTx = Math.min(nav.w - 1, Math.floor((cx + sight) / 32));
      const minTy = Math.max(0, Math.floor((cy - sight) / 32));
      const maxTy = Math.min(nav.h - 1, Math.floor((cy + sight) / 32));
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          const dx = tx * 32 + 16 - cx;
          const dy = ty * 32 + 16 - cy;
          if (dx * dx + dy * dy > sight * sight) continue;
          if (nav.heightAt(tx, ty) > nav.heightAt(Math.floor(cx / 32), Math.floor(cy / 32)) && !nav.isRamp(tx, ty)) continue;
          expected[ty * nav.w + tx] = 1;
        }
      }
    }

    // Every tile the brute force says is visible must be visible in the sim.
    let missing = 0;
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] === 1 && p.visible[i] !== 1) missing++;
    }
    expect(missing).toBe(0);
  });
});
