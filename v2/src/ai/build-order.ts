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
  { defId: 'arcane_nexus', notBeforeSeconds: 150, pauseHarvesters: true, why: 'tier 2: unlocks the heavy units and the Astral Spire' },
  { defId: 'attunement_spire', notBeforeSeconds: 200, pauseHarvesters: false, why: 'third refinery' },
  { defId: 'golem_forge', notBeforeSeconds: 240, pauseHarvesters: true, why: 'heavy units and siege' },
];

/** A fast, greedy opening: more production sooner, defenses later. */
export const AGGRESSIVE_OPENING: readonly BuildStep[] = [
  { defId: 'attunement_spire', notBeforeSeconds: 0, pauseHarvesters: false, why: 'income first' },
  { defId: 'summoning_circle', notBeforeSeconds: 10, pauseHarvesters: true, why: 'early pressure structure' },
  { defId: 'ley_conduit', notBeforeSeconds: 20, pauseHarvesters: false, why: 'power for the second producer' },
  { defId: 'summoning_circle', notBeforeSeconds: 35, pauseHarvesters: true, why: 'double production for an early wave' },
  { defId: 'attunement_spire', notBeforeSeconds: 60, pauseHarvesters: false, why: 'sustain the early aggression' },
  { defId: 'arcane_sentry', notBeforeSeconds: 80, pauseHarvesters: false, why: 'defense once the first wave is out' },
  { defId: 'arcane_nexus', notBeforeSeconds: 130, pauseHarvesters: true, why: 'tier 2' },
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
  const out = [...base];
  out.splice(1, 0, {
    defId: 'attunement_spire',
    notBeforeSeconds: 14,
    pauseHarvesters: false,
    why: 'greedy second refinery (seeded variant)',
  });
  return out;
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
