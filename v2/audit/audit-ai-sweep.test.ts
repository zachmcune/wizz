// Phase-0: AI health sweep. How often does the v1 AI deadlock or fail to resolve?
import { it, describe } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import { ownedBy } from '../src/sim/queries';
import { getHarvester } from '../src/sim/capabilities';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

function cfg(seed: number, d0: string, d1: string): MatchConfig {
  return {
    mapId: 'duel_glade',
    seed,
    players: [
      { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, aiDifficulty: d0 as 'hard' },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: d1 as 'hard' },
    ],
  };
}

function harvesters(state: ReturnType<typeof initMatch>['state'], pid: string): number {
  return ownedBy(state, pid).filter((e) => e.kind === 'unit' && getHarvester(e)).length;
}

describe('v1 AI health sweep', () => {
  it('measures resolution rate, deadlock rate, and unit counts', () => {
    const MAX = 20 * 60 * 30;
    const rows: unknown[] = [];
    const pairs: [string, string][] = [
      ['hard', 'hard'],
      ['hard', 'normal'],
      ['normal', 'normal'],
      ['easy', 'easy'],
    ];
    for (const [d0, d1] of pairs) {
      for (const seed of [1, 2, 3, 4]) {
        const { state, services } = initMatch(reg, cfg(seed, d0, d1));
        const sim = createSimulation(state, services, { aiEnabled: true });
        let peakUnits = 0;
        let stallTick = -1;
        let manaFlatFrom = -1;
        let lastMana = state.players.map((p) => p.mana);
        let peakMana = 0;
        while (state.tick < MAX && !state.ended) {
          sim.step();
          if (state.tick % 100 === 0) {
            const u = [...state.entities.values()].filter((e) => e.kind === 'unit').length;
            if (u > peakUnits) peakUnits = u;
            peakMana = Math.max(peakMana, ...state.players.map((p) => p.mana));
            const manaNow = state.players.map((p) => Math.floor(p.mana));
            const flat = manaNow.every((m, i) => m === Math.floor(lastMana[i]!));
            if (flat && manaFlatFrom < 0 && state.tick > 20 * 60 * 2) manaFlatFrom = state.tick;
            if (!flat) manaFlatFrom = -1;
            if (manaFlatFrom >= 0 && state.tick - manaFlatFrom > 20 * 60 * 3 && stallTick < 0) stallTick = state.tick;
            lastMana = state.players.map((p) => p.mana);
          }
        }
        rows.push({
          d: `${d0}v${d1}`,
          seed,
          ended: state.ended,
          min: +(state.tick / 1200).toFixed(1),
          peakUnits,
          peakMana: Math.round(peakMana),
          h0: harvesters(state, 'player0'),
          h1: harvesters(state, 'player1'),
          mana0: Math.floor(state.players[0]!.mana),
          mana1: Math.floor(state.players[1]!.mana),
          stalled: stallTick > 0,
          winner: state.winnerTeam,
        });
      }
    }
    // eslint-disable-next-line no-console
    console.log('SWEEP ' + JSON.stringify(rows, null, 1));
    const resolved = rows.filter((r) => (r as { ended: boolean }).ended).length;
    const stalled = rows.filter((r) => (r as { stalled: boolean }).stalled).length;
    // eslint-disable-next-line no-console
    console.log('SUMMARY ' + JSON.stringify({ total: rows.length, resolved, stalled, peakUnitsMax: Math.max(...rows.map((r) => (r as { peakUnits: number }).peakUnits)) }));
  }, 900_000);
});
