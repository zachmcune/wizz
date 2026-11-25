// ECONOMY AND BASE-SIZE DIAGNOSTIC.
//
// Reports, for a given matchup and seed, the two things Zachary's call asks us to fix and then prove:
//
//   ECONOMY   — how much mana is left on the map over time, when it runs out, and the longest stretch each side spends unable to
//               afford anything while it still holds territory.
//   BASE SIZE — buildings, bases (a cluster of buildings around a distinct mana node), workers, army and research, sampled at
//               10 and 18 minutes and at the end.
//
// Everything is counted from the live simulation, not from planner intent, so a number here cannot be inflated by a plan that
// never executed.
//
// Usage:
//   npx vite-node audit/economy-base-diag.ts                     # normal vs normal, seed 1000
//   npx vite-node audit/economy-base-diag.ts --a hard --b easy --seeds 1000,1014
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_RESOURCE_NODE, KIND_UNIT } from '../src/sim/entity-store';

const flag = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const A = flag('a') ?? 'normal';
const B = flag('b') ?? 'normal';
const seeds = (flag('seeds') ?? '1000').split(',').map(Number).filter(Number.isFinite);
const TILE_CLUSTER = 700;

interface Sample {
  minute: number;
  nodeMana: number;
  nodes: number;
  p1: SideSnap;
  p2: SideSnap;
}

interface SideSnap {
  buildings: number;
  bases: number;
  workers: number;
  army: number;
  defenses: number;
  production: number;
  research: number;
  mana: number;
  /** Longest stretch so far with a bank too small to afford the cheapest unit. */
  worstNoSpend: number;
}

const reg = loadRegistry();

function snap(state: ReturnType<typeof initMatch>['state'], pid: string, registry: typeof reg): Omit<SideSnap, 'worstNoSpend'> {
  let buildings = 0;
  let workers = 0;
  let army = 0;
  let defenses = 0;
  let production = 0;
  let research = 0;
  // Bases: cluster owned buildings by proximity to a mana node they are near, so "2 bases" means two distinct mining sites.
  const owned: { x: number; y: number }[] = [];
  for (let s = 0; s < state.entities.count; s++) {
    if (state.entities.dead[s]) continue;
    if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== pid) continue;
    const kind = state.entities.kind[s]!;
    const defId = state.entities.extras[s]!.defId;
    if (kind === KIND_BUILDING) {
      buildings++;
      owned.push({ x: state.entities.posX[s]!, y: state.entities.posY[s]! });
      const bd = registry.buildings.get(defId);
      if (bd?.menuCategory === 'defenses') defenses++;
      if ((bd?.producesUnits?.length ?? 0) > 0) production++;
      if (defId === 'arcane_nexus' || defId === 'golem_forge') research++;
    } else if (kind === KIND_UNIT) {
      const ud = registry.units.get(defId);
      if (ud?.isHarvester) workers++;
      else if (ud?.weapon) army++;
    }
  }
  // Distinct bases: greedy cluster of building positions.
  const clusters: { x: number; y: number; n: number }[] = [];
  for (const p of owned) {
    const near = clusters.find((c) => Math.hypot(c.x / c.n - p.x, c.y / c.n - p.y) < TILE_CLUSTER);
    if (near) {
      near.x += p.x;
      near.y += p.y;
      near.n++;
    } else clusters.push({ x: p.x, y: p.y, n: 1 });
  }
  return { buildings, bases: clusters.length, workers, army, defenses, production, research, mana: 0 };
}

function nodeMana(state: ReturnType<typeof initMatch>['state']): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (let s = 0; s < state.entities.count; s++) {
    if (state.entities.dead[s] || state.entities.kind[s] !== KIND_RESOURCE_NODE) continue;
    total += state.entities.amount[s] ?? 0;
    count++;
  }
  return { total, count };
}

/** Cheapest affordable thing a side could buy, to decide whether it is "able to spend". */
function cheapestUnitCost(registry: typeof reg): number {
  let min = Infinity;
  for (const u of registry.units.values()) if (u.cost > 0) min = Math.min(min, u.cost);
  return Number.isFinite(min) ? min : 100;
}

for (const seed of seeds) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade',
    seed,
    oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: A, team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', aiDifficulty: B, team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    ],
  } as never);
  const drv = new AiDriver(reg, services);
  const cheap = cheapestUnitCost(reg);

  const samples: Sample[] = [];
  const worst = [0, 0];
  const lastAbleToSpend = [0, 0];
  const startNodes = nodeMana(state);
  let dryAt = -1;
  const maxTicks = 35 * 60 * 20;

  const take = (minute: number) => {
    const nm = nodeMana(state);
    const p1 = snap(state, 'p1', reg);
    const p2 = snap(state, 'p2', reg);
    samples.push({
      minute,
      nodeMana: nm.total,
      nodes: nm.count,
      p1: { ...p1, mana: state.players[0]!.mana, worstNoSpend: worst[0]! },
      p2: { ...p2, mana: state.players[1]!.mana, worstNoSpend: worst[1]! },
    });
  };

  take(0);
  let nextSample = 10;
  for (let t = 0; t < maxTicks && !state.ended; t++) {
    stepSimulation(state, services, [], drv.hook);
    const minute = state.tick / 1200;

    if (dryAt < 0 && nodeMana(state).total <= 0) dryAt = minute;

    /**
     * "ABLE TO SPEND" means the side's bank covers the cheapest unit in the roster. Below that it is not choosing to save, it
     * is unable to act — which is the condition the 60-second requirement is about.
     */
    for (let i = 0; i < 2; i++) {
      const mana = state.players[i]!.mana;
      if (mana >= cheap) lastAbleToSpend[i] = state.tick;
      const idleFor = (state.tick - lastAbleToSpend[i]!) / 20;
      worst[i] = Math.max(worst[i]!, idleFor);
    }

    if (minute >= nextSample) {
      take(nextSample);
      nextSample += 2;
    }
  }
  take(state.tick / 1200);

  console.log(`\n=== seed ${seed}: ${A} vs ${B} — ended=${state.ended} winner=${state.winnerTeam} at ${(state.tick / 1200).toFixed(1)} min`);
  console.log(`map mana at start ${Math.round(startNodes.total)} across ${startNodes.count} nodes; mined dry at ${dryAt < 0 ? 'NEVER' : dryAt.toFixed(1) + 'm'}`);
  console.log('min | nodeMana | p1 bld/bases/wk/army/def/res | p2 bld/bases/wk/army/def/res | worstNoSpend p1/p2');
  for (const s of samples) {
    if (![0, 10, 14, 18].includes(Math.round(s.minute)) && s.minute !== samples.at(-1)!.minute) continue;
    console.log(
      `${String(Math.round(s.minute)).padStart(3)} | ${String(Math.round(s.nodeMana)).padStart(8)} | ` +
        `${s.p1.buildings}/${s.p1.bases}/${s.p1.workers}/${s.p1.army}/${s.p1.defenses}/${s.p1.research}`.padEnd(30) +
        ` | ${s.p2.buildings}/${s.p2.bases}/${s.p2.workers}/${s.p2.army}/${s.p2.defenses}/${s.p2.research}`.padEnd(30) +
        ` | ${Math.round(s.p1.worstNoSpend)}/${Math.round(s.p2.worstNoSpend)}`,
    );
  }
}
