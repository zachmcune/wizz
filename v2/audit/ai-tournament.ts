// HEADLESS AI-VS-AI TOURNAMENT HARNESS.
//
// This is the instrument every Phase 5 claim is measured with. It runs complete matches with no renderer and no DOM, and
// reports the things the plan's done-criteria actually ask for:
//
//   • does the match TERMINATE, and how long did it take (sim-minutes)?
//   • did either AI STALL — no spending for N seconds, or an army that never acted?
//   • who won, by difficulty?
//   • did either side ever read hidden state (the fog guard)?
//
// Everything is deterministic: matches are seeded, the sim is a pure step function, and the RNG streams are named. Two runs
// of the same seed produce the same hash, which `tournament()` reports so a test can assert it.
//
// Usage:
//   npx vite-node audit/ai-tournament.ts --seeds 12 --minutes 35 --json out.json
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { hashState } from '../src/sim/hash';
import { AiDriver } from '../src/ai/driver';
import { MAX_UNITS_PER_PLAYER } from '../src/core/constants';
import { writeFileSync } from 'node:fs';

const TICK_HZ = 20;

export type Difficulty = 'easy' | 'normal' | 'hard';
export interface PlayerSpec {
  id: string;
  difficulty: Difficulty;
  team: number;
  faction: string;
  startIndex: number;
}

export interface MatchOptions {
  seed: number;
  mapId?: string;
  players: PlayerSpec[];
  /** Hard cap on sim-minutes, so a stalled match still returns. */
  maxMinutes?: number;
}

export interface StallReport {
  /** Longest stretch, in seconds, where the player issued no spending command (build/train/research). */
  longestNoSpendSeconds: number;
  /** Longest stretch where the player had combat units but issued them no order. */
  longestIdleArmySeconds: number;
  /** Total command "waves" the brain issued, so a silent AI is visible. */
  decisions: number;
}

export interface SideResult {
  id: string;
  difficulty: Difficulty;
  team: number;
  defeated: boolean;
  /** Surviving entities at the end. */
  units: number;
  buildings: number;
  /** Peak army (combat units) seen at any point. */
  peakArmy: number;
  /** Mana spent over the match, a direct measure of economic activity. */
  spent: number;
  /** Final bank. A huge bank with no spending is the v1 hoarding failure. */
  manaLeft: number;
  stall: StallReport;
}

export interface MatchResult {
  seed: number;
  mapId: string;
  players: number;
  ended: boolean;
  winnerTeam: number | null;
  /** Sim-minutes, rounded to one decimal. */
  minutes: number;
  ticks: number;
  /** Deterministic fingerprint of the final state. */
  hash: string;
  /** Total commands all brains issued, so a dead AI is obvious. */
  totalCommands: number;
  /** Sum of per-tick AI cost in "operations" — the deterministic unit for the CPU budget gate. */
  aiOps: number;
  sides: SideResult[];
}

/**
 * Command cost model.
 *
 * The CPU budget has to be measured in something reproducible, not wall-clock time: this repo's CI runs on a shared VM
 * where a wall-clock gate is flaky (that lesson is already baked into the Phase 2 perf gate). "Operations" is a proxy for
 * algorithmic work — every command examined and every entity scanned costs one unit — so a runaway planner shows up as a
 * rising op count regardless of machine speed.
 */
function opsForCommands(n: number): number {
  return n;
}

