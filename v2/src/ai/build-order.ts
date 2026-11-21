// OPENINGS AS DATA.
//
// A build order is a list of steps with a trigger and a priority. Keeping it as data (rather than a chain
// of `if (tick > X)` in the planner) means the three difficulties can share one interpreter, a new opening
// is a new array, and a test can assert that every step names a building that actually exists and is
// reachable through its own prerequisites.
//
// Each step says WHAT to build and WHEN. The economy planner walks the list in order and executes the first
// step whose trigger is satisfied and whose building is currently legal to place. Nothing here looks at the
// enemy, so an opening cannot cheat; the military planner is where reacting to the opponent happens.

import type { BuildingDef } from '../data/defs';

export interface BuildStep {
  /** The building defId to place. */
  readonly defId: string;
  /**
   * When this step becomes urgent. The planner will not spend on it before this, which is what stops a
   * greedy AI from building a factory before it has any income.
   */
  readonly notBeforeSeconds: number;
  /**
   * Stop queueing harvesters while this step is unbuilt. Openings are about hitting a timing, and a player
   * who keeps buying workers never hits it.
   */
  readonly pauseHarvesters?: boolean;
  /** Free-text reason, shown in the AI debug overlay and asserted by the build-order test. */
  readonly why: string;
}

/**
 * A safe, generic opening that works for every faction.
 *
 * Refinery first (income before army), then a troop structure, then power, then more production. This is the
 * shape the v1 AI never had: it trained from whatever it started with and never built anything, which is
 * why its army topped out at 28 units.
 */
export const STANDARD_OPENING: readonly BuildStep[] = [
  { defId: 'attunement_spire', notBeforeSeconds: 0, pauseHarvesters: false, why: 'income before army' },
  { defId: 'ley_conduit', notBeforeSeconds: 8, pauseHarvesters: true, why: 'power for the first producer' },
  { defId: 'summoning_circle', notBeforeSeconds: 12, pauseHarvesters: true, why: 'first troop structure' },
  { defId: 'attunement_spire', notBeforeSeconds: 40, pauseHarvesters: false, why: 'second refinery for a two-base economy' },
  { defId: 'summoning_circle', notBeforeSeconds: 70, pauseHarvesters: true, why: 'second producer, so waves keep coming' },
  { defId: 'arcane_sentry', notBeforeSeconds: 90, pauseHarvesters: false, why: 'one static defense so an early raid cannot end the game' },
  /**
   * ORDER MATTERS AND THIS ONE WAS IMPOSSIBLE.
   *
   * `arcane_nexus` requires `golem_forge`, but it was listed BEFORE it (nexus @150s, forge @240s). The planner executes the
   * first unsatisfied step, so nexus was always chosen, its requirement was never met, and the plan stopped there for the rest
   * of the match. Measured on seed 1000: the AI built six buildings by minute three and NOTHING for the next fifteen minutes
   * — no second refinery, no second producer, no tech — because it was waiting forever on a building it could never unlock.
   *
   * The forge now comes first, which is what its own requirement list demands.
   */
  { defId: 'golem_forge', notBeforeSeconds: 150, pauseHarvesters: true, why: 'heavy units and siege; also unlocks the nexus' },
  { defId: 'arcane_nexus', notBeforeSeconds: 190, pauseHarvesters: true, why: 'tier 2: unlocks the heavy units and the Astral Spire' },
  { defId: 'attunement_spire', notBeforeSeconds: 220, pauseHarvesters: false, why: 'third refinery' },
];

