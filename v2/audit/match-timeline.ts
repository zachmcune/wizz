// MATCH TIMELINE — why does a match end when it does?
//
// The Phase 5 numbers say median 1v1 length is ~12 min against a 15-25 min target, and HANDOFF §7.1 records that raising
// sanctum HP no longer lengthens matches (4000 -> 12.0, 6000 -> 12.1, 8000 -> 12.6). That means the HQ is not what is
// deciding the length: something makes one side unable to contest the map long before the HQ falls. This harness prints
// the per-minute state of both sides so the actual deciding event is visible instead of inferred.
//
// Usage: npx vite-node audit/match-timeline.ts [--seed 1000] [--d0 normal] [--d1 normal] [--every 60]
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const arg = (n: string, d: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const seed = Number(arg('seed', '1000'));
const d0 = arg('d0', 'normal') as 'easy' | 'normal' | 'hard';
const d1 = arg('d1', 'normal') as 'easy' | 'normal' | 'hard';
/** Seconds between rows. */
const every = Number(arg('every', '60'));
const maxMinutes = Number(arg('minutes', '34'));

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: d0, team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: d1, team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
const st = state.entities;

interface Row {
  min: number;
  mana: [number, number];
  workers: [number, number];
  army: [number, number];
  armyHp: [number, number];
  bldgs: [number, number];
  bases: [number, number];
  hqHp: [number, number];
}

function sample(): Row {
  const mana: [number, number] = [0, 0];
  const workers: [number, number] = [0, 0];
  const army: [number, number] = [0, 0];
  const armyHp: [number, number] = [0, 0];
  const bldgs: [number, number] = [0, 0];
  const bases: [number, number] = [0, 0];
  const hqHp: [number, number] = [0, 0];
  state.players.forEach((p, i) => {
    mana[i] = Math.round(p.mana);
  });
  for (let s = 0; s < st.count; s++) {
    if (st.dead[s]) continue;
    const oi = st.ownerIndex[s]!;
    if (st.kind[s] === 0) {
      const u = reg.units.get(st.extras[s]!.defId);
      if (u?.isHarvester) workers[oi]!++;
      else if (u?.weapon) {
        army[oi]!++;
        armyHp[oi]! += st.hp[s]!;
      }
    } else if (st.kind[s] === 1) {
      bldgs[oi]!++;
      const b = reg.buildings.get(st.extras[s]!.defId);
      if (b?.isRefinery || b?.isConstructionYard) bases[oi]!++;
      if (b?.isConstructionYard) hqHp[oi]! += st.hp[s]!;
    }
  }
  return {
    min: state.tick / 1200,
    mana,
    workers,
    army,
    armyHp: armyHp.map(Math.round) as [number, number],
    bldgs,
    bases,
    hqHp: hqHp.map(Math.round) as [number, number],
  };
}

const rows: Row[] = [];
const stepTicks = every * 20;
const maxTicks = maxMinutes * 60 * 20;
let nextSample = 0;

while (!state.ended && state.tick < maxTicks) {
  if (state.tick >= nextSample) {
    rows.push(sample());
    nextSample += stepTicks;
  }
  stepSimulation(state, services, [], drv.hook);
}
if (rows.length === 0 || rows[rows.length - 1]!.min !== state.tick / 1200) rows.push(sample());

console.log(`TIMELINE seed ${seed} ${d0}(c0) vs ${d1}(c1) -> ${state.ended ? `team ${state.winnerTeam} at ${(state.tick / 1200).toFixed(1)}m` : 'UNFINISHED'}`);
console.log('  min |     mana p1/p2 | workers |  army | armyHp      | bldgs | bases | hqHp');
for (const r of rows) {
  console.log(
    `  ${r.min.toFixed(1).padStart(5)} | ${String(r.mana[0]).padStart(6)}/${String(r.mana[1]).padEnd(6)} | ` +
      `${String(r.workers[0]).padStart(2)}/${String(r.workers[1]).padEnd(2)} | ` +
      `${String(r.army[0]).padStart(2)}/${String(r.army[1]).padEnd(2)} | ` +
      `${String(r.armyHp[0]).padStart(5)}/${String(r.armyHp[1]).padEnd(5)} | ` +
      `${String(r.bldgs[0]).padStart(2)}/${String(r.bldgs[1]).padEnd(2)} | ` +
      `${String(r.bases[0]).padStart(2)}/${String(r.bases[1]).padEnd(2)} | ` +
      `${String(r.hqHp[0]).padStart(4)}/${String(r.hqHp[1]).padEnd(4)}`,
  );
}
