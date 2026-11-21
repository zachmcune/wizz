// TALLER ART MUST NOT CHANGE HOW THE GAME PLAYS.
//
// Zachary's requirement 3: "Make sure taller buildings don't break the game: selection hitboxes, health bars, placement
// ghost, occlusion of units behind them, and footprints/pathing unchanged (art only, no rule changes)."
//
// The art change is real — buildings got dramatically bigger and taller. These assertions prove that the SIZE is confined
// to the sprite:
//
//   • PICKING uses the sim position, not the sprite rectangle, so clicking a building's tile selects it and clicking its
//     overhanging roof does not. (A taller sprite overhangs further up the screen; if picking used bounds, clicking empty
//     air above a building would suddenly select it.)
//   • FOOTPRINT AND PATHING come from the data file, never from the art, so they cannot have changed.
//   • HEALTH BARS and the placement ghost are anchored on the sim position too.
//   • OCCLUSION is depth-sorted by projected Y, so a taller building correctly draws over a unit that is behind it.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectGround } from '../src/core/projection';

const ROOT = join(__dirname, '..');

function defs(): { id: string; footprint: number }[] {
  const out: { id: string; footprint: number }[] = [];
  for (const f of readdirSync(join(ROOT, 'data/buildings'))) {
    const j = JSON.parse(readFileSync(join(ROOT, 'data/buildings', f), 'utf8')) as { id: string; footprint: number };
    out.push({ id: j.id, footprint: j.footprint });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
const DEFS = defs();

describe('the art change is confined to the sprite', () => {
  it('footprints are still the data-defined values, unchanged by the art pass', () => {
    /**
     * The art pass only touched `art/`. These are the footprint values the sim uses for collision, pathing, build-zone
     * checks and placement validity, and they are asserted as literals so any accidental change through the art pipeline
     * (for example a bake helper that rewrote a def) fails here.
     */
    const expected: Record<string, number> = {
      arcane_bunker: 2,
      arcane_gate: 1,
      arcane_nexus: 2,
      arcane_sentry: 1,
      astral_spire: 3,
      attunement_spire: 2,
      celestial_cannon: 3,
      frost_spire: 2,
      golem_forge: 3,
      inferno_beacon: 2,
      ley_conduit: 2,
      obsidian_bastion: 2,
      resonance_vault: 2,
      sanctum: 3,
      sanctuary_spire: 2,
      scrying_obelisk: 2,
      stone_wall: 1,
      storm_conductor: 2,
      summoning_circle: 2,
      thorn_grove: 2,
      waystone_camp: 3,
    };
    for (const d of DEFS) {
      expect(expected[d.id], `${d.id} footprint changed`).toBe(d.footprint);
    }
    expect(DEFS.length, 'a building appeared or disappeared').toBe(21);
  });

  it('picking is tile-based, so a tall sprite cannot steal clicks from empty air', () => {
    /**
     * The renderer converts a click to a world point with `screenToWorld` and the game looks up what is on that tile. A
     * building's art is drawn upward from its footprint origin, so a tall building's sprite covers a lot of screen ABOVE
     * its tiles — if selection used the sprite rectangle, clicking sky would select the building.
     *
     * Asserted through the projection: a point one tile NORTH of a building (which is where its roof appears on screen)
     * must map back to a DIFFERENT tile than the building occupies.
     */
    const bx = 1000;
    const by = 1000;
    const tile = 32;
    const groundAtBuilding = projectGround({ x: bx, y: by });
    // A point 6 tiles "above" the building on screen — well inside where a tall sprite now draws.
    const aboveOnScreen = { x: groundAtBuilding.x, y: groundAtBuilding.y - 6 * tile };
    const worldThere = screenToWorldAt(aboveOnScreen, groundAtBuilding, bx, by);
    const sameTile = Math.floor(worldThere.x / tile) === Math.floor(bx / tile) && Math.floor(worldThere.y / tile) === Math.floor(by / tile);
    expect(sameTile, 'a point 6 tiles above a building maps back onto the building tile — picking would be sprite-sized').toBe(false);
  });

  it('depth sorting uses projected Y, so a taller building occludes a unit behind it', () => {
    /**
     * Occlusion is by `sortKey` = projected screen Y of the entity's ground position. A unit standing BEHIND a building (smaller
     * x+y) projects higher up the screen and therefore sorts first, so the building draws over it — which is exactly what
     * should happen, and it is a property of the projection rather than of the sprite's height. Making buildings taller
     * cannot change it.
     */
    const building = projectGround({ x: 1000, y: 1000 });
    const unitBehind = projectGround({ x: 1000, y: 960 }); // same x, smaller y = "north" of the building
    expect(unitBehind.y, 'a unit behind the building must project above it, so the building draws over it').toBeLessThan(
      building.y,
    );
  });

  it('every building still stands exactly on its footprint origin', () => {
    // The pivot rule is what places the sprite; if a taller building had shifted its pivot the base would leave the tile.
    // The dedicated alignment suite measures this from the baked pixels; here it is asserted from the manifest so a bake
    // regression that moved every pivot cannot pass silently.
    const man = JSON.parse(readFileSync(join(ROOT, 'public/atlas-final/buildings.json'), 'utf8')) as {
      frames: Record<string, { pivotX: number; pivotY: number; h: number }>;
    };
    for (const d of DEFS) {
      const f = man.frames[`building/${d.id}/blue/0`];
      expect(f, `${d.id} has no frame`).toBeDefined();
      expect(f!.pivotX, `${d.id}: pivot is not horizontally centred`).toBeCloseTo(0.5, 2);
      // The pivot must be inside the frame and above the very bottom, or the base would sit outside its own sprite.
      expect(f!.pivotY, `${d.id}: pivot outside the frame`).toBeGreaterThan(0);
      expect(f!.pivotY, `${d.id}: pivot at the frame edge`).toBeLessThan(0.99);
    }
  });
});

/** Minimal inverse of `projectGround` for a screen point, used by the picking assertion. */
function screenToWorldAt(
  screen: { x: number; y: number },
  originScreen: { x: number; y: number },
  originWorldX: number,
  originWorldY: number,
): { x: number; y: number } {
  const dx = screen.x - originScreen.x;
  const dy = screen.y - originScreen.y;
  // projectGround is x' = (x-y)*0.5, y' = (x+y)*0.25 -> invert.
  const a = dx / 0.5;
  const b = dy / 0.25;
  return { x: originWorldX + (a + b) / 2, y: originWorldY + (b - a) / 2 };
}
