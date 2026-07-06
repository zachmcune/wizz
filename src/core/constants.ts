// Global constants shared across layers. Pure values only (safe for the sim to import).

/** World units per tile. The sim works in world units; tiles are a grid overlay. */
export const TILE = 32;

/** Simulation runs at a fixed rate. Rendering interpolates between ticks. */
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

/** Convenience: convert seconds (as authored in data) to sim ticks. */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_HZ);
}

/** Practical unit caps (mobile performance budget). */
export const MAX_UNITS_PER_PLAYER = 90;

/** Input gesture thresholds (screen px / ms). */
export const TAP_MAX_MS = 250;
export const MOVE_THRESHOLD = 12;
export const LONG_PRESS_MS = 250;
export const DOUBLE_TAP_MS = 300;

/** Camera zoom clamps. */
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.0;
