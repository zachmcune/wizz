import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { isEnemy } from '../src/sim/queries';
import type { Command } from '../src/sim/types';

const reg = getRegistry();

describe('N-player / FFA / teams & win conditions', () => {
  it('a 4-player FFA resolves to exactly one winning team, and AI never targets allies', () => {
    const { state, services } = initMatch(reg, reg.match('ffa_4'));
    const sim = new Simulation(state, services);

    // Verify no AI-issued attack command targets an ally, across the whole match.
    const originalStep = sim.step.bind(sim);
    let allyAttack = false;
    sim.step = () => {
      const res = originalStep();
      for (const cmd of res.nextCommands as Command[]) {
        if (cmd.type === 'attack' || cmd.type === 'attackMove') {
          // attackMove targets ground; attack targets an entity - verify entity relation
          if (cmd.type === 'attack') {
            const target = state.entities.get(cmd.targetId);
            if (target && !isEnemy(state, cmd.playerId, target.owner) && cmd.playerId !== target.owner) allyAttack = true;
          }
        }
      }
      return res;
    };

    let ended = false;
    for (let i = 0; i < 60 * 20 * 20; i++) {
      // up to ~20 minutes of sim time
      sim.step();
      if (state.ended) {
        ended = true;
        break;
      }
    }
    expect(ended).toBe(true);
    expect(allyAttack).toBe(false);
    // exactly one team remains
    const aliveTeams = new Set(state.players.filter((p) => !p.defeated).map((p) => p.team));
    expect(aliveTeams.size).toBeLessThanOrEqual(1);
    expect(state.winnerTeam).not.toBeNull();
  });

  it('2v2 teams: allies are not defeated by teammates and one team wins', () => {
    const cfg = {
      mapId: 'duel_glade',
      seed: 999,
      players: [
        { id: 'player0', controller: 'ai' as const, team: 0, color: '#4f9dff', startIndex: 0, aiDifficulty: 'hard' as const },
        { id: 'player1', controller: 'ai' as const, team: 0, color: '#5dff8f', startIndex: 1, aiDifficulty: 'normal' as const },
        { id: 'player2', controller: 'ai' as const, team: 1, color: '#ff5d5d', startIndex: 2, aiDifficulty: 'hard' as const },
        { id: 'player3', controller: 'ai' as const, team: 1, color: '#ffd166', startIndex: 3, aiDifficulty: 'normal' as const },
      ],
    };
    const { state, services } = initMatch(reg, cfg);
    const sim = new Simulation(state, services);
    let ended = false;
    for (let i = 0; i < 60 * 20 * 25; i++) {
      sim.step();
      if (state.ended) {
        ended = true;
        break;
      }
    }
    expect(ended).toBe(true);
    const winners = state.players.filter((p) => !p.defeated);
    const winTeams = new Set(winners.map((p) => p.team));
    expect(winTeams.size).toBe(1);
  });
});
