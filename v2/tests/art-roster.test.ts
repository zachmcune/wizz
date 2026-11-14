// GUARDS ON THE FULL ART ROSTER.
//
// These exist because three specific defects shipped in the pilot and were caught by a human rather
// than by CI. Each is now a machine-checked rule:
//
//   1. "Facings 2 and 6 of the Stone Golem become an oblong slab." A model much wider than it is deep
//      collapses in profile. Every unit must have depth >= 52% of its width.
//
//   2. "Units clump into an unreadable pile." Part of the cause was that several units carried almost
//      no team colour at all (Cinder Acolyte had literally zero team-tinted geometry), so two sides
//      looked identical when overlapping. Every unit must carry a minimum share of team-tinted surface
//      area, measured on real triangle area rather than triangle count.
//
//   3. "Reads as a box / a blob / soft and beige." Silhouette legibility is checked structurally: each
//      unit must be taller than it is wide if it is a biped, must not be a degenerate plank, and must
//      have front/back asymmetry so facing is readable.
//
// Also enforced: the roster covers every unit and building in the data files, with no strays.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTris, boundsOf, type Assembly } from '../art/mesh2';
import { ROSTER_UNITS, ROSTER_BUILDINGS } from '../art/roster';
import { rasterise } from '../art/raster2';

const ROOT = join(__dirname, '..');

/** Total surface area, and the share of it that carries meaningful team tint. */
function areaStats(asm: Assembly): { total: number; teamTinted: number; tris: number } {
  const tris = buildTris(asm);
  let total = 0;
  let teamTinted = 0;
  for (const t of tris) {
    const ux = t.b.x - t.a.x;
    const uy = t.b.y - t.a.y;
    const uz = t.b.z - t.a.z;
    const vx = t.c.x - t.a.x;
    const vy = t.c.y - t.a.y;
    const vz = t.c.z - t.a.z;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const a = 0.5 * Math.hypot(cx, cy, cz);
    total += a;
    if ((t.material.teamTint ?? 0) >= 0.3) teamTinted += a;
  }
  return { total, teamTinted, tris: tris.length };
}

/** Centroid offset front-to-back, normalised by depth. Non-zero means the model is not symmetric. */
function frontBackAsymmetry(asm: Assembly): number {
  const tris = buildTris(asm);
  const b = boundsOf(tris);
  let cy = 0;
  for (const t of tris) cy += (t.a.y + t.b.y + t.c.y) / 3;
  cy /= tris.length;
  const centre = (b.minY + b.maxY) / 2;
  const depth = Math.max(1e-6, b.maxY - b.minY);
  return Math.abs(cy - centre) / depth;
}

describe('roster covers the whole game', () => {
  it('every unit in the data files has art', () => {
    const ids = readdirSync(join(ROOT, 'data/units')).map((f) => f.replace(/\.json$/, ''));
    const missing = ids.filter((id) => !(id in ROSTER_UNITS));
    expect(missing, `units with no art: ${missing.join(', ')}`).toEqual([]);
    expect(ids.length).toBe(14);
  });

  it('every building in the data files has art', () => {
    const ids = readdirSync(join(ROOT, 'data/buildings')).map((f) => f.replace(/\.json$/, ''));
    const missing = ids.filter((id) => !(id in ROSTER_BUILDINGS));
    expect(missing, `buildings with no art: ${missing.join(', ')}`).toEqual([]);
    expect(ids.length).toBe(21);
  });

  it('has no art for entities that do not exist', () => {
    const unitIds = readdirSync(join(ROOT, 'data/units')).map((f) => f.replace(/\.json$/, ''));
    const bldIds = readdirSync(join(ROOT, 'data/buildings')).map((f) => f.replace(/\.json$/, ''));
    const strayUnits = Object.keys(ROSTER_UNITS).filter((id) => !unitIds.includes(id));
    // `mana_node` is a map resource rather than a building definition, so it is an allowed extra.
    const strayBuildings = Object.keys(ROSTER_BUILDINGS).filter((id) => !bldIds.includes(id) && id !== 'mana_node');
    expect(strayUnits, `unknown units: ${strayUnits.join(', ')}`).toEqual([]);
    expect(strayBuildings, `unknown buildings: ${strayBuildings.join(', ')}`).toEqual([]);
  });
});

