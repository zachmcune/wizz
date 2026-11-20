// DIFFICULTY IS A SET OF LEGAL LEVERS, NOT A HANDICAP.
//
// v1's "difficulty" was a lie in both directions: every level read the whole map (so all three were
// omniscient), and the levels differed only by how much extra resource the AI was handed. A player who beat
// Easy had not beaten a worse opponent, they had beaten a smaller cheat.
//
// Here every lever is something a human could do:
//
//   * how often the AI looks at the world (latency) — a slower player reacts slower;
//   * whether it has scouted, and how much of the map it has actually looked at (vision discipline);
//   * how ambitious its build order is, and how tightly it times the follow-ups;
//   * how large a wave it commits with, and how well it concentrates fire;
//   * whether it retreats hurt units and kites with ranged units.
//
// Nothing here reads hidden state, changes unit stats, or grants free resources. A Hard AI wins because it
// scouts, expands, counters, and micros — all things the player can do too.

import type { Perception } from './perception';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyProfile {
  readonly id: Difficulty;
  readonly label: string;
  /** Ticks between full decision passes. 20 ticks = one second. */
  readonly decisionInterval: number;
  /**
   * How long the AI waits after a build/research completes before acting on it, in ticks. A human has
   * reaction time; an AI with 0 latency is not "better", it is inhuman, and it hides bad planning.
   */
  readonly reactionDelay: number;
  /** Fraction of its income the AI is willing to bank before spending on the next step. */
  readonly bankFraction: number;
  /** How many harvester units it wants per refinery before it will look at expanding. */
  readonly harvestersPerRefinery: number;
  /** Minimum units it will commit to an attack wave. Below this it keeps building up. */
  readonly minWaveSize: number;
  /** Extra units it wants before attacking again, as a fraction of the previous wave. */
  readonly waveGrowth: number;
  /** True when it re-targets fire onto the lowest-HP enemy in range. */
  readonly focusFire: boolean;
  /** True when it pulls units under a health threshold back to base. */
  readonly retreatHurtUnits: boolean;
  /** True when ranged units are ordered to step back while their weapon is on cooldown. */
  readonly kiting: boolean;
  /** True when it builds and uses the Astral Spire superweapon. */
  readonly usesSuperweapon: boolean;
  /** True when it scouts with a dedicated cheap unit. */
  readonly scouts: boolean;
  /** How many workers it will dedicate to scouting before the first contact. */
  readonly scoutCount: number;
  /** True when it reacts to the enemy's army composition with counter units. */
  readonly counters: boolean;
  /** True when it harasses undefended enemy expansions. */
  readonly harass: boolean;
  /** True when it builds static defenses at its base. */
  readonly buildsDefenses: boolean;
  /** Target number of refineries (extra income structures) it will aim for. */
  readonly targetRefineries: number;
  /** How many production buildings it wants. */
  readonly targetProduction: number;
}

/**
 * The three profiles.
 *
 * The gap between them is deliberately large enough to be visible in a win-rate table, because "Hard beats
 * Easy 55% of the time" would be indistinguishable from noise. Each step adds a whole capability as well as
 * tightening the numbers, so the improvement is structural rather than a percentage tweak.
 */
export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    decisionInterval: 40, // thinks every 2s
    reactionDelay: 60,
    bankFraction: 0.55, // hoards badly, so it spends late
    harvestersPerRefinery: 4,
    minWaveSize: 7,
    waveGrowth: 0.2,
    focusFire: false,
    retreatHurtUnits: false,
    kiting: false,
    usesSuperweapon: false,
    scouts: false,
    scoutCount: 0,
    counters: false,
    harass: false,
    buildsDefenses: false,
    targetRefineries: 1,
    targetProduction: 1,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    decisionInterval: 20, // thinks every 1s
    reactionDelay: 24,
    bankFraction: 0.3,
    harvestersPerRefinery: 6,
    minWaveSize: 9,
    waveGrowth: 0.25,
    focusFire: true,
    retreatHurtUnits: true,
    kiting: false,
    usesSuperweapon: false,
    scouts: true,
    scoutCount: 1,
    counters: true,
    harass: false,
    buildsDefenses: true,
    targetRefineries: 2,
    targetProduction: 2,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    decisionInterval: 10, // thinks every 0.5s
    reactionDelay: 8,
    bankFraction: 0.12,
    harvestersPerRefinery: 8,
    minWaveSize: 11,
    waveGrowth: 0.3,
    focusFire: true,
    retreatHurtUnits: true,
    kiting: true,
    usesSuperweapon: true,
    scouts: true,
    scoutCount: 2,
    counters: true,
    harass: true,
    buildsDefenses: true,
    targetRefineries: 3,
    targetProduction: 3,
  },
};

/** Normalise an arbitrary difficulty string from the lobby into a profile. */
export function profileFor(d: string | undefined): DifficultyProfile {
  if (d === 'easy' || d === 'hard' || d === 'normal') return DIFFICULTIES[d];
  return DIFFICULTIES.normal;
}

/**
 * How badly is this AI losing the army race? Used to decide whether to defend or attack.
 *
 * Deliberately based only on what the perception shows: if it has not scouted, it cannot know it is behind,
 * which is a real and intended consequence of not scouting.
 */
export function relativeArmyStrength(p: Perception): number {
  const mine = p.myUnits.reduce((a, u) => a + u.hp, 0) + p.myUnits.length * 8;
  const theirs = p.enemyUnits.reduce((a, u) => a + u.hp, 0) + p.enemyUnits.length * 8;
  if (theirs <= 0) return mine > 0 ? 3 : 1;
  if (mine <= 0) return 0;
  return mine / theirs;
}
