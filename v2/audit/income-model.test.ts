// Precise income model: separate siphon time from pathing time, and compare a
// short-hop (realistic player build) against the configured rate.
import { describe, it } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import { ownedBy } from '../src/sim/queries';
import { getHarvester } from '../src/sim/capabilities';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

function run(spireOffset: { dx: number; dy: number }, seconds: number) {
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
  const spire = spawnEntity(state, services, null, 'attunement_spire', 'p0', sanctum.pos.x + spireOffset.dx, sanctum.pos.y + spireOffset.dy);
  if (spire.kind === 'building') spire.buildProgress = undefined;

  const node = [...state.entities.values()]
    .filter((e) => e.kind === 'resource_node' && e.amount > 0)
    .sort((a, b) => Math.hypot(a.pos.x - spire.pos.x, a.pos.y - spire.pos.y) - Math.hypot(b.pos.x - spire.pos.x, b.pos.y - spire.pos.y))[0]!;

  const wisps = ownedBy(state, 'p0').filter((e) => e.kind === 'unit' && e.defId === 'wisp');
  if (wisps[1]) sim.enqueueNow([{ type: 'move', playerId: 'p0', entityIds: [wisps[1].id], x: 100, y: 100 }]);
  const w = wisps[0]!;
  sim.enqueueNow([{ type: 'harvest', playerId: 'p0', entityIds: [w.id], nodeId: node.id }]);

  let siphonTicks = 0;
  let prev = 0;
  for (let i = 0; i < 20 * seconds; i++) {
    sim.step();
    const c = getHarvester(w)!.carry;
    if (c > prev + 1e-9) siphonTicks++;
    prev = c;
  }
  const mins = seconds / 60;
  return {
    hopDistance: +Math.hypot(node.pos.x - spire.pos.x, node.pos.y - spire.pos.y).toFixed(0),
    mana: Math.floor(p.mana),
    manaPerSec: +(p.mana / seconds).toFixed(3),
    siphonDutyCycle: +(siphonTicks / (20 * seconds)).toFixed(3),
    effectiveSiphonRate: +((getHarvester(w)!.carryMax) / 1).toFixed(0),
    minutes: +mins.toFixed(2),
  };
}

describe('income model', () => {
  it('compares short and long hauls', () => {
    const short = run({ dx: 128, dy: 64 }, 120);
    const long = run({ dx: 300, dy: 240 }, 120);
    // eslint-disable-next-line no-console
    console.log('INCOME ' + JSON.stringify({ short, long, configured: reg.balance.siphonPerSecond }, null, 1));
  }, 300_000);
});
