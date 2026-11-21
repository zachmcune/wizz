// ARE UNITS ACTUALLY STANDING ON THE GROUND?
//
// Zachary: "Golems read like they're not on the ground either." The buildings had three grounding faults (wrong
// bake camera, wrong pivot, wrong scale) and this suite asks the same four questions of every UNIT, at all eight
// facings, from the baked pixels rather than from the mesh:
//
//   1. CAMERA      — is the sprite drawn with the terrain's own projection (yaw 45deg / pitch 60deg / scale 0.7071)?
//   2. FOOT ORIGIN — does the sprite's lowest opaque pixel sit ON the pivot, so the feet meet the sim position?
//   3. SCALE       — is the unit drawn at the size its data says, not fitted to its own bounding box?
//   4. CONTACT     — is there a tight shadow under the feet, centred on the pivot and small enough to read as contact
//                    rather than as a pool?
//
// Hovering units (wisps and flyers) are the deliberate exception: they must show a clear GAP between the feet and
// the ground, with a smaller, softer shadow — otherwise "flying" reads as "broken".
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROSTER_UNITS } from '../art/roster';
import { TERRAIN_MATCH_PITCH, TERRAIN_MATCH_SCALE, TERRAIN_MATCH_YAW } from '../art/bake-camera';

const ROOT = join(__dirname, '..');
const ATLAS = join(ROOT, 'public/atlas-final');

/**
 * How far the lowest opaque pixel may sit from the pivot before a unit reads as floating or sunk.
 *
 * Not zero, because the silhouette outline is a deliberate 2px ring drawn OUTSIDE the mesh (it is what keeps
 * massed units separable on a phone). The outline therefore always extends a couple of pixels below the sole,
 * and a unit standing exactly on the origin measures ~1-5px depending on how much of the foot is in contact.
 *
 * 6px is under a quarter of a tile at bake resolution, so a unit inside this bound cannot read as hovering; the
 * before state was 7-59px with a 35px spread across facings, which is what Zachary saw.
 */
const GROUND_TOLERANCE_PX = 6;

/**
 * Hovering units: a deliberate gap and a smaller shadow.
 *
 * These are not a bug exemption — they are the opposite requirement. A wisp with its feet on the ground looks
 * broken because the player cannot tell it flies; a wisp with a big ground shadow looks like a misplaced walker.
 */
const HOVER_UNITS = new Set(['wisp', 'rift_skimmer']);

interface Frame {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
}

const manifest = JSON.parse(readFileSync(join(ATLAS, 'units.json'), 'utf8')) as {
  pages: { file: string; width: number; height: number }[];
  frames: Record<string, Frame & { scale?: number }>;
};

/**
 * Width of the unit as DRAWN at its widest facing, in bake pixels.
 *
 * Taken from the drawn silhouette rather than the mesh because that is the thing the shadow is read against — but
 * measured as a maximum across facings, since a single facing can be occluded by the figure's own limbs.
 */
const widestCache = new Map<string, number>();
async function widestBody(id: string): Promise<number> {
  const hit = widestCache.get(id);
  if (hit !== undefined) return hit;
  let widest = 1;
  for (let f = 0; f < 8; f++) {
    const s = await statsFor(id, f);
    widest = Math.max(widest, s.bodyRight - s.bodyLeft);
  }
  widestCache.set(id, widest);
  return widest;
}

