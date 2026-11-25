// TWO BUILDS, ONE SEED — per-peer command totals side by side, so a regression is attributable instead of guessed.
//
// Comparing two builds by editing `src/ai` and re-running is error-prone: the 4-peer jitter case takes ~50 s and the
// difference is a single number, so it is easy to attribute it to whichever change happens to be in the diff. This
// prints every peer's total AND its per-type breakdown for whichever build is checked out, in one fixed format, so two
// runs can be diffed mechanically.
//
//   npx vite-node audit/jitter-diff.ts > /tmp/baseline.txt
//   ... edit, then ...
//   npx vite-node audit/jitter-diff.ts > /tmp/candidate.txt
//   diff /tmp/baseline.txt /tmp/candidate.txt
//
//   npx vite-node audit/jitter-diff.ts [seed] [minutes]

import { loadRegistry } from '../src/data/loader';
import { runMatchThroughRelay, type PeerSpec } from '../src/net/harness';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1021);
const minutes = Number(args[1] ?? 14);

const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];
function human(id: string, team: number, startIndex: number, colorIndex: number, extra: Partial<PeerSpec> = {}): PeerSpec {
  return { id, controller: 'human', team, color: COLORS[colorIndex]!, factionId: 'arcane', startIndex, ...extra };
}

const perPeer = new Map<string, Map<string, number>>();
const atMinute = new Map<string, number[]>();

const r = runMatchThroughRelay({
  registry: loadRegistry(),
  mapId: 'duel_glade',
  seed,
  peers: [
    human('p1', 0, 0, 0, { latencyTicks: 0, jitterTicks: 2, jitterSeed: 11 }),
    human('p2', 1, 1, 1, { latencyTicks: 3, jitterTicks: 5, jitterSeed: 22 }),
    human('p3', 2, 2, 2, { latencyTicks: 1, jitterTicks: 3, jitterSeed: 33 }),
    human('p4', 3, 3, 3, { latencyTicks: 5, jitterTicks: 2, jitterSeed: 44 }),
  ],
  botHumans: true,
  maxTicks: minutes * 60 * 20,
  onPeerCommands: (pid, tick, cmds) => {
    let m = perPeer.get(pid);
    if (!m) {
      m = new Map();
      perPeer.set(pid, m);
      atMinute.set(pid, new Array(minutes).fill(0));
    }
    const minute = Math.floor(tick / 20 / 60);
    const arr = atMinute.get(pid)!;
    if (minute < arr.length) arr[minute] = (arr[minute] ?? 0) + cmds.length;
    for (const c of cmds) m.set(c.type, (m.get(c.type) ?? 0) + 1);
  },
});

for (const o of r.outcomes) {
  const m = perPeer.get(o.playerId)!;
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const types = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`${o.playerId} total=${total} ended=${o.ended} tick=${o.finalTick}`);
  console.log(`  types  ${types.map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`  minute ${atMinute.get(o.playerId)!.join(' ')}`);
}
console.log(`inSync=${r.inSync} desyncs=${r.desyncEvents.length}`);
