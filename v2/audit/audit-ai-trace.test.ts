// Phase-0 AI diagnostics: what does the v1 AI actually do over a match?
import { it, describe } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import { ownedBy, buildingsOf } from '../src/sim/queries';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

function cfg(seed: number, d: 'easy' | 'normal' | 'hard' = 'hard'): MatchConfig {
  return {
    mapId: 'duel_glade',
    seed,
    players: [
      { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, aiDifficulty: d },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: d },
    ],
  };
}

describe('v1 AI diagnostics', () => {
  it('traces entity/economy growth over a match', () => {
    const { state, services } = initMatch(reg, cfg(7));
    const sim = createSimulation(state, services, { aiEnabled: true });
    const rows: unknown[] = [];
    for (let minute = 0; minute <= 20; minute++) {
      if (minute > 0) for (let i = 0; i < 1200; i++) sim.step();
      const p0 = state.players[0]!;
      const p1 = state.players[1]!;
      const units = (pid: string) => ownedBy(state, pid).filter((e) => e.kind === 'unit').length;
      const blds = (pid: string) => buildingsOf(state, pid).map((b) => b.defId).sort();
      rows.push({
        t: `${minute}m`,
        mana0: Math.floor(p0.mana),
        mana1: Math.floor(p1.mana),
        u0: units('player0'),
        u1: units('player1'),
        b0: blds('player0').join(','),
        b1: blds('player1').length,
        entities: state.entities.size,
      });
    }
    // eslint-disable-next-line no-console
    console.log('TRACE ' + JSON.stringify(rows, null, 1));
  }, 600_000);
});
