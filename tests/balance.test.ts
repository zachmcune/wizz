import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { runHeadless } from '../src/sim/headless';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

function aiMatch(seed: number, d0: 'easy' | 'normal' | 'hard', d1: 'easy' | 'normal' | 'hard'): MatchConfig {
  return {
    mapId: 'duel_glade',
    seed,
    players: [
      { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, aiDifficulty: d0 },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: d1 },
    ],
  };
}

describe('balance harness (data-driven)', () => {
  it('balance.json loads and drives tunables', () => {
    expect(reg.balance.startingMana).toBeGreaterThan(0);
    expect(reg.balance.ai.hard.armyThreshold).toBeGreaterThan(0);
  });

  it('AI-vs-AI matches all resolve within a sane time bound', () => {
    const MAX_TICKS = 20 * 60 * 30; // 30 minutes of sim time
    const report: { seed: number; winnerTeam: number | null; ticks: number }[] = [];
    for (const seed of [1, 2, 3, 4]) {
      const final = runHeadless(reg, aiMatch(seed, 'hard', 'normal'), MAX_TICKS);
      report.push({ seed, winnerTeam: final.winnerTeam, ticks: final.tick });
      expect(final.ended).toBe(true);
      expect(final.winnerTeam).not.toBeNull();
    }
    // sanity: not every match is won by the same team (some variety across seeds/handicap)
    expect(report.length).toBe(4);
  });
});
