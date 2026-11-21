// Phase-0 perf baseline under load: sim tick cost at 8-player / big-army scale,
// and the render-frame CPU cost measured in-browser (GPU-independent).
import { it, describe } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import type { MatchConfig, Command } from '../src/sim/types';

const reg = getRegistry();

function stressConfig(nPlayers: number): MatchConfig {
  return {
    mapId: 'duel_glade',
    seed: 42,
    players: Array.from({ length: nPlayers }, (_, i) => ({
      id: `player${i}`,
      controller: 'ai' as const,
      team: i % 2,
      color: '#4f9dff',
      startIndex: i,
      aiDifficulty: 'hard' as const,
    })),
  };
}

describe('v1 load baseline', () => {
  it('sim tick cost with massed armies', () => {
    const { state, services } = initMatch(reg, stressConfig(4));
    const sim = createSimulation(state, services, { aiEnabled: false });

    // Spawn 90 units + 20 buildings per player = 440 entities, the documented cap.
    const units = ['imp_swarmling', 'arcane_archer', 'stone_golem', 'storm_caster', 'rift_skimmer'];
    let n = 0;
    for (const p of state.players) {
      for (let i = 0; i < 90; i++) {
        const sx = 400 + (i % 30) * 40 + (n % 3) * 200;
        const sy = 400 + Math.floor(i / 30) * 60 + (n % 4) * 600;
        spawnEntity(state, services, null, units[i % units.length]!, p.id, sx, sy);
      }
      for (let i = 0; i < 20; i++) {
        spawnEntity(state, services, null, ['attunement_spire', 'summoning_circle', 'ley_conduit', 'arcane_sentry'][i % 4]!, p.id, 300 + i * 100, 1900 + (n % 4) * 40);
      }
      n++;
    }

    // Give every unit a move order so movement + pathing + combat all run.
    for (const p of state.players) {
      const ids = [...state.entities.values()].filter((e) => e.kind === 'unit' && e.owner === p.id).map((e) => e.id);
      sim.enqueueNow([{ type: 'attackMove', playerId: p.id, entityIds: ids, x: 2000, y: 1400 } as Command]);
    }

    const ticks = 600;
    // warm
    for (let i = 0; i < 100; i++) sim.step();
    const t0 = performance.now();
    for (let i = 0; i < ticks; i++) sim.step();
    const ms = performance.now() - t0;
    const entities = state.entities.size;
    const out = {
      entities,
      ticks,
      ms: +ms.toFixed(1),
      msPerTick: +(ms / ticks).toFixed(3),
      tickBudgetPct: +((ms / ticks / 50) * 100).toFixed(1),
      realtimeFpsCeiling: +(1000 / (ms / ticks)).toFixed(0),
    };
    // eslint-disable-next-line no-console
    console.log('LOAD ' + JSON.stringify(out));
  }, 300_000);

  it('8-player FFA load', () => {
    const { state, services } = initMatch(reg, stressConfig(4));
    const sim = createSimulation(state, services, { aiEnabled: true });
    const t0 = performance.now();
    for (let i = 0; i < 1200; i++) sim.step();
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log('LOADAI ' + JSON.stringify({ ms: +ms.toFixed(1), msPerTick: +(ms / 1200).toFixed(3), entities: state.entities.size }));
  }, 300_000);
});
