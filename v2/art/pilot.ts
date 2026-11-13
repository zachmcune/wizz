// PILOT ART — five units, four buildings, one terrain prop set.
//
// Each asset starts from a SILHOUETTE PLAN: the one shape that must survive at 20 px. Parts are then
// modelled to serve that plan, using bevelled forms, tapered/jointed limbs and layered materials.
//
//   wisp          a teardrop of light with a tapered tail and three orbiting motes; NO limbs
//   imp_swarmling hunched biped: big head, two swept horns, long arms reaching the ground
//   arcane_archer upright figure with a tall asymmetric bow and a pointed hood
//   stone_golem   a wide low centre of mass: huge forearms, tiny head sunk between boulders
//   storm_caster  robed cone with a high collar and three orbiting orbs
//
//   sanctum        tiered tower with four buttress fins and a glowing crown orb
//   arcane_sentry  a small tripod with a crystal cluster head
//   stone_wall     a staggered stone barrier with visible blocks and a team banner
//   mana_node      a crystal cluster erupting from rock

import type { Assembly, Part, Shape } from './mesh2';
import { PAL } from './palette2';

type M = (typeof PAL)[keyof typeof PAL];

function part(shape: Shape, pos: [number, number, number], material: M, extra: Partial<Part> = {}): Part {
  return { shape, pos: { x: pos[0], y: pos[1], z: pos[2] }, material: material as never, ...extra };
}

/**
 * Bevelled box. ARGUMENT ORDER IS (width, depth, height) — width and depth are the footprint on the
 * ground plane, height is vertical. This order was chosen after a bug where an earlier version took
 * (w, h, d), which silently swapped height and depth at ~20 call sites and produced horizontal slabs
 * where vertical fins were intended ("flat panels jutting out at odd angles").
 */
const bbox = (w: number, d: number, h: number, bevel = Math.min(w, d) * 0.14, taper?: number): Shape =>
  taper === undefined
    ? { kind: 'bevelBox', w, d, h, bevel }
    : { kind: 'bevelBox', w, d, h, bevel, taper };
const tube = (sections: [number, number, number, number][], sides = 8, caps = true): Shape => ({
  kind: 'tube',
  sections: sections.map(([x, y, z, r]) => ({ x, y, z, r })),
  sides,
  caps,
});
const cap = (r: number, len: number, sides = 10): Shape => ({ kind: 'capsule', r, len, sides });
const plate = (w0: number, w1: number, h: number, thick: number): Shape => ({ kind: 'plate', w0, w1, h, thick });
const sph = (r: number, seg = 10): Shape => ({ kind: 'sphere', r, seg });
const cone = (r: number, h: number, sides = 9): Shape => ({ kind: 'cone', r, h, sides });
const cyl = (r0: number, r1: number, h: number, sides = 12): Shape => ({ kind: 'cyl', r0, r1, h, sides });
const prism = (r: number, h: number, sides: number): Shape => ({ kind: 'prism', r, h, sides });

// ================================================================================================
// WISP — a creature of light. No limbs; the read is a bright core inside a tapered teardrop with a
// trailing tail. Orbiting motes give it motion even when stationary.
// ================================================================================================
function wisp(): Assembly {
  return {
    parts: [
      // Body: a tapered teardrop, widest low and drawing to a point above. Built as a tube so the
      // profile can swell and pinch.
      part(
        tube(
          [
            [0, 0, 2.0, 1.2],
            [0, 0, 4.5, 4.6],
            [0, 0, 8.5, 6.2],
            [0, 0, 12.5, 6.0],
            [0, 0, 16.0, 3.8],
            [0, 0, 18.5, 1.4],
          ],
          12,
        ),
        [0, 0, 0],
        PAL.crystal,
      ),
      // Inner core, brighter and slightly smaller, so the body reads as translucent.
      part(sph(4.0, 12), [0, 0, 10.0], PAL.crystalHot, { scale: { x: 1, y: 1, z: 1.25 } }),
      // Tail: a thin taper trailing down and back.
      part(
        tube(
          [
            [0, 0, 3.6, 2.6],
            [0, 1.2, 1.2, 1.6],
            [0, 2.4, -1.6, 0.5],
          ],
          8,
        ),
        [0, 0, 0],
        PAL.crystalDeep,
      ),
      // Team-coloured collar ring, the ownership cue.
      part(prism(6.6, 1.3, 12), [0, 0, 9.4], PAL.runeTeam),
      // Three orbiting motes at different radii and heights.
      part(sph(1.7, 8), [7.4, 0, 12.8], PAL.crystalHot),
      part(sph(1.3, 8), [-5.2, 5.4, 7.4], PAL.aether),
      part(sph(1.1, 8), [-3.8, -5.6, 15.2], PAL.crystalHot),
      // A faint halo disc to sell the glow at small sizes.
      part(prism(8.4, 0.5, 14), [0, 0, 9.2], PAL.aether),
    ],
  };
}

