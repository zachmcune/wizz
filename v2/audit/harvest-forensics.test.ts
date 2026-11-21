// Phase-0 follow-up: is the effective harvest rate (measured ~3.75 mana/s vs the
// configured `siphonPerSecond: 16`) a BUG or intended design (travel overhead)?
// Instruments the wisp's per-tick state so the answer is arithmetic, not opinion.
import { describe, it } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import { ownedBy } from '../src/sim/queries';
import { getHarvester } from '../src/sim/capabilities';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

describe('harvest cycle forensics', () => {
  it('splits the cycle into siphon / return / approach time', () => {
    const cfg: MatchConfig = {
      mapId: 'duel_glade',
      seed: 1,
      players: [
        { id: 'p0', controller: 'human', team: 0, color: '#4f9dff', startIndex: 0 },
        { id: 'p1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: 'easy' },
      ],
    };
    const { state, services } = initMatch(reg, cfg);
    const sim = createSimulation(state, services, { aiEnabled: false });
    const p = state.players[0]!;
    p.mana = 0;

    const sanctum = ownedBy(state, 'p0').find((e) => e.kind === 'building')!;
    // Put the spire on flat ground near the HQ, mirroring how a player builds.
    const spire = spawnEntity(state, services, null, 'attunement_spire', 'p0', sanctum.pos.x + 128, sanctum.pos.y + 64);
    if (spire.kind === 'building') spire.buildProgress = undefined;

    const node = [...state.entities.values()]
      .filter((e) => e.kind === 'resource_node' && e.amount > 0)
      .sort((a, b) => Math.hypot(a.pos.x - spire.pos.x, a.pos.y - spire.pos.y) - Math.hypot(b.pos.x - spire.pos.x, b.pos.y - spire.pos.y))[0]!;

    const wisps = ownedBy(state, 'p0').filter((e) => e.kind === 'unit' && e.defId === 'wisp');
    // Park the spare wisp far away so only one harvests.
    if (wisps[1]) sim.enqueueNow([{ type: 'move', playerId: 'p0', entityIds: [wisps[1].id], x: 100, y: 100 }]);
    const w = wisps[0]!;
    sim.enqueueNow([{ type: 'harvest', playerId: 'p0', entityIds: [w.id], nodeId: node.id }]);

    // Sample every tick for 120 s.
    const samples: { tick: number; state: string; carry: number; dNode: number; dSpire: number }[] = [];
    for (let i = 0; i < 20 * 120; i++) {
      sim.step();
      samples.push({
        tick: state.tick,
        state: (w as { state: string }).state,
        carry: getHarvester(w)?.carry ?? 0,
        dNode: Math.hypot(w.pos.x - node.pos.x, w.pos.y - node.pos.y),
        dSpire: Math.hypot(w.pos.x - spire.pos.x, w.pos.y - spire.pos.y),
      });
    }

    // Classify: "siphoning" = carry increased this tick; "returning" = state==='returning';
    // otherwise "approaching".
    let siphonTicks = 0;
    let returnTicks = 0;
    let approachTicks = 0;
    let deposits = 0;
    let prevCarry = 0;
    let prevMana = 0;
    for (const s of samples) {
      if (s.carry > prevCarry + 1e-9) siphonTicks++;
      else if (s.state === 'returning') returnTicks++;
      else approachTicks++;
      prevCarry = s.carry;
      const manaNow = Math.floor(p.mana);
      if (manaNow > prevMana) deposits++;
      prevMana = manaNow;
    }
    const totalTicks = samples.length;
    const minutes = totalTicks / 20 / 60;
    const out = {
      configuredSiphonPerSecond: reg.balance.siphonPerSecond,
      wispSpeed: reg.units.get('wisp')!.speed,
      carryMax: reg.units.get('wisp')!.carry,
      spireToNodeDist: +Math.hypot(node.pos.x - spire.pos.x, node.pos.y - spire.pos.y).toFixed(1),
      totalDeposits: deposits,
      totalMana: Math.floor(p.mana),
      manaPerSec: +(p.mana / (minutes * 60)).toFixed(3),
      theoreticalSiphonOnlySec: +((reg.units.get('wisp')!.carry ?? 0) / reg.balance.siphonPerSecond).toFixed(2),
      measuredSiphonSeconds: +(siphonTicks / 20).toFixed(2),
      measuredReturnSeconds: +(returnTicks / 20).toFixed(2),
      measuredApproachSeconds: +(approachTicks / 20).toFixed(2),
      cycleSeconds: deposits > 0 ? +(minutes * 60 / deposits).toFixed(2) : null,
      theoreticalCycleSeconds:
        deposits > 0
          ? +(
              (reg.units.get('wisp')!.carry ?? 0) / reg.balance.siphonPerSecond +
              (2 * Math.hypot(node.pos.x - spire.pos.x, node.pos.y - spire.pos.y)) / (reg.units.get('wisp')!.speed ?? 1)
            ).toFixed(2)
          : null,
    };
    // eslint-disable-next-line no-console
    console.log('HARVEST ' + JSON.stringify(out, null, 1));
  }, 300_000);
});