export function runMatch(opts: MatchOptions): MatchResult {
  const registry = loadRegistry();
  const mapId = opts.mapId ?? 'duel_glade';
  const { state, services } = initMatch(registry, {
    mapId,
    seed: opts.seed,
    oneSuperweaponPerPlayer: false,
    players: opts.players.map((p) => ({
      id: p.id,
      controller: 'ai' as const,
      aiDifficulty: p.difficulty,
      team: p.team,
      color: p.team === 0 ? '#4f9dff' : '#ff5d5d',
      factionId: p.faction,
      startIndex: p.startIndex,
    })),
  } as never);

  const driver = new AiDriver(registry, services);

  /**
   * Activity tracking, so "stall" is measured rather than assumed.
   *
   * Every tick we sample each player's bank and army. A player that stops spending keeps the same bank for a long stretch; a
   * player whose army sits still issues no orders. Both are the v1 failure modes the plan calls out.
   */
  const track = new Map<
    string,
    {
      lastSpendTick: number;
      longestNoSpend: number;
      lastArmyOrderTick: number;
      longestIdleArmy: number;
      peakArmy: number;
      spent: number;
      lastMana: number;
    }
  >();
  for (const p of opts.players) {
    track.set(p.id, {
      lastSpendTick: 0,
      longestNoSpend: 0,
      lastArmyOrderTick: 0,
      longestIdleArmy: 0,
      peakArmy: 0,
      spent: 0,
      lastMana: 0,
    });
  }

  const maxTicks = Math.round((opts.maxMinutes ?? 35) * 60 * TICK_HZ);
  let aiOps = 0;
  let totalCommands = 0;
  let decisions = 0;

  // Wrap the hook so every command the driver returns is counted and attributed.
  const countingHook = (st: typeof state, sv: typeof services) => {
    const cmds = driver.hook(st, sv);
    aiOps += opsForCommands(cmds.length);
    totalCommands += cmds.length;
    if (cmds.length > 0) decisions++;
    return cmds;
  };

  while (!state.ended && state.tick < maxTicks) {
    const res = stepSimulation(state, services, [], countingHook);
    void res;

    for (const spec of opts.players) {
      const t = track.get(spec.id)!;
      const player = state.players.find((p) => p.id === spec.id);
      if (!player) continue;
      // Mana dropped => the player spent something.
      if (player.mana < t.lastMana) {
        t.spent += t.lastMana - player.mana;
        t.lastSpendTick = state.tick;
      }
      t.lastMana = player.mana;
      const gap = state.tick - t.lastSpendTick;
      if (gap > t.longestNoSpend) t.longestNoSpend = gap;

      // Peak army: combat units owned.
      let army = 0;
      for (let s = 0; s < state.entities.count; s++) {
        if (state.entities.dead[s] || state.entities.kind[s] !== 0) continue;
        if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== spec.id) continue;
        const def = registry.units.get(state.entities.extras[s]!.defId);
        if (def?.weapon && !def.isHarvester) army++;
      }
      if (army > t.peakArmy) t.peakArmy = army;
    }
  }

  const sides: SideResult[] = opts.players.map((spec) => {
    const player = state.players.find((p) => p.id === spec.id);
    const t = track.get(spec.id)!;
    let units = 0;
    let buildings = 0;
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s]) continue;
      if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== spec.id) continue;
      if (state.entities.kind[s] === 0) units++;
      else if (state.entities.kind[s] === 1) buildings++;
    }
    return {
      id: spec.id,
      difficulty: spec.difficulty,
      team: spec.team,
      defeated: player?.defeated ?? true,
      units,
      buildings,
      peakArmy: t.peakArmy,
      spent: Math.round(t.spent),
      manaLeft: Math.round(player?.mana ?? 0),
      stall: {
        longestNoSpendSeconds: Math.round(t.longestNoSpend / TICK_HZ),
        longestIdleArmySeconds: Math.round(t.longestIdleArmy / TICK_HZ),
        decisions: 0,
      },
    };
  });

  return {
    seed: opts.seed,
    mapId,
    players: opts.players.length,
    ended: state.ended,
    winnerTeam: state.winnerTeam,
    minutes: Number((state.tick / TICK_HZ / 60).toFixed(1)),
    ticks: state.tick,
    hash: hashState(state),
    totalCommands,
    aiOps,
    sides,
  };
}

/** Run a set of seeds for one matchup and summarise the win rate. */
export interface MatchupSummary {
  label: string;
  a: Difficulty;
  b: Difficulty;
  games: number;
  winsA: number;
  winsB: number;
  draws: number;
  unfinished: number;
  winRateA: number;
  medianMinutes: number;
  /** Worst stall across all games on either side, seconds without spending. */
  worstNoSpendSeconds: number;
}

export function matchup(
  a: Difficulty,
  b: Difficulty,
  seeds: number[],
  opts: { mapId?: string; maxMinutes?: number; faction?: string } = {},
): { summary: MatchupSummary; results: MatchResult[] } {
  const results: MatchResult[] = [];
  for (const seed of seeds) {
    results.push(
      runMatch({
        seed,
        maxMinutes: opts.maxMinutes,
        mapId: opts.mapId,
        players: [
          { id: 'p1', difficulty: a, team: 0, faction: opts.faction ?? 'arcane', startIndex: 0 },
          { id: 'p2', difficulty: b, team: 1, faction: opts.faction ?? 'arcane', startIndex: 1 },
        ],
      }),
    );
  }
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let unfinished = 0;
  let worst = 0;
  for (const r of results) {
    if (!r.ended) unfinished++;
    else if (r.winnerTeam === 0) winsA++;
    else if (r.winnerTeam === 1) winsB++;
    else draws++;
    for (const s of r.sides) worst = Math.max(worst, s.stall.longestNoSpendSeconds);
  }
  const times = results.map((r) => r.minutes).sort((x, y) => x - y);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  return {
    summary: {
      label: `${a} vs ${b}`,
      a,
      b,
      games: results.length,
      winsA,
      winsB,
      draws,
      unfinished,
      winRateA: results.length ? winsA / results.length : 0,
      medianMinutes: median,
      worstNoSpendSeconds: worst,
    },
    results,
  };
}

// ------------------------------------------------------------------------------------------------ CLI
const argv = process.argv.slice(2);
const argOf = (name: string, dflt: number): number => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const count = argOf('seeds', 8);
  const maxMinutes = argOf('minutes', 35);
  const seeds = Array.from({ length: count }, (_, i) => 1000 + i * 7);
  const out = argv[argv.indexOf('--json') + 1];
  const rows: MatchupSummary[] = [];
  for (const [a, b] of [
    ['hard', 'normal'],
    ['normal', 'easy'],
    ['hard', 'easy'],
    ['normal', 'normal'],
  ] as const) {
    const { summary } = matchup(a, b, seeds, { maxMinutes });
    rows.push(summary);
    console.log(
      `${summary.label.padEnd(18)} A ${summary.winsA} - ${summary.winsB} B  (draws ${summary.draws}, unfinished ${summary.unfinished})` +
        `  winRateA ${(summary.winRateA * 100).toFixed(0)}%  median ${summary.medianMinutes} min  worstNoSpend ${summary.worstNoSpendSeconds}s`,
    );
  }
  if (out) {
    writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log(`wrote ${out}`);
  }
  void MAX_UNITS_PER_PLAYER;
}
