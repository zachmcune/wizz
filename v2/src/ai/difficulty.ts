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
  /**
   * Minimum units it will commit to an attack wave. Below this it keeps building up.
   *
   * MEASURED: THIS LEVER DECIDES THE GAME BY ITSELF, SO IT IS THE SAME FOR EVERY DIFFICULTY.
   *
   * In this game the earlier attack wins. The ablation showed every micro lever (focus fire, retreat, kiting, counters,
   * scouting) at a delta of ZERO wins, while this one mattered enormously: holding everything else fixed and forcing the wave
   * size to 7 gave Normal a **7-1** record against Easy, and forcing 9 gave **4-4**. Easy had been winning simply because 7
   * made it attack first — a timing advantage of a few seconds that compounds into map control.
   *
   * With the threshold equalised, the difficulty differences are the ones that should matter: worker count, production rate,
   * counters, focus fire and scouting. Leaving this lever as a difficulty axis would have kept "Easy" strong for a reason that
   * has nothing to do with playing well.
   */
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
  /**
   * How many separate mining bases it will try to hold, including the starting one.
   *
   * 1 means "never expand": the AI keeps everything on its starting cluster. This is the difficulty lever that changes the SHAPE
   * of play rather than a number — an AI holding three bases has three times the income and three places to lose, so it has to
   * scout, defend and choose where to commit. That is why it separates difficulties where retuning worker counts does not.
   */
  readonly targetBases: number;
  /**
   * Minimum seconds before the first expansion is attempted.
   *
   * Hard expands early because it can defend the investment; Easy never expands at all, so its economy stops growing the moment
   * its starting cluster is saturated.
   */
  readonly expandAfterSeconds: number;
  /**
   * How many army units it will keep near a new expansion while it is being established.
   *
   * 0 means the AI plants a base and hopes. A positive number means it actually defends the thing it spent 750 mana on, which is
   * the difference between an expansion that pays for itself and one that is a gift.
   */
  readonly defendExpansions: number;
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
    targetBases: 1,
    expandAfterSeconds: 0,
    defendExpansions: 0,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    decisionInterval: 20, // thinks every 1s
    reactionDelay: 24,
    bankFraction: 0.3,
    harvestersPerRefinery: 6,
    minWaveSize: 7,
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
    targetBases: 2,
    expandAfterSeconds: 180,
    defendExpansions: 2,
  },
  hard: {
    /**
     * HARD IS NORMAL PLUS A FASTER DECISION CADENCE — and nothing else, until each extra is measured.
     *
     * Ablation showed Hard's "advanced" extras were the reason it was the WEAKEST difficulty: harass, kiting, counters, scouting
     * and a third producer each measured neutral-to-negative, and every one of them competes with the army for the same mana.
     * So the baseline here is Normal's proven profile with a faster cadence (which IS a real advantage: the same information
     * acted on sooner), and each extra below is added back only once ablation shows a positive delta.
     */
    id: 'hard',
    label: 'Hard',
    /**
     * 20 ticks (1 s), the SAME as Normal, because faster decisions measured WORSE and the cause is understood.
     *
     * Holding the profile identical and varying only this value, against Easy over 12 games each:
     *
     *   decisionInterval 10 -> 6-6
     *   decisionInterval 20 -> 10-2
     *   decisionInterval 40 -> 10-1
     *
     * The faster AI issued a build attempt every half second and re-derived its reserve twice as often, so its bank sat at 60
     * mana while the slower one held 135 — it was permanently "saving" for a 750-cost building and never funded an army. A
     * machine that decides more often is not smarter, it is just noisier, and here the noise cost it the game. Hard's strength
     * therefore has to come from behaviours that survive measurement, not from reaction speed.
     */
    decisionInterval: 20,
    reactionDelay: 8,
    bankFraction: 0.3,
    harvestersPerRefinery: 6,
    /**
     * HARD ATTACKS EARLIER — THE ONE LEVER THAT MEASURED POSITIVE.
     *
     * Across 12 side-swapped games against Normal, opening at 5 units instead of 7 gave **9-3**. That is consistent with the
     * first-wave finding: earlier commitment wins this game, and it is the only candidate that beat the noise floor. Everything
     * else tried (more workers, an extra producer, kiting, superweapon, harass, a faster decision cadence) measured neutral or
     * negative.
     */
    minWaveSize: 5,
    waveGrowth: 0.25,
    focusFire: true,
    retreatHurtUnits: true,
    /**
     * THE MICRO REPERTOIRE IS OFF, AND THIS IS A MEASURED DECISION, NOT AN OVERSIGHT.
     *
     * Each lever ablated INDIVIDUALLY against Normal scored exactly neutral (kiting 6-6, superweapon 6-6, harass 6-6). But
     * enabling them TOGETHER dropped Hard from 33.3% to 20.8% against Easy. The levers interact: kiting pulls ranged units out of
     * formation, harass splits the army, and the superweapon diverts mana — each affordable alone, and together enough to blunt
     * the push that decides the game.
     *
     * Individual neutrality is therefore NOT sufficient evidence to combine them. Only levers whose COMBINATION measures
     * non-negative go back on, and none has yet.
     */
    kiting: false,
    usesSuperweapon: false,
    scouts: true,
    scoutCount: 1,
    counters: true,
    harass: false,
    buildsDefenses: true,
    targetRefineries: 2,
    targetProduction: 2,
    /**
     * HARD EXPANDS EARLIER, FURTHER AND DEFENDS IT.
     *
     * Three bases against Normal's two, starting 70 seconds sooner, with four units committed to holding a new site rather than
     * two. This is the difference the brief asks for: expansion quality, not a resource bonus — the buildings cost the same and
     * are paid for out of the same income.
     */
    targetBases: 3,
    /**
     * 200 s, MEASURED — expanding at 110 s made Hard WEAKER than Normal.
     *
     * The earliest expansion is not the best one: measured against Normal over 12 side-swapped games, expanding at 110 s gave
     * **6-5** with one match unfinished, because the chain and the refinery pulled workers off the line before the economy could
     * afford them (Hard ended with **2 workers against Normal's 10**). At 200 s the same profile went **12-0 with zero unfinished**:
     * the economy matures first, then the expansion is funded out of surplus rather than out of the worker count.
     */
    expandAfterSeconds: 200,
    defendExpansions: 4,
  },
};

/** Normalise an arbitrary difficulty string from the lobby into a profile. */
export function profileFor(d: string | undefined): DifficultyProfile {
  /**
   * ALWAYS RETURN A FRESH COPY.
   *
   * This used to hand out the shared `DIFFICULTIES` object itself. The ablation harness overrides individual levers on a brain's
   * profile (`Object.assign(brain.profile, override)`), and because that object was the GLOBAL table the override persisted for
   * the rest of the process — so a lever forced on for one measurement stayed on for every later match in the same worker.
   *
   * The symptom was impossible to explain otherwise: Hard and Normal became byte-identical in every profile field, yet measured
   * 20.8% and 79.2% against the same opponent in the same run. A contaminated table, not AI behaviour.
   *
   * Copying makes overrides local to the brain that requested them, which is what an override has to mean for any ablation
   * result to be trustworthy.
   */
  const base = d === 'easy' || d === 'hard' || d === 'normal' ? DIFFICULTIES[d] : DIFFICULTIES.normal;
  return { ...base };
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
