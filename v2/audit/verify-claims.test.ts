import { describe, it, expect } from 'vitest';
import { getRegistry } from '/workspace/tests/helpers';
import { initMatch } from '/workspace/src/sim/factory';
import { createSimulation } from '/workspace/src/app/create-simulation';
import { nextRandom } from '/workspace/src/sim/rng';
import type { MatchConfig } from '/workspace/src/sim/types';

const reg = getRegistry();

describe('claims', () => {
  it('seed produces identical states (rng unused)', () => {
    const mk = (seed: number): MatchConfig => ({
      mapId: 'duel_glade', seed,
      players: [
        { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, aiDifficulty: 'hard' },
        { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: 'hard' },
      ],
    });
    const a = initMatch(reg, mk(1));
    const sa = createSimulation(a.state, a.services, { aiEnabled: true });
    for (let i = 0; i < 1200; i++) sa.step();
    const b = initMatch(reg, mk(99999));
    const sb = createSimulation(b.state, b.services, { aiEnabled: true });
    for (let i = 0; i < 1200; i++) sb.step();
    console.log('SEEDCHECK', JSON.stringify({
      manaA: a.state.players.map(p => Math.floor(p.mana)),
      manaB: b.state.players.map(p => Math.floor(p.mana)),
      entA: a.state.entities.size, entB: b.state.entities.size,
      rngA: a.state.rngState, rngB: b.state.rngState,
    }));
  }, 120000);

  it('MAX_UNITS_PER_PLAYER is not enforced anywhere', async () => {
    const mod = await import('/workspace/src/core/constants');
    console.log('CAP', mod.MAX_UNITS_PER_PLAYER);
  });
});