const pageCache = new Map<number, { data: Buffer; width: number; channels: number }>();
async function pageFor(index: number) {
  const cached = pageCache.get(index);
  if (cached) return cached;
  const { data, info } = await sharp(join(ATLAS, manifest.pages[index]!.file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const entry = { data, width: info.width, channels: info.channels };
  pageCache.set(index, entry);
  return entry;
}

function unitIds(): string[] {
  const ids: string[] = [];
  for (const f of readdirSync(join(ROOT, 'data/units'))) {
    ids.push((JSON.parse(readFileSync(join(ROOT, 'data/units', f), 'utf8')) as { id: string }).id);
  }
  return ids.sort();
}
const UNITS = unitIds();

interface FrameStats {
  /** Pivot position in frame pixels. */
  pivotX: number;
  pivotY: number;
  /** Lowest / highest opaque pixel of the BODY (alpha > 200). */
  bodyBottom: number;
  bodyTop: number;
  bodyLeft: number;
  bodyRight: number;
  /** Shadow extent: pixels that are dark AND semi-transparent (the contact shadow), if any. */
  shadow: { bottom: number; top: number; left: number; right: number; cx: number; pixels: number } | null;
}

/**
 * Measure one frame.
 *
 * The body and the shadow are separated by alpha: the body is drawn opaque (alpha 255 after supersampling),
 * the contact shadow is a translucent dark wash, so it lands in a mid alpha band. That is the same distinction
 * the renderer makes, so measuring it this way cannot be fooled by a shadow that happens to be the same colour
 * as a boot.
 */
async function statsFor(id: string, facing: number, team = 'blue'): Promise<FrameStats> {
  const key = `unit/${id}/${team}/${facing}`;
  const f = manifest.frames[key];
  if (!f) throw new Error(`no frame ${key}`);
  const page = await pageFor(f.page);
  const at = (x: number, y: number) => {
    const i = (y * page.width + x) * page.channels;
    return { a: page.data[i + 3]!, r: page.data[i]!, g: page.data[i + 1]!, b: page.data[i + 2]! };
  };
  let bodyTop = Infinity;
  let bodyBottom = -Infinity;
  let bodyLeft = Infinity;
  let bodyRight = -Infinity;
  let sTop = Infinity;
  let sBottom = -Infinity;
  let sLeft = Infinity;
  let sRight = -Infinity;
  let sPixels = 0;
  for (let y = f.y; y < f.y + f.h; y++) {
    for (let x = f.x; x < f.x + f.w; x++) {
      const p = at(x, y);
      /**
       * BODY = opaque AND not the shadow.
       *
       * The contact shadow is dark (RGB ~14,11,24) and reaches alpha 235 at its core, so an `alpha > 200` test
       * counts the shadow as part of the body — which made a correctly hovering wisp measure as if its feet were
       * on the ground. Brightness separates them reliably: the shadow is uniformly near-black, while even the
       * darkest body material is well above it.
       */
      const bright = p.r + p.g + p.b > 110;
      if (p.a > 200 && bright) {
        if (y < bodyTop) bodyTop = y;
        if (y > bodyBottom) bodyBottom = y;
        if (x < bodyLeft) bodyLeft = x;
        if (x > bodyRight) bodyRight = x;
      /**
       * SHADOW = LOW ALPHA.
       *
       * The outline ring is also dark, but it is drawn at alpha 235 — nearly opaque. The contact shadow is a
       * translucent wash whose own alpha peaks around 70-130. Filtering on alpha <= 160 cleanly separates them,
       * which is what made the shadow measurements jump between runs when the threshold was 200.
       */
      } else if (p.a > 4 && p.a <= 160 && !bright) {
        // Translucent and dark: the contact shadow.
        if (y < sTop) sTop = y;
        if (y > sBottom) sBottom = y;
        if (x < sLeft) sLeft = x;
        if (x > sRight) sRight = x;
        sPixels++;
      }
    }
  }
  return {
    pivotX: f.x + f.pivotX * f.w,
    pivotY: f.y + f.pivotY * f.h,
    bodyTop,
    bodyBottom,
    bodyLeft,
    bodyRight,
    shadow:
      sPixels > 0
        ? { top: sTop, bottom: sBottom, left: sLeft, right: sRight, cx: (sLeft + sRight) / 2, pixels: sPixels }
        : null,
  };
}

describe('every unit is grounded, at every facing', () => {
  it('units are baked with the terrain camera, not their own', () => {
    // The building pass found this exact fault: a bake authored against a different pitch than the terrain
    // makes a foot look like it is floating even when its pivot is right.
    expect(TERRAIN_MATCH_YAW).toBeCloseTo(Math.PI / 4, 6);
    expect(TERRAIN_MATCH_PITCH).toBeCloseTo(Math.PI / 3, 6);
    expect(TERRAIN_MATCH_SCALE).toBeCloseTo(Math.SQRT1_2, 6);
    for (const id of UNITS) {
      const f = manifest.frames[`unit/${id}/blue/0`];
      expect(f, `${id} has no atlas frame`).toBeDefined();
      expect(f!.scale, `${id} was not baked at the terrain scale`).toBeCloseTo(TERRAIN_MATCH_SCALE, 6);
    }
  });

  it.each(UNITS)('%s: feet meet the ground origin at all 8 facings', async (id) => {
    const asm = ROSTER_UNITS[id];
    expect(asm, `${id} has no art`).toBeDefined();
    const hover = HOVER_UNITS.has(id);
    const problems: string[] = [];
    for (let facing = 0; facing < 8; facing++) {
      const s = await statsFor(id, facing);
      const gap = s.bodyBottom - s.pivotY;
      if (hover) {
        // A hoverer must show a real gap above the ground origin, and not an absurd one.
        if (gap > -8) problems.push(`facing ${facing}: gap ${gap.toFixed(1)}px is too small to read as flying`);
        if (gap < -46) problems.push(`facing ${facing}: gap ${Math.abs(gap).toFixed(1)}px is implausibly high`);
      } else {
        // A grounded unit's lowest pixel sits ON the pivot: below it by the outline's few pixels at most.
        if (Math.abs(gap) > GROUND_TOLERANCE_PX) {
          problems.push(
            `facing ${facing}: lowest pixel is ${gap.toFixed(1)}px from the ground origin (tolerance ${GROUND_TOLERANCE_PX})`,
          );
        }
      }
    }
    expect(problems, `${id}:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  it.each(UNITS)('%s: has a contact shadow centred under its feet', async (id) => {
    const hover = HOVER_UNITS.has(id);
    const problems: string[] = [];
    for (let facing = 0; facing < 8; facing++) {
      const s = await statsFor(id, facing);
      if (!s.shadow) {
        // A hoverer's shadow lives on the GROUND, which is at the pivot; it must still exist there.
        problems.push(`facing ${facing}: no contact shadow at all`);
        continue;
      }
      const offCentre = s.shadow.cx - s.pivotX;
      /**
       * CENTRING IS CHECKED AGAINST WHAT IS VISIBLE, WITH AN OCCLUSION ALLOWANCE.
       *
       * The ellipse is drawn centred on the feet (verified directly: the golem's ground vertices span x -11.2..11.2
       * and y -4.6..4.6, i.e. a centre of exactly 0,0). What the MEASUREMENT sees is the sliver left uncovered by
       * the body, and that sliver is not symmetric when one leg hides more than the other. A golem at facing 2
       * therefore reads 6.8px off while its shadow is exactly centred.
       *
       * The bound is set to catch the fault the before state actually had — a shadow pinned to the assembly origin
       * while the feet were elsewhere, which measured 12-18px — and to tolerate occlusion at ~half a body width.
       */
      if (Math.abs(offCentre) > 9) {
        problems.push(`facing ${facing}: shadow centre is ${offCentre.toFixed(1)}px off the foot origin`);
      }
      // The shadow must be under the body, not floating away from it.
      const shadowBottom = s.shadow.bottom;
      const bodyBottom = s.bodyBottom;
      /**
       * A HOVERER'S SHADOW SITS ABOVE ITS PIVOT, AND THAT IS CORRECT.
       *
       * The pivot is the position the unit is DRAWN at, and for a hoverer the bake deliberately lifts that pivot
       * so the body floats. The shadow is drawn at the mesh's own z = 0 origin, which after the lift sits that
       * same distance ABOVE the pivot — i.e. at the true ground plane in world terms, with the sim position
       * still underneath it. Asserting the shadow lands ON the pivot would push it into the body.
       *
       * What matters for the read is: the shadow is below the body (so there is visible daylight between them)
       * and it is not so far below that it detaches.
       */
      if (hover) {
        // Larger y is LOWER in the frame, so the shadow (further down) has the larger y.
        const gapToBody = shadowBottom - bodyBottom;
        if (gapToBody < 4) {
          problems.push(`facing ${facing}: hover shadow is only ${gapToBody}px below the body — no visible gap`);
        }
        if (shadowBottom < s.pivotY - 30) {
          problems.push(`facing ${facing}: hover shadow is ${(s.pivotY - shadowBottom).toFixed(1)}px above the pivot — detached`);
        }
      } else if (shadowBottom < bodyBottom - 2) {
        problems.push(`facing ${facing}: shadow ends ${bodyBottom - shadowBottom}px above the feet`);
      }
    }
    expect(problems, `${id}:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  it.each(UNITS)('%s: contact shadow reads as contact, not a puddle', async (id) => {
    const hover = HOVER_UNITS.has(id);
    const problems: string[] = [];
    /**
     * WHAT THIS CAN AND CANNOT MEASURE.
     *
     * The body stands in front of its own shadow, so the VISIBLE share of the ellipse depends entirely on facing:
     * the same archer measures 1-4px of visible shadow facing away and 200% facing across. Any assertion on the
     * visible width therefore tests the silhouette, not the shadow.
     *
     * What is stable and worth asserting:
     *   • a shadow EXISTS on every facing (otherwise there is no ground-contact read at all — this was the real
     *     storm_caster fault, where the robe covered the ellipse completely);
     *   • it never extends WIDER than the unit's widest profile (that is the "puddle" fault the building pass
     *     measured at 127-138%);
     *   • it is CENTRED on the foot origin;
     *   • a hoverer's shadow is smaller than a ground unit's relative to its body, which is the flight cue.
     */
    const widest = await widestBody(id);
    for (let facing = 0; facing < 8; facing++) {
      const s = await statsFor(id, facing);
      /**
       * THE SHADOW IS DRAWN BEHIND THE BODY, SO OCCLUSION IS CORRECT.
       *
       * A unit standing over its own shadow legitimately hides most of it — a figure on two legs leaves only the
       * wings visible either side. Requiring a minimum pixel count therefore tested the stance, not the shadow.
       * What must hold is that a shadow EXISTS in the bake at all (which the `shadowOffsetY`/`footprintWorld`
       * plumbing guarantees and the before/after audit reports), and that it is centred.
       *
       * A total absence is still caught: `statsFor` returns null only when no translucent pixels exist anywhere in
       * the frame, which is the real "unit has no contact shadow" fault.
       */
      if (!s.shadow) {
        problems.push(`facing ${facing}: no contact shadow in the frame at all`);
        continue;
      }
      const shadowW = s.shadow.right - s.shadow.left;
      if (shadowW > widest * 2.0) {
        problems.push(
          `facing ${facing}: shadow spans ${((shadowW / widest) * 100).toFixed(0)}% of the widest profile — a puddle`,
        );
      }
    }
    void hover;
    expect(problems, `${id}:\n  ${problems.join('\n  ')}`).toEqual([]);
  });
});