// ================================================================================================
// IMP SWARMLING — hunched biped. The silhouette plan: a large head with two swept horns over a
// compact body, with arms so long they nearly touch the ground.
// ================================================================================================
function impSwarmling(): Assembly {
  return {
    parts: [
      // ---- legs: short, bent, digitigrade (thigh -> shin -> foot)
      part(tube([[0, 0, 9.5, 2.4], [0.6, 0.4, 5.4, 1.9], [0.4, 1.4, 1.6, 1.5]], 7), [-3.4, 0.6, 0], PAL.hideDeep),
      part(tube([[0, 0, 9.5, 2.4], [-0.6, 0.4, 5.4, 1.9], [-0.4, 1.4, 1.6, 1.5]], 7), [3.4, 0.6, 0], PAL.hideDeep),
      part(bbox(3.6, 3.0, 6.0, 0.8), [-3.4, 2.0, 0.9], PAL.hideDeep),
      part(bbox(3.6, 3.0, 6.0, 0.8), [3.4, 2.0, 0.9], PAL.hideDeep),
      // ---- hips
      part(bbox(8.4, 6.0, 5.2, 1.4, 0.9), [0, 0, 9.0], PAL.hide),
      // ---- torso: barrel that leans forward, layered belly plate
      part(tube([[0, 0, 10.5, 4.6], [0, 0.3, 14.0, 5.6], [0, 0.5, 17.6, 5.2]], 12), [0, 0, 0], PAL.hide),
      part(plate(7.4, 6.0, 6.4, 1.2), [0, -4.4, 11.4], PAL.belly),
      // ---- shoulders: rounded masses, wider than the torso (reads as hunched)
      part(cap(3.2, 6.4, 10), [-5.6, 0.6, 17.2], PAL.hide, { rotZ: Math.PI / 2 }),
      part(cap(3.2, 6.4, 10), [5.6, 0.6, 17.2], PAL.hide, { rotZ: Math.PI / 2 }),
      // ---- arms: elbow bends outward, then forearm reaches down almost to the ground
      part(tube([[-2.0, 0, 16.4, 2.5], [-5.4, 0.8, 11.6, 2.0], [-6.6, 2.4, 6.0, 1.7]], 7), [0, 0, 0], PAL.hide),
      part(tube([[2.0, 0, 16.4, 2.5], [5.4, 0.8, 11.6, 2.0], [6.6, 2.4, 6.0, 1.7]], 7), [0, 0, 0], PAL.hide),
      // claws: three small tapered plates per hand
      ...[-1, 1].flatMap((s) =>
        [-1, 0, 1].map((k) =>
          part(plate(1.2, 0.25, 3.4, 0.9), [s * 6.6 + k * 1.3, 2.6, 4.6], PAL.boneDeep, { rotX: 0.25 }),
        ),
      ),
      // ---- head: big relative to the body, wide brow, small jaw
      part(bbox(9.0, 7.4, 7.2, 1.8, 0.92), [0, 1.6, 18.4], PAL.hide),
      part(bbox(7.2, 3.0, 5.2, 1.2), [0, 3.6, 17.4], PAL.hideDeep),
      // brow ridge
      part(bbox(8.6, 1.8, 2.0, 0.6), [0, -2.6, 21.6], PAL.hideLit, { rotX: -0.16 }),
      // ---- horns: swept back and up, the single strongest silhouette cue
      part(tube([[0, 0, 0, 2.0], [-0.9, 1.6, 3.0, 1.3], [-1.7, 3.4, 5.4, 0.4]], 7), [-3.4, 1.2, 21.2], PAL.bone),
      part(tube([[0, 0, 0, 2.0], [0.9, 1.6, 3.0, 1.3], [1.7, 3.4, 5.4, 0.4]], 7), [3.4, 1.2, 21.2], PAL.bone),
      // ---- eyes: team-coloured, set under the brow
      part(sph(1.35, 8), [-2.1, -3.4, 20.6], PAL.eyeTeam),
      part(sph(1.35, 8), [2.1, -3.4, 20.6], PAL.eyeTeam),
      // ---- team sash across the chest (plate stands vertically; no rotation needed)
      part(plate(9.2, 7.6, 2.4, 1.0), [0, -4.6, 13.2], PAL.trimTeam),
      part(bbox(9.0, 4.6, 1.4, 0.4), [0, 0, 9.4], PAL.leather),
      // ---- tail
      part(tube([[0, 0, 0, 1.9], [0, -3.0, -1.2, 1.3], [0, -6.2, -1.0, 0.4]], 7), [0, -3.4, 9.6], PAL.hideDeep),
    ],
  };
}

