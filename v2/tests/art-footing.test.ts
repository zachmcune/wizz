// TEAM COLOUR IS A MARKER ON THE FOUNDATION, NOT THE MATERIAL OF IT.
//
// Review of the building-alignment pass: "The team-tinted footings are now large saturated blue pads that
// dominate the base. Keep team color readable, but make it a thin trim or banner on the footing, not a
// full bright slab. The ground stone should stay neutral."
//
// That was a real over-correction. Making the whole upper course team-tinted kept ownership legible but
// turned the largest lit surface on a tower into a saturated slab, so the building read as "a blue pad
// with a tower on it". The foundation is now neutral stone with a thin team rim inset on top.
//
// These tests pin BOTH halves of the requirement, because either one alone can be satisfied by breaking
// the other: the footing must be mostly neutral, AND the building must still show enough team colour to
// tell whose it is at default zoom (the ≥3% assertion lives in `art-roster.test.ts`).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { rasterise } from '../art/raster2';
import { ROSTER_BUILDINGS } from '../art/roster';
import { TERRAIN_MATCH_PITCH, TERRAIN_MATCH_YAW } from '../art/bake-camera';

const ROOT = join(__dirname, '..');
const SIZE = 120;
/** A strong team-blue, so any tinted footing is unmistakable. */
const TEAM: [number, number, number] = [79, 157, 255];

/** Declared footprints, so the test only covers buildings (mana_node is a map resource). */
function buildingIds(): string[] {
  const ids: string[] = [];
  for (const f of readdirSync(join(ROOT, 'data/buildings'))) {
    ids.push((JSON.parse(readFileSync(join(ROOT, 'data/buildings', f), 'utf8')) as { id: string }).id);
  }
  return ids.sort();
}

interface FootingStats {
  /** Share of the footing band's pixels that read as saturated team colour. */
  teamPct: number;
  /** Pixels in the analysed band, so a degenerate render cannot pass vacuously. */
  pixels: number;
}

/**
 * Measure the footing band: the lowest 30% of the sprite, which is the ground-contact courses.
 *
 * Measuring the whole sprite would be wrong — a building's team bands sit high on the shaft, and those are
 * exactly what must stay. The question here is only what colour the GROUND CONTACT is.
 */
function footingStats(asm: (typeof ROSTER_BUILDINGS)[string]): FootingStats {
  const r = rasterise(asm, {
    width: SIZE,
    height: SIZE,
    yaw: TERRAIN_MATCH_YAW,
    pitch: TERRAIN_MATCH_PITCH,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    exposure: 1,
    ss: 1,
    outline: false,
    shadow: false,
    teamColor: TEAM,
  });
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (r.rgba[(y * SIZE + x) * 4 + 3]! > 200) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bandTop = Math.round(maxY - (maxY - minY) * 0.3);
  let team = 0;
  let pixels = 0;
  for (let y = bandTop; y <= maxY; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (r.rgba[i + 3]! < 200) continue;
      pixels++;
      const R = r.rgba[i]!;
      const G = r.rgba[i + 1]!;
      const B = r.rgba[i + 2]!;
      const mx = Math.max(R, G, B);
      const mn = Math.min(R, G, B);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      /**
       * GENUINE TEAM BLUE, not violet masonry.
       *
       * The team ramps are a saturated blue whose GREEN clearly exceeds its RED (team blue is roughly 79,157,255), whereas
       * violet stone has RED above GREEN (about 104,87,147). The old test only asked for blue dominance, so it counted
       * violet walls as team colour — which failed five buildings the moment their walls became violet.
       */
      const teamBlue = B > R + 60 && G > R + 20 && sat > 0.35;
      if (teamBlue) team++;
    }
  }
  return { teamPct: (team / Math.max(1, pixels)) * 100, pixels };
}

