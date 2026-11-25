// WHY DOES A PEER FALL BELOW THE ACTIVITY FLOOR? — the 4-peer jitter case, tallied by command type and minute.
//
// `tests/net/latency-jitter.test.ts` asserts every peer issues more than 100 commands in a 14-minute 4-peer match. That
// assertion is deliberately blunt: it exists to stop two idle worlds agreeing for the wrong reason. When a change makes
// it dip it does not say WHICH commands went missing, and "the AI issues fewer commands" can mean at least three
// different things:
//
//   • production stopped (the bank is reserved for a building instead of units),
//   • movement stopped (the army is parked and no order is re-issued),
//   • the match ended earlier (fewer minutes of activity, same rate).
//
// So this harness replays the exact peers of that test case and counts commands per peer, per type and per minute. It
// changes nothing; it only observes what `BotClient` submits.
//
//   npx vite-node audit/jitter-command-tally.ts            # the committed case: seed 1021, four peers, 14 min cap
//   npx vite-node audit/jitter-command-tally.ts 1021 14

import { loadRegistry } from '../src/data/loader';
import { runMatchThroughRelay, type PeerSpec } from '../src/net/harness';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1021);
const minutes = Number(args[1] ?? 14);

const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];

function human(id: string, team: number, startIndex: number, colorIndex: number, extra: Partial<PeerSpec> = {}): PeerSpec {
  return { id, controller: 'human', team, color: COLORS[colorIndex]!, factionId: 'arcane', startIndex, ...extra };
}

/** Per peer: total, per-type and per-minute tallies. */
interface Tally {
  total: number;
  byType: Map<string, number>;
  byMinute: Map<number, number>;
  firstAt: number | null;
  lastAt: number | null;
}

const tallies = new Map<string, Tally>();
/** Note-prefix histogram: which planner branch was in charge, and for how many passes. */
const notesSeen = new Map<string, number>();
/** EVERY note, bucketed — the command stream's missing `attackMove`s have to be attributable somewhere. */
const notesAll = new Map<string, number>();
/** Latest sampled counts per peer, so the end of the run can report what each side actually fielded. */
const statsAt = new Map<string, { minute: number; army: number; harvesters: number; buildings: number; refineries: number; mana: number }>();
function tallyFor(id: string): Tally {
  let t = tallies.get(id);
  if (!t) {
    t = { total: 0, byType: new Map(), byMinute: new Map(), firstAt: null, lastAt: null };
    tallies.set(id, t);
  }
  return t;
}

const peers = [
  human('p1', 0, 0, 0, { latencyTicks: 0, jitterTicks: 2, jitterSeed: 11 }),
  human('p2', 1, 1, 1, { latencyTicks: 3, jitterTicks: 5, jitterSeed: 22 }),
  human('p3', 2, 2, 2, { latencyTicks: 1, jitterTicks: 3, jitterSeed: 33 }),
  human('p4', 3, 3, 3, { latencyTicks: 5, jitterTicks: 2, jitterSeed: 44 }),
];

const started = Date.now();
const r = runMatchThroughRelay({
  registry: loadRegistry(),
  mapId: 'duel_glade',
  seed,
  peers,
  botHumans: true,
  maxTicks: minutes * 60 * 20,
  onPeerCommands: (pid, tick, cmds) => {
    const t = tallyFor(pid);
    t.total += cmds.length;
    const minute = Math.floor(tick / 20 / 60);
    t.byMinute.set(minute, (t.byMinute.get(minute) ?? 0) + cmds.length);
    t.firstAt ??= tick;
    t.lastAt = tick;
    for (const c of cmds) t.byType.set(c.type, (t.byType.get(c.type) ?? 0) + 1);
  },
  onPeerDecision: (pid, tick, notes) => {
    const first = notes.find((n) => !n.startsWith('re-tasked') && !n.startsWith('focus')) ?? notes[0];
    if (first !== undefined) {
      // Collapse numbers so "saving for X (300/750)" and "(600/750)" land in the same bucket.
      const key = first.replace(/[\d.]+/g, '#').slice(0, 74);
      notesSeen.set(`${pid} ${key}`, (notesSeen.get(`${pid} ${key}`) ?? 0) + 1);
    }
    for (const n of notes) {
      const k = n.replace(/[\d.]+/g, '#').slice(0, 64);
      notesAll.set(`${pid} ${k}`, (notesAll.get(`${pid} ${k}`) ?? 0) + 1);
    }
  },
  onPeerStats: (pid, tick, s) => {
    statsAt.set(pid, { minute: tick / 20 / 60, ...s });
    if (tick % (120 * 20) === 0) {
      console.log(
        `  t=${(tick / 20 / 60).toFixed(0)}m ${pid} army=${s.army} harv=${s.harvesters} bld=${s.buildings} ` +
          `ref=${s.refineries} mana=${Math.round(s.mana)}`,
      );
    }
  },
});
const wall = ((Date.now() - started) / 1000).toFixed(1);

console.log(`seed ${seed}, ${minutes} min cap, 4 peers, heavy jitter (the committed latency-jitter case)`);
console.log(`relay ticks ${r.relayTicks}, inSync ${r.inSync}, desyncs ${r.desyncEvents.length}, wall ${wall}s\n`);

for (const o of r.outcomes) {
  const t = tallyFor(o.playerId);
  const endMin = o.finalTick / 20 / 60;
  console.log(
    `${o.playerId}: issued=${t.total}  ended=${o.ended}  final=${endMin.toFixed(1)} min  ` +
      `first cmd at ${t.firstAt === null ? '-' : (t.firstAt / 20).toFixed(0)}s  ` +
      `last at ${t.lastAt === null ? '-' : (t.lastAt / 20 / 60).toFixed(1)} min  ` +
      `rate=${(t.total / Math.max(0.1, endMin)).toFixed(1)}/min`,
  );
  const types = [...t.byType.entries()].sort((a, b) => b[1] - a[1]);
  console.log('   by type  ' + types.map(([k, v]) => `${k}=${v}`).join(' '));
  const mins = [...t.byMinute.entries()].sort((a, b) => a[0] - b[0]);
  console.log('   by min   ' + mins.map(([k, v]) => `${k}:${v}`).join(' '));
  console.log('');
}

const floor = 100;
for (const o of r.outcomes) {
  const total = tallyFor(o.playerId).total;
  console.log(`${o.playerId} ${total} ${total > floor ? 'PASS' : 'FAIL'} (floor > ${floor})`);
}

console.log('\n--- which planner branch held each pass (top 12 per peer) ---');
for (const o of r.outcomes) {
  const rows = [...notesSeen.entries()]
    .filter(([k]) => k.startsWith(`${o.playerId} `))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  console.log(`${o.playerId}:`);
  for (const [k, v] of rows) console.log(`   ${String(v).padStart(5)}  ${k.slice(o.playerId.length + 1)}`);
}

console.log('\n--- EVERY note emitted, bucketed (top 14 per peer) ---');
for (const o of r.outcomes) {
  const rows = [...notesAll.entries()]
    .filter(([k]) => k.startsWith(`${o.playerId} `))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14);
  console.log(`${o.playerId}:`);
  for (const [k, v] of rows) console.log(`   ${String(v).padStart(5)}  ${k.slice(o.playerId.length + 1)}`);
}