// ================================================================================================
// ARCANE ARCHER — upright, tall, narrow. The read is the BOW: a big asymmetric arc held out to one
// side, plus a pointed hood.
// ================================================================================================
function arcaneArcher(): Assembly {
  return {
    parts: [
      // legs
      part(tube([[0, 0, 10.0, 2.2], [0.2, 0, 5.0, 1.7], [0, 0, 1.2, 1.5]], 7), [-2.4, 0, 0], PAL.robeDeep),
      part(tube([[0, 0, 10.0, 2.2], [-0.2, 0, 5.0, 1.7], [0, 0, 1.2, 1.5]], 7), [2.4, 0, 0], PAL.robeDeep),
      part(bbox(3.4, 3.6, 6.4, 0.8), [-2.4, 1.0, 0.9], PAL.leather),
      part(bbox(3.4, 3.6, 6.4, 0.8), [2.4, 1.0, 0.9], PAL.leather),
      // robed torso: slim, with a clear waist — a barrel here reads as a ball, not a body
      part(bbox(7.0, 5.2, 8.6, 1.6, 0.82), [0, 0, 10.4], PAL.robe),
      // Skirt: WIDENS DOWNWARD from the waist to a flat hem. This is the silhouette cue that says
      // "person in a robe" rather than "sphere with a head on it" — the hem must be a hard edge.
      part(tube([[0, 0, 9.4, 3.2], [0, 0, 6.0, 4.6], [0, 0, 2.6, 5.2], [0, 0, 1.4, 5.2]], 12), [0, 0, 0], PAL.robeLit),
      // hem band: darker ring at the very bottom, so the robe terminates cleanly on the ground
      part(cyl(5.4, 5.4, 1.2, 12), [0, 0, 1.2], PAL.robeDeep),
      // chest armour plate + team sash
      part(bbox(6.2, 2.2, 4.6, 0.9), [0, -3.4, 15.0], PAL.steel),
      part(plate(7.8, 6.4, 2.6, 1.0), [0, -4.2, 11.0], PAL.trimTeam),
      // shoulders
      part(cap(2.3, 4.6, 9), [-4.2, 0, 17.4], PAL.robeLit, { rotZ: Math.PI / 2 }),
      part(cap(2.3, 4.6, 9), [4.2, 0, 17.4], PAL.robeLit, { rotZ: Math.PI / 2 }),
      // head + pointed hood
      part(sph(3.1, 10), [0, 0, 19.8], PAL.bone),
      part(cone(3.6, 7.6, 9), [0, 0.3, 20.6], PAL.robeLit, { rotX: 0.14 }),
      part(bbox(4.4, 1.2, 3.0, 0.5), [0, -2.4, 19.4], PAL.robeDeep),
      // ---- the bow: a tall asymmetric arc on the left, made of three tapered segments
      part(tube([[0, 0, -6.4, 0.55], [2.0, 0, 0, 0.9], [2.2, 0, 5.0, 0.75], [0, 0, 10.4, 0.45]], 7), [-6.4, 0, 12.6], PAL.wood),
      // bow string: must span exactly between the two limb tips (local z -6.4 and +10.4 at x 0), or it
      // renders as a stick floating beside the character
      part(tube([[0, 0, -6.4, 0.14], [0, 0, 10.4, 0.14]], 4), [-6.4, 0, 12.6], PAL.bone),
      // ---- quiver on the back
      part(cyl(1.9, 1.7, 7.0, 8), [3.6, 3.0, 12.0], PAL.leather),
      ...[-1, 0, 1].map((k) =>
        part(cyl(0.22, 0.22, 4.4, 5), [3.6 + k * 1.1, 3.0, 18.4], PAL.woodLit, { rotZ: 0.1 * k }),
      ),
      // eyes
      part(sph(0.9, 6), [-1.3, -2.6, 20.0], PAL.eyeTeam),
      part(sph(0.9, 6), [1.3, -2.6, 20.0], PAL.eyeTeam),
    ],
  };
}

