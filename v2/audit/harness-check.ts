// Does the harness play a real match through the relay? Quick check before wiring the tests.
import { loadRegistry } from '../src/data/loader';
import { runMatchThroughRelay } from '../src/net/harness';

const registry = loadRegistry();
for (const [label, ids, seed] of [
  ['2 peers', ['p1', 'p2'], 1000],
  ['4 peers', ['p1', 'p2', 'p3', 'p4'], 1014],
] as const) {
  const r = runMatchThroughRelay({
    registry,
    mapId: 'duel_glade',
    seed,
    peers: ids.map((id, i) => ({
      id,
      controller: 'human' as const,
      team: i,
      color: ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'][i]!,
      factionId: 'arcane',
      startIndex: i,
    })),
    botHumans: true,
    maxTicks: 34 * 60 * 20,
  });
  console.log(`${label}: relayTicks ${r.relayTicks} inSync ${r.inSync} desyncs ${r.desyncEvents.length}`);
  console.log(r.outcomes.map((o) => `  ${o.playerId} tick ${o.finalTick} ended ${o.ended} winner ${o.winnerTeam} issued ${o.issued} hash ${o.finalHash}`).join('\n'));
}
