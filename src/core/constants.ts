// Global constants shared across layers. Pure values only (safe for the sim to import).

/** World units per tile. The sim works in world units; tiles are a grid overlay. */
export const TILE = 32;

/** Map tile codes: passable ground, impassable, walkable ramp. */
export const TILE_GROUND = 0;
export const TILE_BLOCKED = 1;
export const TILE_RAMP = 2;

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
export const MOVE_THRESHOLD = 18;
export const TAP_SLOP_PX = 28;
export const LONG_PRESS_MS = 400;
export const DOUBLE_TAP_MS = 300;

/** Extra empty tiles required around a new building footprint (RA2-style: 0 = adjacent placement). */
export const BUILD_SPACING_TILES = 0;

/** Extra weapon range (world units) when firing from higher ground onto a lower target. */
export const HIGH_GROUND_RANGE_BONUS = TILE;

/** Camera zoom clamps. */
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.0;

/** Desktop camera panning speeds (screen px). */
export const KEYBOARD_PAN_SPEED = 900;
export const WHEEL_PAN_SCALE = 1;

/** How far past the map edge the camera may scroll (fraction of viewport world size). */
export const CAMERA_OVERSCROLL_RATIO_X = 1.05;
export const CAMERA_OVERSCROLL_RATIO_Y = 0.55;