// ================================================================================================
// STONE GOLEM — the silhouette plan is MASS low down: enormous forearms, a boulder torso, and a tiny
// head sunk between two shoulder rocks. Tall thin legs would read as "robot"; short thick ones read
// as "golem".
// ================================================================================================
function stoneGolem(): Assembly {
  // DESIGN: three masses only — a huge left forearm, a huge right forearm, and a boulder torso
  // between them. Everything else is subordinate. The previous attempt added knuckle ridges, brow
  // bands, moss and a second torso block, which produced a noisy blob at sprite size. Detail that
  // does not serve the big read is what makes low-poly art look unfinished.
  //
  // Proportions: shoulders wide, waist narrow, legs short and thick, head TINY.
  const parts: Part[] = [];

  // ---- legs: two thick tapered columns, feet merged into the leg so there is no ankle seam
  for (const sx of [-1, 1] as const) {
    parts.push(
      part(tube([[0, 0, 9.0, 4.6], [0.7 * sx, 0, 4.4, 4.0], [0.4 * sx, 0, 0.8, 4.4]], 10), [sx * 5.8, 0, 0], PAL.rockDeep),
    );
    parts.push(part(bbox(7.0, 8.0, 4.0, 1.6), [sx * 5.8, 0, 0.8], PAL.rockDeep));
  }

  // ---- hips
  parts.push(part(bbox(15.0, 9.0, 5.6, 2.2, 0.94), [0, 0, 8.6], PAL.rock));

  // ---- torso: one big boulder, wider than the hips, leaning slightly forward
  parts.push(part(bbox(18.0, 11.0, 13.0, 3.0, 0.88), [0, -0.6, 13.4], PAL.rock));
  // A single bright chest plane reads as a lit front face; no extra plates needed.
  parts.push(part(bbox(11.0, 1.6, 7.0, 0.6), [0, -6.4, 17.4], PAL.rockLit));

  // ---- shoulders: two boulders, clearly proud of the torso
  parts.push(part(sph(6.0, 12), [-9.4, -0.4, 20.6], PAL.rockLit));
  parts.push(part(sph(6.0, 12), [9.4, -0.4, 20.6], PAL.rockLit));

  // ---- arms: the defining feature. Upper arm short; forearm LONG and thicker than the upper arm,
  //      hanging down past the knee. One tapered tube per arm, no elbow seam.
  for (const sx of [-1, 1] as const) {
    parts.push(
      part(
        tube(
          [
            [0, 0, 0, 3.2],
            [sx * 1.4, 0, -4.0, 3.6],
            [sx * 2.0, 0, -9.0, 3.9],
            [sx * 2.0, 0, -12.6, 3.4],
          ],
          10,
        ),
        [sx * 9.8, 0, 19.0],
        PAL.rock,
      ),
    );
    // fist: a single bevelled block, wider than the forearm
    parts.push(part(bbox(7.6, 7.8, 7.6, 1.8), [sx * 11.8, 0, 3.4], PAL.rockDeep));
  }

  // ---- head: TINY, sunk between the shoulders. This is what makes the mass read as a golem rather
  //      than a person in armour.
  parts.push(part(bbox(5.2, 4.6, 4.4, 1.2, 0.9), [0, -0.8, 25.8], PAL.rockDeep));
  parts.push(part(sph(1.5, 8), [-1.5, -3.2, 27.0], PAL.eyeTeam));
  parts.push(part(sph(1.5, 8), [1.5, -3.2, 27.0], PAL.eyeTeam));

  // ---- team-colour chest rune: one bold shape, centred, big enough to read at 20 px
  parts.push(part(prism(4.2, 1.4, 6), [0, -7.2, 20.0], PAL.runeTeam, { rotX: Math.PI / 2 }));

  // ---- moss: ONE patch, on one shoulder, asymmetric. Two patches read as noise.
  parts.push(part(sph(4.4, 10), [-9.4, -3.0, 24.4], PAL.rockMoss, { scale: { x: 1.25, y: 1.0, z: 0.4 } }));

  return { parts };
}

