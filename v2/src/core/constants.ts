// Global constants. Pure values only — safe for the sim to import.

/** World units per tile. The sim works in world units; tiles are a grid overlay. */
export const TILE = 32;

/** Map tile codes: passable ground, impassable, walkable ramp. */
export const TILE_GROUND = 0;
export const TILE_BLOCKED = 1;
export const TILE_RAMP = 2;

/**
 * Simulation rate. 20 Hz is a deliberate inheritance from v1: it is proven with the existing
 * content timings (cooldowns, build times, spell durations are all authored against it) and it
 * keeps lockstep tick counts low on school Chromebooks.
 */
/**
 * How many units one production building may queue at once.
 *
 * Unbounded queues let a client that sends `produce` faster than units are built drain its whole bank into one building. Each
 * producer gets its own cap, so more producers still means more throughput.
 */
export const MAX_PRODUCTION_QUEUE = 5;

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

/** Per-player army cap. Enforced in the sim (v1 declared this and never checked it). */
export const MAX_UNITS_PER_PLAYER = 90;

/** Extra weapon range (world units) when firing from higher ground onto a lower target. */
export const HIGH_GROUND_RANGE_BONUS = TILE;

/** Extra empty tiles required around a new building footprint. 0 = adjacent placement. */
export const BUILD_SPACING_TILES = 0;

/** Camera zoom clamps (presentation; lives here so view and sim agree on world scale). */
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.0;

/** Convert authored seconds to sim ticks. */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_HZ);
}