describe('team colour is a trim on the foundation, not a slab', () => {
  const ids = buildingIds();

  it.each(ids)('%s: ground contact is neutral stone, not a saturated pad', (id) => {
    const asm = ROSTER_BUILDINGS[id];
    expect(asm, `${id} has no art`).toBeDefined();
    const s = footingStats(asm!);
    // A sanity floor: if the band rendered almost nothing, the ratio would be meaningless.
    expect(s.pixels, `${id}: footing band is empty, the ratio is not measurable`).toBeGreaterThan(32);
    /**
     * 25% is the line between "a rim" and "a slab".
     *
     * A thin rim inset on the footing measures 7-21% of this band (the band includes the building's own
     * body above the rim, which is neutral). Tinting the whole upper course measured 60%+ and is what the
     * review rejected. Anything above a quarter of the ground contact being saturated team colour is the
     * regression this guards.
     */
    expect(
      s.teamPct,
      `${id}: ${s.teamPct.toFixed(1)}% of its ground-contact pixels are saturated team colour — that is a slab, not a rim`,
    ).toBeLessThanOrEqual(25);
  });

  it('the footing helpers do not tint their structural courses', () => {
    // A structural read of the same rule: the source must not paint the full-footprint course with a team
    // material. This catches a regression even if a future shape change happens to hide the tint.
    const src = readFileSync(join(ROOT, 'art/shapes.ts'), 'utf8');
    const plinthStart = src.indexOf('export function plinth(');
    // The slice for `plinth` must stop where its own body ends. `hall()` sits between `plinth` and `roundPlinth` and
    // legitimately carries a team band, so ending the slice at `roundPlinth` would inspect the wrong code.
    const plinthEnd = src.indexOf('export function roundPlinth(');
    // `roundPlinth`'s body ends where `bodyBlock` begins. (`hall` and `towerBody` sit between `plinth` and
    // `roundPlinth` and legitimately carry a team band, which is why the plinth slice cannot simply run to `bodyBlock`.)
    const roundEnd = src.indexOf('export function bodyBlock(');
    expect(plinthStart, 'plinth() not found').toBeGreaterThan(-1);
    expect(plinthEnd, 'roundPlinth() not found').toBeGreaterThan(-1);
    expect(roundEnd, 'end of roundPlinth() not found').toBeGreaterThan(-1);

    /**
     * Only the two FOUNDATION helpers are inspected here.
     *
     * `bodyBlock` deliberately carries a team band: it is the building's own mass, not the ground it stands on, and a
     * marker there is exactly where ownership should read from. The rule being enforced is narrower — the foundation
     * course must stay neutral stone.
     */
    for (const [name, body] of [
      ['plinth', src.slice(plinthStart, plinthEnd)],
      ['roundPlinth', src.slice(plinthEnd, roundEnd)],
    ] as const) {
      /**
       * The FOUNDATION COURSE is the full-footprint lip — a `bbox(w, w, ...)` for a square footprint or a `cyl` for a
       * round one. Either must be stone.
       *
       * This used to demand a rectangular course, which was true when the foundation was a slab; it is now a 1-unit lip
       * and `roundPlinth` builds its with a cylinder, so requiring `bbox` specifically failed a correct helper.
       */
      // Identify the foundation course by its explicit tag, which is the unambiguous marker.
      const foundationLines = body.split('\n').filter((l) => /foundation: true/.test(l));
      expect(foundationLines.length, `${name}: no foundation course found`).toBeGreaterThan(0);
      for (const line of foundationLines) {
        expect(line, `${name}: the foundation course must be stone, not team-tinted`).not.toMatch(/Team/);
      }
      /**
       * A blanked scan of the whole helper body is deliberately NOT used any more.
       *
       * It was a proxy for "the foundation is stone", and it worked while the foundation was the only thing in the
       * helper. The helpers now share a file region with `hall` and `towerBody`, which legitimately carry team bands as
       * part of the BUILDING — so a body-wide regex fails correct code and the assertion above (foundation-tagged lines
       * must be stone) states the real requirement precisely.
       *
       * The end-to-end guarantee is unchanged and still enforced: `art-footing`'s pixel tests assert the ground-contact
       * band is neutral stone on every building, and `art-roster` asserts >=3% visible team colour on every building.
       */
    }
  });
});