// ================================================================================================
// STORM CASTER — robed wizard. Silhouette plan: a narrow cone of robe topped by a high collar, with
// three orbiting orbs that break the outline.
// ================================================================================================
function stormCaster(): Assembly {
  return {
    parts: [
      // robe: a cone with a slight flare
      part(tube([[0, 0, 0, 7.4], [0, 0, 3.0, 6.6], [0, 0, 9.0, 4.8], [0, 0, 14.0, 3.8]], 14), [0, 0, 0], PAL.robeDeep),
      // hem band (team)
      part(prism(7.6, 1.4, 14), [0, 0, 1.2], PAL.trimTeam),
      // torso / shoulders under the robe
      part(bbox(7.0, 6.4, 5.6, 1.6, 0.8), [0, 0, 14.4], PAL.robe),
      // high collar: a flared tube around the neck — the identifying shape
      part(tube([[0, 0, 0, 4.2], [0, 0, 3.4, 5.6]], 12), [0, 0, 17.6], PAL.robeLit, { scale: { x: 1, y: 1, z: 1 } }),
      // head inside the collar
      part(sph(2.8, 10), [0, 0, 20.4], PAL.bone),
      part(sph(0.95, 6), [-1.2, -2.4, 20.6], PAL.eyeTeam),
      part(sph(0.95, 6), [1.2, -2.4, 20.6], PAL.eyeTeam),
      // pointed hat
      part(cone(4.4, 9.0, 9), [0, 0, 22.2], PAL.robeDeep, { rotX: 0.1 }),
      part(prism(4.2, 0.9, 9), [0, 0, 23.0], PAL.trimTeam),
      // staff: tapered shaft with a claw holding a crystal
      part(tube([[0, 0, 0, 0.85], [0.4, 0, 11.0, 0.7], [0.8, 0, 22.0, 0.55]], 7), [7.4, 0, 1.4], PAL.wood),
      part(sph(2.6, 10), [8.4, 0, 25.0], PAL.crystalHot),
      ...[-1, 1].map((s) =>
        part(tube([[0, 0, 0, 0.42], [0.5 * s, 0, 2.4, 0.2]], 5), [8.4, 0, 23.2], PAL.brass, { rotZ: s * 0.5 }),
      ),
      // ---- three orbiting orbs at different radii, giving the outline movement
      part(sph(2.1, 9), [-8.6, -1.6, 21.4], PAL.crystal),
      part(sph(1.6, 9), [5.2, -7.4, 15.0], PAL.aether),
      part(sph(1.3, 9), [-3.0, 7.6, 26.2], PAL.crystalHot),
      // a couple of floating rune shards
      part(prism(0.9, 3.0, 4), [-5.4, 4.4, 12.6], PAL.aether, { rotZ: 0.4 }),
      part(prism(0.7, 2.4, 4), [4.6, 5.2, 10.2], PAL.crystal, { rotZ: -0.3 }),
    ],
  };
}

export const PILOT_UNITS: Record<string, Assembly> = {
  wisp: wisp(),
  imp_swarmling: impSwarmling(),
  arcane_archer: arcaneArcher(),
  stone_golem: stoneGolem(),
  storm_caster: stormCaster(),
};

// ================================================================================================
// BUILDINGS
// ================================================================================================

/** Shared plinth: a bevelled stone base every structure sits on. */
function plinth(w: number, d: number, h = 3.0): Part[] {
  return [
    part(bbox(w + 4, d + 4, h * 0.55, 1.6, 0.94), [0, 0, 0], PAL.rockDeep),
    part(bbox(w + 1.5, d + 1.5, h, 1.4, 0.96), [0, 0, h * 0.36], PAL.rock),
  ];
}

