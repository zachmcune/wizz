// WHERE DOES THE BANK GO IN A 4-WAY GAME? — mana, army, buildings and the expansion gate, every 30 s.
//
// The activity floor in `tests/net/latency-jitter.test.ts` dips to 95 on one peer when the AI expands, and
// `audit/jitter-command-tally.ts` shows the missing commands are almost entirely `attackMove`: the army never forms a
// wave. That points at army PRODUCTION being starved rather than at the expansion itself — `brain.ts` only trains while
// `mana - reservedForBuild > max(150, 2*unitCost)`, so a reserve that holds the whole bank stops production outright.
//
// This harness prints, per side, the numbers that decide that: mana, the reserve the economy planner returned, army and
// harvester counts, and the cluster count. It runs the same four-corner, same-seed game locally (no network) so it is
// fast; the network changes the timing of commands by an input delay, not the shape of the economy.
//
//   npx vite-node audit/ffa-bank-trace.ts             # seed 1021, four normal AIs, 14 min
//   npx vite-node audit/ffa-bank-trace.ts 1021 14

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import * as econMod from '../src/ai/economy';
import { planEconomy, countBases } from '../src/ai/economy';
import { PerceivedWorld, type Perception } from '../src/ai/perception';
import { profileFor } from '../src/ai/difficulty';

/**
 * `expansionGoal` only exists on builds that carry the expansion predicate, so it is looked up rather than imported —
 * this harness has to run against BOTH the shipped baseline and an experimental build to be a comparison.
 */
type SiteFn = (
  per: Perception,
  registry: ReturnType<typeof loadRegistry>,
  services: never,
  profile: ReturnType<typeof profileFor>,
  elapsed: number,
) => { x: number; y: number } | null;
const expansionGoal = (econMod as unknown as { expansionGoal?: SiteFn }).expansionGoal ?? (() => null);

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1021);
const minutes = Number(args[1] ?? 14);

const reg = loadRegistry();
const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [0, 1, 2, 3].map((i) => ({
    id: `p${i + 1}`,
    controller: 'ai',
    aiDifficulty: 'normal',
    team: i,
    color: COLORS[i]!,
    factionId: 'arcane',
    startIndex: i,
  })),
} as never);

const drv = new AiDriver(reg, services);
const world = new PerceivedWorld(services);
const cap = minutes * 60 * 20;
const SAMPLE = 30 * 20;
const typeTally = new Map<string, number>();
const typeNames = new Map<string, Map<string, number>>();

function armyOf(per: Perception): { army: number; harv: number } {
  let army = 0;
  let harv = 0;
  for (const u of per.myUnits) {
    if (reg.units.get(u.defId)?.isHarvester) harv++;
    else if (reg.units.get(u.defId)?.weapon) army++;
  }
  return { army, harv };
}

for (let t = 0; t < cap && !state.ended; t++) {
  if (t > 0 && t % SAMPLE === 0) {
    const secs = Math.floor(t / 20);
    const per = world.build(state, 'p1');
    const prof = profileFor('normal');
    const econ = planEconomy(state, per, reg, services, prof, 'normal', secs, 0);
    const site = expansionGoal(per, reg, services as never, prof, secs);
    console.log(
      `t=${String(secs).padStart(3)}s  [p1 planner: reserve=${Math.round(econ.reservedForBuild)} ` +
        `spendable=${Math.round(per.mana - econ.reservedForBuild)} site=${site ? 'Y' : '-'} ` +
        `notes="${econ.notes[0] ?? ''}"]`,
    );
    for (const p of state.players) {
      const perP = world.build(state, p.id);
      const { army, harv } = armyOf(perP);
      const refs = perP.myBuildings.filter((b) => reg.buildings.get(b.defId)?.isRefinery).length;
      console.log(
        `        ${p.id} mana=${Math.round(perP.mana)} army=${army} harv=${harv} ref=${refs} ` +
          `clusters=${countBases(perP, reg)} bld=${perP.myBuildings.length} ` +
          `cmds=${typeTally.get(p.id) ?? 0} [${[...(typeNames.get(p.id) ?? new Map<string, number>()).entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')}]`,
      );
    }
  }
  const cmds = drv.hook(state, services);
  for (const c of cmds) {
    typeTally.set(c.playerId, (typeTally.get(c.playerId) ?? 0) + 1);
    let m = typeNames.get(c.playerId);
    if (!m) {
      m = new Map();
      typeNames.set(c.playerId, m);
    }
    m.set(c.type, (m.get(c.type) ?? 0) + 1);
  }
  stepSimulation(state, services, cmds);
}
console.log(
  `\nended=${state.ended} winner=${state.winnerTeam} tick=${state.tick} (${(state.tick / 20 / 60).toFixed(1)} min)`,
);
