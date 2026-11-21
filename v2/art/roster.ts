// THE COMPLETE ART ROSTER — one entry point for every unit and structure in the game.
//
// This file exists so nothing downstream needs to know whether an asset was part of the approved
// pilot or added in the full pass. `ROSTER_UNITS` and `ROSTER_BUILDINGS` are the single source of
// truth used by the atlas builder, the gallery, the proof tooling and the tests.
//
// Layout:
//   art/pilot.ts      the 9 approved pilot assets. Its exported `PILOT_*` records keep their names so
//                     the pilot proof still resolves, but three assets (golem, archer, imp) were
//                     pushed further toward a clearer character read on request.
//   art/roster2.ts    the 26 assets added in the full pass — 9 units and 17 structures.
//
// Everything is code-authored geometry. No images, no textures, no generation anywhere in the chain.
import type { Assembly } from './mesh2';
import { PILOT_UNITS, PILOT_BUILDINGS } from './pilot';
import { EXTRA_UNITS, EXTRA_BUILDINGS } from './roster2';

export const ROSTER_UNITS: Record<string, Assembly> = { ...PILOT_UNITS, ...EXTRA_UNITS };
export const ROSTER_BUILDINGS: Record<string, Assembly> = { ...PILOT_BUILDINGS, ...EXTRA_BUILDINGS };

/** Every asset name in the roster, units first, each group sorted for stable output. */
export function rosterNames(): { units: string[]; buildings: string[] } {
  return {
    units: Object.keys(ROSTER_UNITS).sort(),
    buildings: Object.keys(ROSTER_BUILDINGS).sort(),
  };
}