// ================================================================================================
// SANCTUM — tiered command tower. The previous version collapsed into a "dome" because its tiers were
// wide and closely stacked. Here each tier is markedly narrower with a visible setback ring between,
// and four buttress fins run up the corners to give vertical structure.
// ================================================================================================
function sanctum(): Assembly {
  const parts: Part[] = [...plinth(44, 44, 3.4)];
  // base block
  parts.push(part(bbox(40, 40, 10, 2.4, 0.9), [0, 0, 3.0], PAL.rock));
  parts.push(part(bbox(42, 42, 2.0, 0.8, 0.98), [0, 0, 12.4], PAL.rockLit));
  // tier 1
  parts.push(part(cyl(15, 14, 13, 14), [0, 0, 14.4], PAL.violet));
  parts.push(part(prism(14.2, 2.2, 14), [0, 0, 20.0], PAL.crystalHot));
  parts.push(part(cyl(16, 15, 1.6, 14), [0, 0, 27.2], PAL.rockLit));
  // tier 2
  parts.push(part(cyl(11, 10, 13, 12), [0, 0, 28.8], PAL.violetLit));
  parts.push(part(prism(10.2, 2.0, 12), [0, 0, 34.4], PAL.crystalHot));
  parts.push(part(cyl(12, 11, 1.4, 12), [0, 0, 41.2], PAL.rockLit));
  // tier 3 — crown drum
  parts.push(part(cyl(7.8, 7.0, 12, 10), [0, 0, 42.6], PAL.violet));
  parts.push(part(prism(7.2, 1.8, 10), [0, 0, 48.0], PAL.aether));
  // four buttress fins up the corners of the base block
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(
      part(bbox(3.2, 5.2, 26.0, 0.9, 0.55), [sx * 17.4, sy * 17.4, 3.2], PAL.rockLit, { rotY: 0 }),
    );
    // brass cap on each fin
    parts.push(part(bbox(3.8, 5.8, 2.2, 0.7), [sx * 17.4, sy * 17.4, 29.0], PAL.brass));
  }
  // crown: obelisk + orb
  parts.push(part(prism(4.6, 17, 6), [0, 0, 51.0], PAL.rockLit));
  parts.push(part(sph(6.4, 12), [0, 0, 71.4], PAL.crystalHot));
  parts.push(part(prism(9.4, 1.2, 10), [0, 0, 63.0], PAL.aether));
  // entrance: a lit arch recessed into the front face (the base is 40 deep, so its face is at y=-20;
  // the arch must sit ON that plane, not beyond it)
  parts.push(part(bbox(13.0, 1.6, 12.0, 0.9), [0, -19.6, 3.4], PAL.rockLit));
  parts.push(part(bbox(9.6, 1.0, 9.0, 0.5), [0, -20.2, 5.2], PAL.crystalHot));
  // banners on the two front corner buttresses, hung flat against the fin faces so they read as
  // cloth attached to the building rather than slabs floating beside it
  for (const s of [-1, 1] as const) {
    parts.push(part(cyl(0.55, 0.55, 15, 6), [s * 17.4, -2.9, 24.0], PAL.wood));
    // `plate` already builds a vertically-standing banner (z: 0..h). The previous `rotX: PI/2` laid
    // the cloth flat, which read as a panel floating beside the building.
    parts.push(part(plate(1.0, 1.0, 8.4, 7.0), [s * 17.4, -4.4, 15.0], PAL.bannerTeam));
  }
  return { parts };
}