/** A fast, greedy opening: more production sooner, defenses later. */
export const AGGRESSIVE_OPENING: readonly BuildStep[] = [
  { defId: 'attunement_spire', notBeforeSeconds: 0, pauseHarvesters: false, why: 'income first' },
  { defId: 'summoning_circle', notBeforeSeconds: 10, pauseHarvesters: true, why: 'early pressure structure' },
  { defId: 'ley_conduit', notBeforeSeconds: 20, pauseHarvesters: false, why: 'power for the second producer' },
  { defId: 'summoning_circle', notBeforeSeconds: 35, pauseHarvesters: true, why: 'double production for an early wave' },
  { defId: 'attunement_spire', notBeforeSeconds: 60, pauseHarvesters: false, why: 'sustain the early aggression' },
  { defId: 'arcane_sentry', notBeforeSeconds: 80, pauseHarvesters: false, why: 'defense once the first wave is out' },
  { defId: 'golem_forge', notBeforeSeconds: 120, pauseHarvesters: true, why: 'heavy units; required by the nexus' },
  { defId: 'arcane_nexus', notBeforeSeconds: 160, pauseHarvesters: true, why: 'tier 2' },
];

/**
 * Which opening a difficulty uses.
 *
 * Hard opens greedily because it can defend the greed. On top of that, a SEEDED VARIANT is chosen per match: an AI that
 * always plays the identical opening is not just predictable, it makes every tournament seed produce the same game, so the
 * win-rate table would measure one deterministic script rather than a strategy.
 *
 * `variant` is a 0..2 index derived from the match seed and the player id, so it is reproducible (same seed, same opening)
 * and still differs between players and between seeds. A variant only reorders or trims steps the difficulty would have
 * taken anyway — it never grants resources or information.
 */
export function openingFor(difficulty: string, variant = 0): readonly BuildStep[] {
  const base = difficulty === 'hard' ? AGGRESSIVE_OPENING : STANDARD_OPENING;
  if (variant === 0) return base;
  /**
   * Variant 1 adds an early defense; variant 2 adds a second refinery before the second producer. Both are legal orders a
   * human might choose, and both change the shape of the early game enough to vary the match.
   */
  /**
   * Variants must all be VIABLE, not merely different.
   *
   * Variant 2 used to insert a second attunement_spire (750 mana) BEFORE the first summoning circle. Measured by pinning each
   * variant on the same match: variants 0 and 1 both reached their first summoning circle at 3.1 min and their first army at
   * 3.4 min, while variant 2 reached **neither, ever** — its production was 1500 mana behind and it lost every game it
   * opened. Since the variant is derived from the match seed, roughly a third of all games were decided by which opening the
   * seed happened to pick, which is a large part of why difficulty could not separate: the outcome was set before either AI
   * had made a strategic decision.
   *
   * Each variant now differs in SHAPE without delaying the first producer: an earlier defense, a faster second producer, or
   * a refinery immediately after the producer rather than before it.
   */
  if (variant === 1) {
    const out = [...base];
    const insertAt = Math.min(2, out.length);
    out.splice(insertAt, 0, {
      defId: 'arcane_sentry',
      notBeforeSeconds: 20,
      pauseHarvesters: false,
      why: 'early defense before committing to tech (seeded variant)',
    });
    return out;
  }
  if (variant === 2) {
    // Greedy economy, but the producer comes FIRST so the army is never delayed.
    const out = [...base];
    const circleAt = out.findIndex((s) => s.defId === 'summoning_circle');
    const insertAt = circleAt >= 0 ? circleAt + 1 : 2;
    out.splice(insertAt, 0, {
      defId: 'attunement_spire',
      notBeforeSeconds: 30,
      pauseHarvesters: false,
      why: 'greedy second refinery straight after the first producer (seeded variant)',
    });
    return out;
  }
  return base;
}

/**
 * Is this step already satisfied?
 *
 * Counts only COMPLETE buildings: a foundation that is still going up does not satisfy the step, or the
 * planner would place the same building repeatedly while the first one is under construction.
 */
export function stepSatisfied(
  step: BuildStep,
  steps: readonly BuildStep[],
  built: Map<string, number>,
  defFor: (id: string) => BuildingDef | undefined,
): boolean {
  // How many of this def does the opening ask for up to and including this step?
  let wanted = 0;
  for (const s of steps) {
    if (s.defId === step.defId) wanted++;
    if (s === step) break;
  }
  const have = built.get(step.defId) ?? 0;
  void defFor;
  return have >= wanted;
}
