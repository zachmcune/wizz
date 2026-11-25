// Phase-0 CPU benchmark for the v1 simulation. Hardware-independent numbers:
// how much of the 50 ms tick budget the sim uses, and how deep the entity counts get.
import { it, describe } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

function aiMatch(seed: number): MatchConfig {
  return {
    mapId: 'duel_glade',
    seed,
    players: [
      { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, aiDifficulty: 'hard' },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: 'hard' },
    ],
  };
}

function run(label: string, seed: number, ticks: number) {
  const { state, services } = initMatch(reg, aiMatch(seed));
  const sim = createSimulation(state, services, { aiEnabled: true });
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) sim.step();
  const ms = performance.now() - t0;
  let units = 0;
  let buildings = 0;
  for (const e of state.entities.values()) {
    if (e.kind === 'unit') units++;
    else if (e.kind === 'building') buildings++;
  }
  const row = {
    label,
    ticks,
    ms: +ms.toFixed(1),
    msPerTick: +(ms / ticks).toFixed(4),
    tickBudgetPct: +((ms / ticks / 50) * 100).toFixed(2),
    entities: state.entities.size,
    units,
    buildings,
    ended: state.ended,
    finalTick: state.tick,
  };
  // eslint-disable-next-line no-console
  console.log('BENCH ' + JSON.stringify(row));
  return row;
}

describe('v1 sim CPU baseline', () => {
  it('20 simulated minutes, 1v1 hard AI', () => {
    run('20min-hard', 7, 20 * 60 * 20);
  }, 600_000);
});