// ================================================================================================
// ARCANE SENTRY — a compact tripod with a crystal head. The previous one had a floating ring; this
// one has three angled legs meeting a bevelled pivot, with the crystals growing out of it.
// ================================================================================================
function arcaneSentry(): Assembly {
  const parts: Part[] = [...plinth(24, 24, 2.2)];
  // three legs, splayed
  for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const dx = Math.cos(a) * 6.0;
    const dy = Math.sin(a) * 6.0;
    parts.push(part(tube([[0, 0, 0, 1.7], [dx * 0.4, dy * 0.4, 6.0, 1.3], [dx, dy, 13.0, 1.0]], 7), [0, 0, 2.0], PAL.steelDeep));
    // foot pad
    parts.push(part(bbox(3.4, 3.4, 1.4, 0.5), [dx, dy, 2.6], PAL.steelDeep));
  }
  // pivot housing
  parts.push(part(sph(4.2, 12), [0, 0, 14.6], PAL.steel));
  parts.push(part(prism(4.6, 1.0, 12), [0, 0, 14.4], PAL.brass));
  // crystal head: ONE dominant shard with two smaller flanking it, tilted outward so the cluster has
  // a fan silhouette instead of a single point.
  parts.push(part(prism(2.6, 16.0, 6), [0, 0, 17.6], PAL.crystal));
  parts.push(part(prism(1.9, 11.0, 6), [-3.6, 0.6, 17.2], PAL.crystal, { rotZ: 0.36 }));
  parts.push(part(prism(1.9, 11.0, 6), [3.6, -0.6, 17.2], PAL.crystal, { rotZ: -0.36 }));
  parts.push(part(prism(1.5, 8.0, 6), [0, -3.4, 17.4], PAL.crystal, { rotX: 0.34 }));
  parts.push(part(prism(1.5, 8.0, 6), [0, 3.4, 17.4], PAL.crystal, { rotX: -0.34 }));
  parts.push(part(sph(2.2, 9), [0, 0, 34.2], PAL.crystalHot));
  // team ring at the pivot
  parts.push(part(prism(5.6, 1.2, 12), [0, 0, 17.2], PAL.runeTeam));
  return { parts };
}

// ================================================================================================
// STONE WALL — a staggered barrier. Individual blocks with slight rotation and height variation, so
// it reads as masonry rather than a single extruded slab.
// ================================================================================================
function stoneWall(): Assembly {
  // A wall must read as a BARRIER: wide, moderately tall, and thin. Blocks are staggered row by row
  // with slight height and rotation variation so it reads as masonry, not one extrude.
  //
  // NOTE on arguments: `bbox(width, depth, height)`. An earlier version passed the wall's thickness in
  // the height slot, producing 11-unit-deep blocks that were only 4.6 tall — a flat slab lying down.
  const parts: Part[] = [];
  const WALL_W = 30;
  const WALL_D = 5.0; // thin: this is a barrier, not a bunker
  const blockH = 4.4;
  const rows = 4;

  // footing
  parts.push(part(bbox(WALL_W + 2, WALL_D + 2.4, 1.8, 0.6), [0, 0, 0], PAL.rockDeep));

  for (let r = 0; r < rows; r++) {
    const count = r === rows - 1 ? 3 : 4;
    const span = WALL_W / count;
    const z = 1.8 + r * blockH;
    const offset = r % 2 === 0 ? 0 : span * 0.5;
    for (let i = 0; i < count; i++) {
      const x = -WALL_W / 2 + span * (i + 0.5) + offset;
      if (x + span * 0.5 > WALL_W / 2 + 0.5) continue;
      const w = span * 0.88;
      // Slight per-block height variation, so the top course is not a ruler line.
      const h = blockH * (0.9 + (((i * 7 + r * 3) % 5) / 5) * 0.14);
      parts.push(
        part(bbox(w, WALL_D, h, 0.55), [x, 0, z], r === rows - 1 ? PAL.rockLit : PAL.rock, {
          rotZ: ((((i + r) % 3) - 1) * 0.018),
        }),
      );
    }
  }

  // coping course: wider than the wall, so it casts a lip
  for (let i = 0; i < 4; i++) {
    parts.push(
      part(bbox(WALL_W / 4 - 0.4, WALL_D + 2.0, 1.5, 0.5), [-WALL_W / 2 + (WALL_W / 4) * (i + 0.5), 0, 1.8 + rows * blockH], PAL.rockLit, {
        rotZ: (i - 1.5) * 0.012,
      }),
    );
  }

  // team banner hanging on the front face, plus its pole (plate stands vertically already)
  parts.push(part(cyl(0.5, 0.5, 13, 6), [0, -(WALL_D / 2 + 0.6), 1.8], PAL.woodLit));
  parts.push(part(plate(5.4, 4.6, 8.0, 0.5), [0, -(WALL_D / 2 + 1.0), 6.0], PAL.bannerTeam));

  // moss creeping up one end
  parts.push(part(bbox(7.0, WALL_D + 1.4, 3.4, 0.8), [-11.0, 0, 1.6], PAL.rockMoss));
  return { parts };
}