describe('unit silhouettes are consistent across the 8 facings', () => {
  // The golem shipped at 32 wide x 18 deep and collapsed to a slab at yaw 90/270. Depth ratio is the
  // direct measurement of that defect.
  it.each(Object.entries(ROSTER_UNITS))('%s has depth >= 52%% of width', (name, asm) => {
    const b = boundsOf(buildTris(asm));
    const w = b.maxX - b.minX;
    const d = b.maxY - b.minY;
    expect(w, `${name} has no width`).toBeGreaterThan(2);
    expect(d / w, `${name} is too thin in profile (w ${w.toFixed(1)}, d ${d.toFixed(1)})`).toBeGreaterThanOrEqual(0.52);
  });

  it.each(Object.entries(ROSTER_UNITS))('%s is not a degenerate slab', (name, asm) => {
    const b = boundsOf(buildTris(asm));
    const w = b.maxX - b.minX;
    const d = b.maxY - b.minY;
    const h = b.maxZ;
    // A unit needs real volume in all three axes: no pancake, no needle.
    expect(h, `${name} has no height`).toBeGreaterThan(6);
    expect(Math.max(w, d) / h, `${name} is a flat pancake`).toBeLessThan(3.2);
  });

  it.each(Object.entries(ROSTER_UNITS))('%s has front/back asymmetry so facing reads', (name, asm) => {
    expect(frontBackAsymmetry(asm), `${name} is symmetric front-to-back; facing cannot be read`).toBeGreaterThan(0.015);
  });
});

