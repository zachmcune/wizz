// THE CAMERA A BUILDING IS BAKED WITH MUST BE THE TERRAIN'S CAMERA.
//
// This module exists so the alignment test can import these constants WITHOUT importing
// `build-atlas3.ts`, whose top level runs a full atlas bake (`main()` at module scope). Rebuilding the
// atlas as a side effect of a unit test would be slow and would make the test depend on artwork
// generation rather than on the artifact that is actually shipped.
//
// The terrain projects a world point as:
//
//     sx = (x - y) * 0.5
//     sy = (x + y) * 0.25
//
// The bake camera must reproduce that exactly. With the rasteriser's transform
//
//     x' = x cos(yaw) - y sin(yaw)
//     y' = x sin(yaw) + y cos(yaw)
//     sy' = y' cos(pitch) - z sin(pitch)
//
// matching the terrain's coefficients requires:
//
//     s cos(yaw)             = 0.5
//     s sin(yaw)             = 0.5      -> yaw = 45 deg, s = 0.7071
//     s cos(pitch) * 0.7071  = 0.25     -> cos(pitch) = 0.5 -> pitch = 60 deg
//
// The previous bake used yaw 0.62 (35.5 deg) and pitch 0.5 (28.6 deg), so every square base came out
// as a parallelogram rotated ~9.5 deg off its tile diamond — the original "tilted / floating" report.

/** Yaw that aligns a building's square base with the tile grid: 45 degrees. */
export const TERRAIN_MATCH_YAW = Math.PI / 4;

/** Pitch that gives the terrain's 2:1 dimetric squash: 60 degrees. */
export const TERRAIN_MATCH_PITCH = Math.PI / 3;

/**
 * Scale at which one world unit is one projected pixel under that camera (0.5 / cos(45 deg)).
 *
 * Buildings are baked at exactly this scale and drawn at scale 1. Any per-building scale breaks the
 * 1:1 world-unit-to-pixel mapping, and the contact shadow — computed in world units — then lands off
 * the footprint.
 */
export const TERRAIN_MATCH_SCALE = Math.SQRT1_2;

/** World units per footprint tile. Mirrors `TILE` in `core/constants.ts`. */
export const TILE = 32;