// ================================================================================================
// MANA NODE — a crystal cluster erupting from a rock base. Replaces the plain teal cube.
// ================================================================================================
function manaNode(): Assembly {
  const parts: Part[] = [];
  // rock base
  parts.push(part(sph(9.0, 10), [0, 0, 1.4], PAL.rockDeep, { scale: { x: 1.15, y: 1.15, z: 0.5 } }));
  parts.push(part(sph(6.4, 9), [-5.4, 3.2, 1.8], PAL.rock, { scale: { x: 1, y: 1, z: 0.6 } }));
  parts.push(part(sph(5.4, 9), [5.6, -3.0, 1.6], PAL.rock, { scale: { x: 1, y: 1, z: 0.6 } }));
  // main crystal: a tall hexagonal shard with a bright tip
  parts.push(part(prism(3.6, 15.0, 6), [0, 0, 3.0], PAL.crystal));
  parts.push(part(prism(2.2, 5.4, 6), [0, 0, 17.6], PAL.crystalHot));
  // satellite shards
  parts.push(part(prism(2.4, 9.6, 6), [-5.0, 2.2, 3.0], PAL.crystal, { rotZ: 0.42, rotX: 0.2 }));
  parts.push(part(prism(2.0, 7.6, 6), [5.2, -1.8, 2.8], PAL.crystal, { rotZ: -0.46, rotX: -0.18 }));
  parts.push(part(prism(1.6, 5.8, 6), [3.0, 4.6, 2.6], PAL.crystalDeep, { rotZ: -0.3 }));
  parts.push(part(prism(1.4, 5.0, 6), [-3.6, -4.2, 2.4], PAL.crystalDeep, { rotZ: 0.34 }));
  // floating motes
  parts.push(part(sph(1.1, 8), [-3.4, -5.6, 12.0], PAL.aether));
  parts.push(part(sph(0.9, 8), [5.0, 4.0, 15.0], PAL.crystalHot));
  return { parts };
}

export const PILOT_BUILDINGS: Record<string, Assembly> = {
  sanctum: sanctum(),
  arcane_sentry: arcaneSentry(),
  stone_wall: stoneWall(),
  mana_node: manaNode(),
  // A "defense spire": the Frost Spire, which was one of the broken-looking ones.
  frost_spire: frostSpire(),
};

function frostSpire(): Assembly {
  // A spire must be NARROW AND TALL. Measured at 34 wide x 36 tall this read as a pyramid, which is
  // why it looked like the Sentry. Narrowed the base and raised the shard stack.
  const parts: Part[] = [...plinth(26, 26, 2.4)];
  // stone footing
  parts.push(part(cyl(8, 7, 8, 12), [0, 0, 2.4], PAL.rock));
  parts.push(part(prism(8.4, 1.2, 12), [0, 0, 9.8], PAL.rockLit));
  // Tall narrow shard stack: the central shard dominates and the satellites lean IN toward it.
  parts.push(part(prism(4.6, 30, 6), [0, 0, 10.6], PAL.frostCore, { rotZ: 0.05 }));
  parts.push(part(prism(3.0, 20, 6), [-4.2, 1.6, 11.0], PAL.crystal, { rotZ: 0.30 }));
  parts.push(part(prism(2.8, 18, 6), [4.4, -1.2, 10.8], PAL.crystal, { rotZ: -0.28 }));
  parts.push(part(prism(2.2, 13, 6), [1.0, 4.6, 12.0], PAL.crystal, { rotZ: -0.16 }));
  parts.push(part(cone(2.0, 11.0, 7), [0, 0, 40.0], PAL.frostCore));
  // halo ring near the top, not the middle
  parts.push(part(prism(6.4, 0.8, 12), [0, 0, 30.0], PAL.frostCore));
  // team band on the base
  parts.push(part(prism(9.2, 1.2, 12), [0, 0, 6.4], PAL.runeTeam));
  return { parts };
}