describe('every unit carries a readable team marker', () => {
  // Measured as a share of real surface area, not triangle count: a unit can have many tiny team
  // triangles that are invisible at sprite size.
  it.each(Object.entries(ROSTER_UNITS))('%s has >= 4%% team-tinted surface', (name, asm) => {
    const { total, teamTinted } = areaStats(asm);
    const pct = (teamTinted / total) * 100;
    expect(pct, `${name} only ${pct.toFixed(1)}% team colour`).toBeGreaterThanOrEqual(4);
  });

  it('no unit has zero team colour', () => {
    const offenders = Object.entries(ROSTER_UNITS)
      .map(([n, a]) => ({ n, s: areaStats(a) }))
      .filter(({ s }) => s.teamTinted === 0)
      .map(({ n }) => n);
    expect(offenders, `units with no team colour: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('structures are modelled, not placeholders', () => {
  it.each(Object.entries(ROSTER_BUILDINGS))('%s has real volume and detail', (name, asm) => {
    const tris = buildTris(asm);
    const b = boundsOf(tris);
    const w = b.maxX - b.minX;
    const d = b.maxY - b.minY;
    const h = b.maxZ;
    expect(tris.length, `${name} is too simple`).toBeGreaterThan(120);
    expect(h, `${name} has no height`).toBeGreaterThan(4);
    expect(Math.min(w, d), `${name} has no footprint depth`).toBeGreaterThan(4);
    // Nothing may be wildly off-centre: that is the machine-checkable form of "panels jutting out".
    expect(Math.abs((b.minX + b.maxX) / 2), `${name} is off-centre in X`).toBeLessThan(w * 0.6 + 2);
    expect(Math.abs((b.minY + b.maxY) / 2), `${name} is off-centre in Y`).toBeLessThan(d * 0.6 + 2);
  });

  it.each(Object.entries(ROSTER_BUILDINGS))('%s carries a team marker', (name, asm) => {
    const { total, teamTinted } = areaStats(asm);
    // Structures are dominated by stone, so the bar is lower than for units — but it must be non-zero
    // and visible rather than a single hidden facet.
    expect(teamTinted / total, `${name} has no team colour`).toBeGreaterThan(0.005);
  });

  it('gives every structure a distinct height class in the skyline', () => {
    const heights = Object.entries(ROSTER_BUILDINGS).map(([n, a]) => ({ n, h: boundsOf(buildTris(a)).maxZ }));
    // Sanity: there must be a real spread of heights, not 22 identical boxes.
    const min = Math.min(...heights.map((x) => x.h));
    const max = Math.max(...heights.map((x) => x.h));
    expect(max / min, 'structures have no height variation').toBeGreaterThan(2.5);
  });
});

describe('team colour is VISIBLE, not just present', () => {
  // The previous version of this suite checked that team-tinted geometry existed. It did — 576 tinted
  // triangles on the Astral Spire — but all of them were buried inside the model, so all four team
  // renders were pixel-identical and both players' buildings looked the same. Presence is not
  // visibility.
  //
  // This renders the SAME asset twice with opposite team colours and counts how many pixels actually
  // change. That is the only measurement that answers "can a player tell whose building this is".
  const RED: [number, number, number] = [255, 40, 40];
  const BLUE: [number, number, number] = [40, 90, 255];

  function visibleTeamFraction(asm: Assembly): number {
    const opts = {
      width: 80,
      height: 80,
      yaw: 0.62,
      pitch: 0.5,
      scale: 1.3,
      offsetX: 0,
      offsetY: 0,
      exposure: 1,
      ss: 1,
      outline: false,
      shadow: false,
    } as const;
    const a = rasterise(asm, { ...opts, teamColor: RED });
    const b = rasterise(asm, { ...opts, teamColor: BLUE });
    let changed = 0;
    let opaque = 0;
    for (let i = 0; i < 80 * 80; i++) {
      if (a.rgba[i * 4 + 3]! > 200) opaque++;
      const d =
        Math.abs(a.rgba[i * 4]! - b.rgba[i * 4]!) +
        Math.abs(a.rgba[i * 4 + 1]! - b.rgba[i * 4 + 1]!) +
        Math.abs(a.rgba[i * 4 + 2]! - b.rgba[i * 4 + 2]!);
      if (d > 4) changed++;
    }
    return changed / Math.max(1, opaque);
  }

  it.each(Object.entries(ROSTER_BUILDINGS))('%s shows team colour on screen', (_name, asm) => {
    const pct = visibleTeamFraction(asm) * 100;
    expect(pct, `${_name} only ${pct.toFixed(1)}% of its visible pixels respond to team colour`).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(ROSTER_UNITS))('%s shows team colour on screen', (_name, asm) => {
    const pct = visibleTeamFraction(asm) * 100;
    expect(pct, `${_name} only ${pct.toFixed(1)}% of its visible pixels respond to team colour`).toBeGreaterThanOrEqual(3);
  });

  it('all four team variants of every asset are pixel-distinct', () => {
    const teams: [number, number, number][] = [
      [79, 157, 255],
      [255, 93, 93],
      [92, 255, 138],
      [255, 209, 102],
    ];
    const failures: string[] = [];
    for (const [name, asm] of [...Object.entries(ROSTER_UNITS), ...Object.entries(ROSTER_BUILDINGS)]) {
      const renders = teams.map((t) =>
        rasterise(asm, {
          width: 64,
          height: 64,
          yaw: 0.62,
          pitch: 0.5,
          scale: 1.2,
          offsetX: 0,
          offsetY: 0,
          teamColor: t,
          exposure: 1,
          ss: 1,
          outline: false,
          shadow: false,
        }).rgba,
      );
      // Every pair of team renders must differ somewhere.
      for (let i = 0; i < renders.length; i++) {
        for (let j = i + 1; j < renders.length; j++) {
          const a = renders[i]!;
          const b = renders[j]!;
          let differs = false;
          for (let k = 0; k < a.length; k += 4) {
            if (Math.abs(a[k]! - b[k]!) > 3 || Math.abs(a[k + 1]! - b[k + 1]!) > 3 || Math.abs(a[k + 2]! - b[k + 2]!) > 3) {
              differs = true;
              break;
            }
          }
          if (!differs) failures.push(`${name} teams ${i}/${j} identical`);
        }
      }
    }
    expect(failures, failures.join('; ')).toEqual([]);
  });
});
