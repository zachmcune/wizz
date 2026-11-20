// THE 26 ASSETS ADDED IN THE FULL PASS — 9 units and 17 structures.
//
// 100% code-authored geometry via `mesh2.ts` + `shapes.ts`. No images, no generation.
//
// Every asset names a SILHOUETTE PLAN: the one shape that must survive at 22 px. Two constraints are
// checked mechanically by `tests/art-roster.test.ts` because both were real defects in the pilot:
//
//   1. DEPTH >= 52% of width. A model that is much wider than deep collapses into a thin slab at its
//      side facings; the Stone Golem shipped at 31 wide x 14 deep and did exactly that.
//   2. FRONT/BACK ASYMMETRY. A front-to-back symmetric model gives no clue which way it faces.
//
// Structures follow three extra rules: a deliberate HEIGHT CLASS (so the skyline reads), a UNIQUE TOP
// (the top third is what the player identifies), and a TEAM MARKER that is never buried.
import type { Assembly, Part } from './mesh2';
import { PAL } from './palette2';
import { part, bbox, tube, plate, sph, cone, cyl, prism, plinth, roundPlinth, bodyBlock } from './shapes';

// ================================================================================================
// UNITS
// ================================================================================================

/**
 * MANA WEAVER — support caster. SILHOUETTE: a hovering spindle of two ring-discs. No legs, no hem.
 *
 * Deliberately unlike the Storm Caster (which is a hem + hat + staff): the Weaver is two wide rings
 * around a narrow waist, which reads as a floating construct rather than a person.
 */
function manaWeaver(): Assembly {
  const parts: Part[] = [];
  // hovering base: a downward-tapering spindle, so it clearly does not stand on the ground
  parts.push(part(cyl(4.6, 1.4, 7.0, 12), [0, 0, 1.6], PAL.robeDeep));
  parts.push(part(prism(4.4, 1.2, 12), [0, 0, 8.2], PAL.trimTeam));
  // lower ring disc
  parts.push(part(cyl(6.6, 6.2, 2.4, 14), [0, 0, 9.4], PAL.robe));
  parts.push(part(cyl(6.8, 6.8, 0.9, 14), [0, 0, 9.2], PAL.aether));
  // narrow waist: the pinch that makes this read as two tiers rather than one column
  parts.push(part(cyl(3.0, 3.0, 5.0, 12), [0, 0, 11.8], PAL.robeDeep));
  // upper ring disc
  parts.push(part(cyl(5.4, 5.0, 2.0, 14), [0, 0, 16.8], PAL.robe));
  parts.push(part(cyl(5.6, 5.6, 0.8, 14), [0, 0, 16.6], PAL.aether));
  // head + hood, offset FORWARD so facing is readable
  parts.push(part(sph(2.6, 10), [0, -1.4, 20.4], PAL.bone));
  parts.push(part(cone(3.4, 6.4, 9), [0, 0.6, 20.8], PAL.robeLit, { rotX: 0.18 }));
  parts.push(part(sph(0.9, 6), [-1.1, -3.4, 20.8], PAL.eyeTeam));
  parts.push(part(sph(0.9, 6), [1.1, -3.4, 20.8], PAL.eyeTeam));
  // three floating rune shards on a rising diagonal
  parts.push(part(prism(1.2, 4.0, 5), [-6.6, -1.0, 14.4], PAL.crystal, { rotZ: 0.5 }));
  parts.push(part(prism(1.0, 3.2, 5), [6.2, 0.6, 18.6], PAL.aether, { rotZ: -0.45 }));
  parts.push(part(prism(0.8, 2.6, 5), [-4.4, 3.6, 23.0], PAL.crystalHot, { rotZ: 0.3 }));
  return { parts };
}

/**
 * RIFT FAMILIAR — fast scout. SILHOUETTE: a low arrowhead with swept wings.
 *
 * The only wide-and-low winged shape in the roster, so it is the easiest unit to identify at 22 px.
 */
function riftFamiliar(): Assembly {
  const parts: Part[] = [];
  // body: flattened wedge, nose forward (-y)
  parts.push(part(bbox(6.0, 12.0, 4.4, 1.6, 0.55), [0, -1.0, 8.0], PAL.robeDeep));
  // swept wings
  for (const sx of [-1, 1] as const) {
    parts.push(part(plate(12.0, 4.0, 1.0, 6.0), [sx * 6.0, 1.6, 8.6], PAL.robe, { rotZ: (sx * Math.PI) / 2, rotY: sx * -0.34 }));
    parts.push(part(cone(1.1, 3.4, 6), [sx * 11.4, 3.4, 8.6], PAL.crystal, { rotZ: sx * 0.9 }));
  }
  // head: sharp beak projecting FORWARD, the facing cue
  parts.push(part(bbox(3.4, 4.2, 3.4, 1.0, 0.6), [0, -6.6, 8.6], PAL.robeLit));
  parts.push(part(cone(1.5, 3.6, 7), [0, -9.4, 8.2], PAL.bone, { rotX: -Math.PI / 2 }));
  parts.push(part(sph(0.9, 6), [-1.5, -7.6, 9.6], PAL.eyeTeam));
  parts.push(part(sph(0.9, 6), [1.5, -7.6, 9.6], PAL.eyeTeam));
  // tail fin, swept up and back
  parts.push(part(plate(5.0, 2.0, 0.8, 4.0), [0, 6.0, 9.4], PAL.robeLit, { rotX: 0.6 }));
  // team rune on the back
  parts.push(part(prism(2.0, 0.9, 6), [0, 1.0, 10.6], PAL.runeTeam, { rotX: Math.PI / 2 }));
  return { parts };
}

/**
 * RIFT SKIMMER — flying harass. SILHOUETTE: a saucer with a raised dorsal fin.
 *
 * Built from a different primitive family from the Familiar (rings, not plates) so the two flyers
 * cannot be confused even in silhouette.
 */
/**
 * RIFT SKIMMER — a flying saucer. HOVERS, and must read as flying.
 *
 * Its hull starts at z = 22 rather than z = 7. A grounded-anchor saucer sat right on its own shadow and looked
 * like a dropped plate; the deliberate clearance plus the smaller shadow is what makes "this one flies" legible at
 * phone zoom. The dorsal fin is kept because it breaks the disc silhouette, which is the only way a saucer reads as
 * a unit rather than a marker.
 */
function riftSkimmer(): Assembly {
  const parts: Part[] = [];
  const LIFT = 15; // hover clearance, in world units
  // saucer hull: three stacked discs, widest in the middle
  parts.push(part(cyl(4.0, 8.2, 2.4, 16), [0, 0, 7.0 + LIFT], PAL.robeDeep));
  parts.push(part(cyl(8.2, 8.2, 2.2, 16), [0, 0, 9.4 + LIFT], PAL.robe));
  parts.push(part(cyl(8.2, 4.4, 2.2, 16), [0, 0, 11.6 + LIFT], PAL.robeLit));
  // team ring around the rim
  parts.push(part(cyl(8.8, 8.8, 1.6, 16), [0, 0, 9.6 + LIFT], PAL.runeTeam));
  // dorsal fin: the vertical spike that makes the profile unmistakable
  parts.push(part(plate(9.0, 2.0, 0.8, 7.0), [0, 3.0, 12.6 + LIFT], PAL.robeDeep, { rotX: 0.42 }));
  parts.push(part(prism(1.4, 2.0, 5), [0, -1.4, 14.2 + LIFT], PAL.crystalHot));
  // underslung weapon pods
  parts.push(part(sph(2.0, 9), [-6.2, -1.2, 7.4 + LIFT], PAL.steel));
  parts.push(part(sph(2.0, 9), [6.2, -1.2, 7.4 + LIFT], PAL.steel));
  parts.push(part(cone(1.3, 3.0, 7), [-6.2, -3.4, 6.6 + LIFT], PAL.crystal, { rotX: -Math.PI / 2 }));
  parts.push(part(cone(1.3, 3.0, 7), [6.2, -3.4, 6.6 + LIFT], PAL.crystal, { rotX: -Math.PI / 2 }));
  return { parts };
}

/**
 * SIEGE BEHEMOTH — siege walker. SILHOUETTE: a domed carapace on four splayed legs with a long cannon
 * projecting forward. The largest mobile thing on the board.
 */
function siegeBehemoth(): Assembly {
  const parts: Part[] = [];
  // four splayed legs, so it is a WALKER rather than a tank
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(tube([[0, 0, 11.0, 3.4], [1.2 * sx, 0.8 * sy, 6.0, 2.8], [2.0 * sx, 1.4 * sy, 1.4, 2.4]], 8), [sx * 9.0, sy * 7.0, 0], PAL.ironOld));
    parts.push(part(bbox(6.4, 6.4, 2.6, 1.2), [sx * 11.0, sy * 8.4, 1.2], PAL.ironOld));
    parts.push(part(tube([[0, 0, 0, 0.7], [0.6 * sx, 0.4 * sy, -4.0, 0.55]], 5), [sx * 7.4, sy * 6.0, 10.0], PAL.brass));
  }
  // hull
  parts.push(part(bbox(20.0, 16.0, 7.0, 2.2, 0.9), [0, 0, 12.0], PAL.ironOld));
  // domed carapace: the top of the read
  parts.push(part(sph(10.4, 14), [0, 0, 17.4], PAL.steelDeep, { scale: { x: 1.0, y: 0.86, z: 0.62 } }));
  parts.push(part(cyl(7.0, 7.0, 1.2, 14), [0, 0, 22.2], PAL.steel));
  // TEAM MARKER: a wide rune band plus a banner on the carapace, so a crowd of these is readable.
  parts.push(part(prism(7.4, 1.4, 12), [0, 0, 23.2], PAL.runeTeam));
  parts.push(part(bbox(9.0, 2.0, 3.2, 0.8), [0, 6.0, 21.4], PAL.bannerTeam));
  // cannon: long barrel projecting FORWARD. The facing cue and the identity.
  parts.push(part(bbox(6.2, 9.0, 6.2, 1.8), [0, -10.0, 14.0], PAL.steelDeep));
  parts.push(part(tube([[0, 0, 0, 2.6], [0, -10.0, 0.4, 2.2], [0, -18.0, 0.8, 2.0]], 12), [0, -12.0, 16.0], PAL.steel));
  parts.push(part(cyl(3.0, 3.0, 2.0, 12), [0, -31.0, 16.8], PAL.brass, { rotX: -Math.PI / 2 }));
  parts.push(part(cyl(2.0, 2.4, 1.4, 12), [0, -32.4, 16.8], PAL.emberCore, { rotX: -Math.PI / 2 }));
  // rear exhaust stacks (back asymmetry)
  parts.push(part(cyl(1.8, 1.6, 7.0, 9), [-6.0, 8.0, 19.0], PAL.ironOld));
  parts.push(part(cyl(1.8, 1.6, 7.0, 9), [6.0, 8.0, 19.0], PAL.ironOld));
  return { parts };
}

/**
 * THORNLING — cheap melee. SILHOUETTE: a low many-legged skitterer with a thorn crown.
 *
 * The horde unit: squat, wide and spiky, with nothing tall, so a group reads as NUMEROUS.
 */
function thornling(): Assembly {
  const parts: Part[] = [];
  // low segmented body: three overlapping bulbs, nose toward -y
  parts.push(part(sph(5.0, 10), [0, 3.0, 6.4], PAL.leafDeep, { scale: { x: 1.15, y: 1.0, z: 0.8 } }));
  parts.push(part(sph(5.6, 10), [0, -1.0, 6.8], PAL.leaf, { scale: { x: 1.2, y: 1.0, z: 0.85 } }));
  parts.push(part(sph(4.4, 10), [0, -5.6, 6.2], PAL.leafLit, { scale: { x: 1.05, y: 1.0, z: 0.8 } }));
  // six short splayed legs
  for (const sx of [-1, 1] as const) {
    for (const sy of [-4.0, 0.4, 4.4] as const) {
      parts.push(part(tube([[0, 0, 5.0, 1.5], [sx * 2.6, 0, 2.6, 1.1], [sx * 4.6, sy * 0.12, 0.4, 0.8]], 6), [sx * 3.2, sy, 1.2], PAL.leafDeep));
    }
  }
  // thorn crown: five spikes fanned across the back, the silhouette signature
  for (const [sx, tilt] of [
    [-1.0, -0.5],
    [-0.55, -0.25],
    [0, 0],
    [0.55, 0.25],
    [1.0, 0.5],
  ] as const) {
    parts.push(part(cone(1.1, 6.4, 6), [sx * 2.6, 1.4, 10.4], PAL.leafDeep, { rotZ: tilt }));
  }
  // mandibles + eyes, thrust forward
  parts.push(part(cone(1.0, 3.4, 6), [-2.0, -8.4, 6.4], PAL.boneDeep, { rotX: -1.2 }));
  parts.push(part(cone(1.0, 3.4, 6), [2.0, -8.4, 6.4], PAL.boneDeep, { rotX: -1.2 }));
  parts.push(part(sph(1.0, 6), [-1.9, -7.4, 7.6], PAL.eyeTeam));
  parts.push(part(sph(1.0, 6), [1.9, -7.4, 7.6], PAL.eyeTeam));
  // team band
  parts.push(part(prism(5.9, 1.0, 10), [0, -1.0, 8.4], PAL.trimTeam));
  return { parts };
}

/**
 * CINDER ACOLYTE — armoured melee. SILHOUETTE: a broad bruiser with OVERSIZED spiked pauldrons and a
 * brazier staff. The widest "top" of any unit, which is its identifier.
 */
function cinderAcolyte(): Assembly {
  const parts: Part[] = [];
  // heavy greaves
  for (const sx of [-1, 1] as const) {
    parts.push(part(tube([[0, 0, 8.6, 3.0], [0.4 * sx, 0, 4.4, 2.7], [0.2 * sx, 0, 1.0, 2.9]], 8), [sx * 3.8, 0, 0], PAL.ironOld));
    parts.push(part(bbox(5.4, 6.4, 2.6, 1.0), [sx * 3.8, -0.8, 1.0], PAL.steelDeep));
    parts.push(part(bbox(4.6, 5.0, 2.0, 0.8, 0.9), [sx * 3.8, -2.2, 5.2], PAL.steelDeep));
  }
  // hips + iron skirt
  parts.push(part(bbox(12.0, 9.0, 4.4, 1.6, 0.94), [0, 0, 8.4], PAL.ironOld));
  parts.push(part(cyl(7.0, 6.2, 4.0, 12), [0, 0, 10.0], PAL.steelDeep));
  // torso, tapered up so the chest is widest
  parts.push(part(bbox(15.0, 11.0, 9.0, 2.0, 0.82), [0, 0, 13.4], PAL.ironOld));
  parts.push(part(bbox(13.0, 9.0, 3.0, 1.2, 0.9), [0, -4.6, 16.0], PAL.steel));
  // ember core, the faction read
  parts.push(part(prism(3.4, 1.4, 6), [0, -5.8, 15.6], PAL.emberCore, { rotX: Math.PI / 2 }));
  // pauldrons: OVERSIZED and spiked. The strongest shape on the unit.
  for (const sx of [-1, 1] as const) {
    parts.push(part(sph(5.4, 10), [sx * 8.4, 0, 18.0], PAL.steel, { scale: { x: 1.1, y: 1.0, z: 0.9 } }));
    parts.push(part(cone(1.9, 5.6, 6), [sx * 9.6, 0, 21.4], PAL.steelLit, { rotZ: sx * 0.7 }));
    parts.push(part(cone(1.5, 4.0, 6), [sx * 7.0, -2.0, 21.0], PAL.steelLit, { rotZ: sx * 0.35 }));
  }
  // heavy gauntlets held low
  for (const sx of [-1, 1] as const) {
    parts.push(part(tube([[0, 0, 0, 2.8], [sx * 1.2, -0.4, -4.4, 2.5], [sx * 1.6, -0.6, -8.4, 2.3]], 7), [sx * 8.4, 0, 16.4], PAL.ironOld));
    parts.push(part(bbox(5.6, 6.0, 5.0, 1.4), [sx * 10.0, -0.6, 6.4], PAL.steelDeep));
  }
  // TEAM MARKER: a bold banner on the back plus shoulder trim. This unit had ZERO team-tinted
  // geometry, so in a massed fight both sides looked identical. Every unit must carry a clear
  // ownership cue.
  parts.push(part(plate(5.4, 4.6, 9.0, 9.0), [0, 4.2, 12.0], PAL.bannerTeam));
  parts.push(part(bbox(16.0, 1.6, 1.8, 0.6), [0, -4.8, 17.6], PAL.trimTeam));
  for (const sx of [-1, 1] as const) {
    parts.push(part(prism(3.0, 1.0, 8), [sx * 8.4, 0, 19.6], PAL.trimTeam));
  }
  // armoured helm, small against the pauldrons, forward-set
  parts.push(part(bbox(6.2, 5.8, 5.4, 1.4, 0.86), [0, -2.6, 20.4], PAL.steelDeep));
  parts.push(part(bbox(5.2, 2.0, 1.6, 0.5), [0, -5.4, 21.0], PAL.emberCore));
  parts.push(part(plate(1.4, 0.6, 0.8, 5.0), [0, 0.8, 24.0], PAL.emberDeep, { rotX: 0.2 }));
  // brazier staff, held out to one side
  parts.push(part(cyl(0.9, 0.7, 20.0, 8), [7.4, -1.0, 1.0], PAL.ironOld));
  parts.push(part(cyl(3.0, 2.2, 2.6, 10), [7.4, -1.0, 20.4], PAL.steelDeep));
  parts.push(part(sph(2.4, 10), [7.4, -1.0, 24.0], PAL.emberCore));
  parts.push(part(cone(1.5, 4.0, 6), [7.4, -1.0, 27.4], PAL.emberCore));
  return { parts };
}

/**
 * OBSIDIAN SIEGEBREAKER — siege. SILHOUETTE: a four-legged siege platform with a massive forward ram.
 *
 * Deliberately BOXIER than the Behemoth's dome: the two sieges must not be confused, so this one has
 * a squared hull, crenellations and a blunt ram instead of a barrel.
 */
function obsidianSiege(): Assembly {
  const parts: Part[] = [];
  // four massive corner legs
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(tube([[0, 0, 12.0, 4.0], [0.8 * sx, 0.6 * sy, 6.4, 3.4], [1.4 * sx, 1.0 * sy, 1.2, 3.0]], 8), [sx * 10.0, sy * 8.0, 0], PAL.ironOld));
    parts.push(part(bbox(7.4, 7.4, 2.8, 1.2), [sx * 12.0, sy * 9.4, 1.2], PAL.steelDeep));
  }
  // squared hull
  parts.push(part(bbox(23.0, 18.0, 10.0, 2.4, 0.92), [0, 0, 13.0], PAL.ironOld));
  parts.push(part(bbox(21.0, 16.0, 3.0, 1.4, 0.94), [0, 0, 22.4], PAL.steelDeep));
  // crenellations
  for (let i = -2; i <= 2; i++) {
    parts.push(part(bbox(2.6, 3.0, 2.6, 0.8), [i * 4.2, -6.0, 24.4], PAL.steel));
  }
  // TEAM MARKER: a large banner block plus a rune band across the ram, so ownership is legible in a
  // crowd of siege platforms.
  parts.push(part(bbox(9.0, 2.2, 4.4, 1.0), [0, 6.4, 25.2], PAL.bannerTeam));
  parts.push(part(bbox(20.0, 1.8, 1.6, 0.5), [0, -9.0, 21.0], PAL.trimTeam));
  // siege ram: a massive forward-projecting armoured head
  parts.push(part(bbox(8.0, 14.0, 8.0, 2.0), [0, -14.0, 14.0], PAL.steelDeep));
  parts.push(part(bbox(10.0, 4.0, 10.0, 2.0, 0.7), [0, -21.0, 14.0], PAL.steel));
  for (const sx of [-1, 1] as const) {
    parts.push(part(cone(1.6, 4.4, 6), [sx * 3.4, -23.6, 14.0], PAL.steelLit, { rotX: -Math.PI / 2 }));
  }
  parts.push(part(prism(3.0, 1.2, 6), [0, -23.0, 14.0], PAL.emberCore, { rotX: Math.PI / 2 }));
  // rear counterweight
  parts.push(part(bbox(9.0, 7.0, 6.0, 1.6), [0, 11.0, 16.0], PAL.ironOld));
  return { parts };
}

/**
 * GROVE WARDEN — sustained ranged. SILHOUETTE: a walking tree whose widest point is its CROWN. The
 * only unit that gets wider toward the top.
 */
function groveWarden(): Assembly {
  const parts: Part[] = [];
  // root legs
  for (const sx of [-1, 1] as const) {
    parts.push(part(tube([[0, 0, 10.0, 3.0], [0.8 * sx, 0.4, 5.0, 2.6], [2.0 * sx, 0.8, 0.8, 2.2]], 8), [sx * 3.6, 0, 0], PAL.woodDeep));
    parts.push(part(bbox(5.6, 7.0, 2.2, 1.0), [sx * 5.6, 0.6, 0.8], PAL.woodDeep));
  }
  // trunk, tapering up
  parts.push(part(cyl(5.4, 3.6, 15.0, 12), [0, 0, 2.0], PAL.woodDeep));
  // bark plates, offset so the trunk is not a smooth cylinder
  parts.push(part(bbox(4.0, 4.6, 8.0, 1.2, 0.8), [0, -3.4, 8.0], PAL.wood, { rotX: 0.06 }));
  parts.push(part(bbox(3.4, 4.0, 6.0, 1.0, 0.85), [2.6, 2.8, 11.0], PAL.wood, { rotY: 0.4 }));
  // face: two glowing eyes in a hollow, projecting forward
  parts.push(part(bbox(5.4, 2.0, 4.2, 1.0, 0.8), [0, -4.2, 15.0], PAL.woodDeep));
  parts.push(part(sph(1.1, 6), [-1.6, -5.4, 15.4], PAL.eyeTeam));
  parts.push(part(sph(1.1, 6), [1.6, -5.4, 15.4], PAL.eyeTeam));
  // crown: branches fanning up and out, with leaf clusters. The widest point of the unit.
  for (const [sx, tilt, len] of [
    [-1.0, -0.55, 9.0],
    [-0.5, -0.28, 11.0],
    [0.0, 0.02, 12.0],
    [0.5, 0.3, 11.0],
    [1.0, 0.58, 9.0],
  ] as const) {
    parts.push(part(tube([[0, 0, 0, 1.5], [sx * 2.0, 0.4, len * 0.6, 0.9], [sx * 4.4, 0.8, len, 0.4]], 6), [sx * 1.2, 0, 16.4], PAL.woodDeep, { rotZ: tilt }));
    parts.push(part(sph(2.6, 8), [sx * 5.8, 2.2, 16.4 + len * 0.92], PAL.leaf, { scale: { x: 1.2, y: 1.0, z: 0.6 } }));
  }
  parts.push(part(sph(4.4, 10), [0, 0, 24.0], PAL.leafLit, { scale: { x: 1.3, y: 1.1, z: 0.55 } }));
  // living bow limb, out to one side
  parts.push(part(tube([[0, 0, -7.0, 0.7], [2.6, 0, -1.0, 1.1], [2.8, 0, 5.0, 0.9], [0, 0, 10.0, 0.5]], 7), [-7.6, -0.6, 12.0], PAL.woodLit));
  parts.push(part(tube([[0, 0, -7.0, 0.15], [0, 0, 10.0, 0.15]], 4), [-7.6, -0.6, 12.0], PAL.leafLit));
  parts.push(part(cone(0.9, 3.4, 6), [-9.0, -0.6, 16.0], PAL.leafDeep, { rotZ: 0.8 }));
  // TEAM MARKER: a wide band around the trunk plus bands on two branches. The warden is a large
  // organic mass, so one thin ring vanished at sprite size.
  parts.push(part(cyl(6.2, 5.9, 2.8, 12), [0, 0, 6.4], PAL.trimTeam));
  parts.push(part(prism(3.4, 1.4, 8), [-4.2, -0.4, 19.4], PAL.trimTeam, { rotZ: 0.4 }));
  parts.push(part(prism(3.4, 1.4, 8), [4.2, -0.4, 19.4], PAL.trimTeam, { rotZ: -0.4 }));
  return { parts };
}

/**
 * WAYSTONE WAGON — mobile HQ. SILHOUETTE: a covered wagon on four big wheels with a floating stone.
 *
 * The only wheeled unit in the roster, so the wheels alone identify it.
 */
function waystoneWagon(): Assembly {
  const parts: Part[] = [];
  // four large spoked wheels, mounted OUTSIDE the body so they read in every facing
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(cyl(4.4, 4.4, 1.6, 14), [sx * 8.2, sy * 6.4, 4.4], PAL.woodDeep, { rotY: Math.PI / 2 }));
    parts.push(part(cyl(2.0, 2.0, 1.9, 8), [sx * 8.2, sy * 6.4, 4.4], PAL.ironOld, { rotY: Math.PI / 2 }));
    for (let k = 0; k < 4; k++) {
      parts.push(part(bbox(7.6, 0.7, 0.7, 0.2), [sx * 8.2, sy * 6.4, 4.4], PAL.wood, { rotY: (k / 4) * Math.PI }));
    }
  }
  // chassis + bed
  parts.push(part(bbox(14.0, 16.0, 3.0, 1.2), [0, 0, 6.6], PAL.woodDeep));
  parts.push(part(bbox(15.0, 18.0, 8.0, 2.0, 0.95), [0, 0, 11.0], PAL.wood));
  parts.push(part(bbox(16.0, 18.4, 1.6, 0.6), [0, 0, 15.4], PAL.woodDeep));
  // canvas cover over the bed
  parts.push(part(cyl(6.0, 6.0, 15.0, 12), [0, 0, 15.0], PAL.bannerTeam, { scale: { x: 1, y: 1, z: 0.7 } }));
  // Driver's bench projecting well FORWARD (facing cue), plus a rear tailgate and tow bar at the
  // back. The wagon is long and boxy, so front/back features must be pronounced to read.
  parts.push(part(bbox(9.6, 4.2, 2.2, 0.7), [0, -12.6, 10.4], PAL.woodDeep));
  parts.push(part(bbox(6.0, 1.6, 3.0, 0.6), [0, -14.6, 11.6], PAL.ironOld));
  parts.push(part(bbox(9.0, 2.2, 5.0, 0.8), [0, 11.2, 12.0], PAL.woodDeep));
  parts.push(part(cyl(0.9, 0.7, 5.0, 6), [0, 13.6, 8.6], PAL.ironOld, { rotX: Math.PI / 2 }));
  // the waystone: a floating monolith. Its identity.
  parts.push(part(prism(3.4, 11.0, 6), [0, 1.0, 24.0], PAL.crystalDeep));
  parts.push(part(prism(2.6, 3.4, 6), [0, 1.0, 33.0], PAL.crystalHot));
  parts.push(part(prism(4.4, 1.0, 6), [0, 1.0, 22.6], PAL.runeTeam));
  for (const sx of [-1, 1] as const) {
    parts.push(part(tube([[0, 0, 0, 0.6], [sx * 1.2, 0, 3.4, 0.45], [sx * 2.0, 0.6, 6.0, 0.3]], 5), [sx * 3.0, 0, 18.0], PAL.brass));
  }
  return { parts };
}

export const EXTRA_UNITS: Record<string, Assembly> = {
  mana_weaver: manaWeaver(),
  rift_familiar: riftFamiliar(),
  rift_skimmer: riftSkimmer(),
  siege_behemoth: siegeBehemoth(),
  thornling: thornling(),
  cinder_acolyte: cinderAcolyte(),
  obsidian_siege: obsidianSiege(),
  grove_warden: groveWarden(),
  waystone_wagon: waystoneWagon(),
};

// ================================================================================================
// STRUCTURES
// ================================================================================================

/**
 * ARCANE NEXUS — economy drop-off, 2x2. SILHOUETTE: a wide ring-shaped collector around a crystal well.
 *
 * Reported as broken ("flat panels jutting out"). Rebuilt as a genuine ring: 12 segments laid around a
 * circle so it reads as a circle from every facing, with the crystal well rising through the middle.
 */
function arcaneNexus(): Assembly {
  const parts: Part[] = [...plinth(2, 3.0)];
  parts.push(part(cyl(20, 18, 7.0, 8), [0, 0, 2.6], PAL.rock));
  parts.push(part(cyl(19, 19, 1.2, 8), [0, 0, 9.4], PAL.rockLit));
  const RING_R = 13.0;
  const SEG = 12;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    parts.push(part(bbox(4.6, 6.6, 5.2, 0.9, 0.9), [Math.cos(a) * RING_R, Math.sin(a) * RING_R, 10.0], PAL.violet, { rotZ: a + Math.PI / 2 }));
  }
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2 + Math.PI / SEG;
    parts.push(part(prism(2.4, 1.0, 5), [Math.cos(a) * RING_R, Math.sin(a) * RING_R, 15.2], PAL.runeTeam, { rotZ: a }));
  }
  /**
   * A TALL CENTRAL SPIRE rising out of the ring, so the building is a ring PLUS a tower rather than a low ring.
   *
   * The nexus measured 0.811 against the Inferno Beacon and 0.793 against the Obsidian Bastion — both wide, low
   * masses like itself. Making the centre the tallest element in the building separates it from every low box in
   * the roster.
   */
  parts.push(part(cyl(8.0, 7.0, 5.0, 12), [0, 0, 9.4], PAL.violetDeep));
  parts.push(part(cyl(6.4, 4.6, 26.0, 12), [0, 0, 14.0], PAL.violet));
  parts.push(part(cyl(5.0, 3.6, 14.0, 10), [0, 0, 40.0], PAL.violetLit));
  for (const z of [22.0, 34.0]) {
    parts.push(part(cyl(6.2, 6.2, 1.8, 12), [0, 0, z], PAL.brass));
  }
  parts.push(part(prism(4.4, 12.0, 6), [0, 0, 46.0], PAL.crystal));
  parts.push(part(sph(5.2, 12), [0, 0, 62.0], PAL.crystalHot));
  parts.push(part(prism(8.4, 1.2, 10), [0, 0, 56.0], PAL.aether));
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(cyl(2.4, 1.8, 26.0, 8), [sx * 15.0, sy * 15.0, 3.0], PAL.rockLit));
    parts.push(part(prism(1.6, 7.0, 5), [sx * 15.0, sy * 15.0, 30.0], PAL.crystalHot));
    parts.push(part(prism(2.8, 0.8, 8), [sx * 15.0, sy * 15.0, 26.0], PAL.brass));
    parts.push(part(prism(3.0, 1.0, 8), [sx * 15.0, sy * 15.0, 12.0], PAL.runeTeam));
  }
  return { parts };
}

/**
 * ARCANE GATE — 1x1 teleport. SILHOUETTE: an ARCH with a real hole through the middle.
 *
 * The only structure with a hole, so it is unmistakable even as a 40 px build-menu icon.
 */
function arcaneGate(): Assembly {
  const parts: Part[] = [...plinth(1, 2.4)];
  /**
   * A TALL, WIDE ARCH — its hole is the identifier, so it has to be the dominant feature.
   *
   * `arcane_gate` and `arcane_sentry` are both 1x1, so the shared full-footprint base course is proportionally huge on
   * them and their silhouettes converged to 0.716 IoU. Making the gate's arch substantially taller and wider restores the
   * gap between the two: one is a doorway you can see through, the other is a solid post.
   */
  for (const s of [-1, 1] as const) {
    parts.push(part(bbox(5.2, 8.0, 34.0, 1.2, 0.88), [s * 8.2, 0, 1.3], PAL.violet));
    parts.push(part(bbox(6.0, 9.0, 2.6, 0.9), [s * 8.2, 0, 35.3], PAL.brass));
    parts.push(part(prism(3.6, 1.0, 8), [s * 8.2, 0, 14.0], PAL.runeTeam));
  }
  // The arch span, built from stepped segments so the hole is real.
  const SEG = 7;
  for (let i = 0; i < SEG; i++) {
    const a = Math.PI * (i / (SEG - 1));
    parts.push(part(bbox(5.0, 6.0, 3.6, 0.8), [Math.cos(a) * 8.2, 0, 37.0 + Math.sin(a) * 6.2], PAL.violet, { rotZ: -(a - Math.PI / 2) }));
  }
  // the portal surface, INSIDE the arch
  parts.push(part(plate(11.0, 11.0, 26.0, 1.0), [0, -0.6, 2.4], PAL.aether));
  parts.push(part(sph(3.4, 10), [0, -1.4, 16.0], PAL.crystalHot, { scale: { x: 1.4, y: 1, z: 1.5 } }));
  return { parts };
}

/**
 * ARCANE BUNKER — 2x2 garrison. SILHOUETTE: a LOW WIDE dome with a firing slit. The only structure
 * with no vertical element at all.
 */
function arcaneBunker(): Assembly {
  const parts: Part[] = [...plinth(2, 2.6)];
  /**
   * ARCANE BUNKER — SILHOUETTE: a squat armoured redoubt with a CRENELLATED PARAPET and a small watchturret.
   *
   * The bunker is legitimately the lowest-profile building in the roster — it is a shelter, not a tower — but it was
   * measuring **aspect 0.33** as a smooth dome on a pad, i.e. a mound rather than a fortification. A bunker reads as a
   * bunker because of its BATTLEMENTS and its firing slit, so those are now the dominant features: a square armoured
   * block, merlons all round, and a stubby turret on one corner that breaks the flat roofline.
   */
  // Armoured block: square, not domed, so the corners read.
  parts.push(part(bbox(30, 30, 14.0, 2.2, 0.9), [0, 0, 2.4], PAL.violetDeep));
  parts.push(part(bbox(31.6, 31.6, 2.2, 0.9, 0.97), [0, 0, 16.2], PAL.violet));
  /**
   * CRENELLATIONS — eight merlons around the parapet.
   *
   * These are what make the silhouette read as a defended structure at phone zoom; they break the top edge into a
   * repeating notch pattern that no other building in the roster has.
   */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = 13.6;
    parts.push(
      part(bbox(6.0, 5.0, 5.0, 0.9, 0.86), [Math.cos(a) * r, Math.sin(a) * r, 18.4], PAL.rockLit, {
        rotZ: a,
      }),
    );
  }
  // Firing slit: a dark band with a team-lit inner line.
  parts.push(part(bbox(27.0, 27.0, 3.0, 0.8), [0, 0, 8.0], PAL.rockDeep));
  parts.push(part(bbox(28.4, 28.4, 1.2, 0.5), [0, 0, 8.6], PAL.runeTeam));
  // Corner buttresses.
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(bbox(7.0, 8.0, 12.0, 1.2, 0.82), [sx * 13.0, sy * 13.0, 2.4], PAL.rockLit));
  }
  /**
   * WATCHTURRET on one corner — a small round tower that gives the building a single clear peak and breaks the
   * symmetry of the parapet.
   */
  parts.push(part(cyl(5.6, 4.6, 24.0, 10), [12.0, -12.0, 6.0], PAL.rock));
  parts.push(part(cyl(6.4, 6.4, 1.8, 10), [12.0, -12.0, 30.0], PAL.rockLit));
  parts.push(part(cone(7.0, 7.0, 10), [12.0, -12.0, 31.8], PAL.violetDeep));
  parts.push(part(prism(2.0, 5.0, 6), [12.0, -12.0, 38.4], PAL.crystalHot));
  parts.push(part(bbox(3.0, 3.0, 2.0, 0.6), [12.0, -12.0, 12.0], PAL.runeTeam));
  // Team ring at the dome shoulder.
  parts.push(part(bbox(32.4, 32.4, 3.2, 0.6), [0, 0, 13.4], PAL.trimTeam));
  parts.push(part(bbox(33.0, 33.0, 1.8, 0.5), [0, 0, 17.4], PAL.runeTeam));
  parts.push(part(bbox(7.0, 7.0, 3.0, 0.6), [12.0, -12.0, 20.0], PAL.runeTeam));
  return { parts };
}

/**
 * ATTUNEMENT SPIRE — 2x2 support tower. SILHOUETTE: a thin shaft with THREE tuning-fork prongs.
 * Nothing else in the roster has a forked top.
 */
function attunementSpire(): Assembly {
  const parts: Part[] = [...roundPlinth(2, 3.0)];
  /**
   * ATTUNEMENT SPIRE — SILHOUETTE: a tapered PYLON carrying a large FLOATING CRYSTAL, with four intake vanes
   * sweeping outward at the base.
   *
   * Zachary: "the Ley Conduit needs a pylon" — and this building needs to not be a plain cone. It is the mana
   * harvester, so its shape is a crystal held aloft over a collection funnel. The vanes are what make it read as
   * "gathering" rather than "pointing"; they also break the outline at the base, which is where the towers were all
   * identical.
   */
  // Four intake vanes sweeping out and up, like a collector.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(
      part(
        plate(24.0, 7.0, 26.0, 1.6),
        [Math.cos(a) * 16.0, Math.sin(a) * 16.0, 4.0],
        PAL.violetDeep,
        { rotZ: a + Math.PI / 2, rotX: -0.42 },
      ),
    );
    // A wide rim at the top of each vane, which is what makes the funnel read.
    parts.push(part(cyl(4.4, 3.4, 3.4, 6), [Math.cos(a) * 23.0, Math.sin(a) * 23.0, 26.0], PAL.brass, { rotZ: a }));
    parts.push(part(cyl(1.0, 0.7, 7.0, 5), [Math.cos(a) * 6.0, Math.sin(a) * 6.0, 3.0], PAL.brass, { rotZ: Math.cos(a) * 0.4, rotX: Math.sin(a) * 0.4 }));
  }
  // Tapered pylon.
  parts.push(part(cyl(7.6, 3.4, 26.0, 8), [0, 0, 2.6], PAL.violet));
  for (const z of [10.0, 18.0]) {
    parts.push(part(cyl(6.2, 5.4, 1.4, 8), [0, 0, z], PAL.brass));
  }
  /**
   * A SINGLE ROUND ORB, NOT A CRYSTAL STACK.
   *
   * The attunement spire and the frost spire were both crystal-topped and measured 0.733 — the two most similar
   * remaining pair. A harvester's read is a collected sphere of mana; a defence's read is jagged ice. So this is one
   * big smooth orb on a cradle, where the frost spire is five angular shards.
   */
  parts.push(part(cyl(6.0, 5.0, 2.4, 12), [0, 0, 31.0], PAL.brass));
  parts.push(part(sph(9.0, 16), [0, 0, 41.0], PAL.crystalHot));
  parts.push(part(sph(6.4, 14), [0, 0, 41.0], PAL.aether));
  parts.push(part(sph(3.0, 10), [0, -3.0, 41.0], PAL.crystalHot));
  // Containment rings around the crystal.
  parts.push(part(cyl(9.4, 9.4, 1.0, 12), [0, 0, 33.0], PAL.aether));
  parts.push(part(cyl(7.0, 7.0, 0.9, 12), [0, 0, 40.0], PAL.aether));
  // Team bands, high and wide.
  parts.push(part(cyl(6.0, 5.2, 2.4, 8), [0, 0, 21.0], PAL.runeTeam));
  parts.push(part(cyl(9.8, 9.8, 1.4, 12), [0, 0, 33.8], PAL.trimTeam));
  return { parts };
}

/**
 * RESONANCE VAULT — 2x2 upgrade. SILHOUETTE: a VAULT — a heavy square keep with a buttressed arched door, a domed
 * roof, and crystal stores stacked against its flanks.
 *
 * Zachary: "the Resonance Vault needs a sturdy vault or crystal store." Before, it was a plain cube with four corner
 * posts, which measured IoU 0.888 against the Inferno Beacon (also a box) — a cube is the least identifiable shape in
 * the roster.
 *
 * The identity now comes from the ARCH: a recessed doorway with a curved head, flanked by buttresses, which no other
 * building has. The dome and the stacked crystals give it a skyline that is neither a flat box nor a spire.
 */
function resonanceVault(): Assembly {
  const parts: Part[] = [...plinth(2, 2.8)];
  // Main keep, slightly tapered so it is not a literal cube.
  parts.push(part(bbox(30, 30, 17.0, 3.0, 0.94), [0, 0, 2.6], PAL.violetDeep));
  parts.push(part(bbox(31.0, 31.0, 1.6, 0.8), [0, 0, 19.6], PAL.brassDeep));
  /**
   * THE ARCHED DOOR — the identifying feature.
   *
   * A recessed dark opening with a semicircular head built from three stacked rings of decreasing width. It reads as
   * a vault door from any angle and is unlike any other silhouette element in the roster.
   */
  parts.push(part(bbox(13.0, 1.6, 10.0, 0.8), [0, -15.6, 3.4], PAL.rockDeep));
  parts.push(part(cyl(6.5, 6.5, 1.6, 12), [0, -15.6, 13.0], PAL.rockDeep, { rotX: Math.PI / 2 }));
  parts.push(part(bbox(9.4, 1.2, 6.4, 0.6), [0, -16.2, 4.0], PAL.brass));
  parts.push(part(prism(3.4, 1.0, 8), [0, -16.4, 8.0], PAL.runeTeam, { rotX: Math.PI / 2 }));
  // Buttresses either side of the door, which widen the base exactly where the arch is.
  for (const sx of [-1, 1] as const) {
    parts.push(part(bbox(5.0, 6.0, 13.0, 1.0, 0.8), [sx * 12.0, -13.0, 3.0], PAL.rock));
  }
  // Domed roof.
  parts.push(part(sph(15.0, 14), [0, 0, 22.0], PAL.violet, { scale: { x: 1, y: 1, z: 0.62 } }));
  parts.push(part(cyl(3.4, 2.2, 9.0, 8), [0, 0, 30.0], PAL.brass));
  parts.push(part(sph(3.0, 10), [0, 0, 40.0], PAL.crystalHot));
  parts.push(part(prism(1.8, 5.0, 6), [0, 0, 44.0], PAL.crystal));
  // Crystal stores: stacked shards leaning against the flanks, the "crystal store" read.
  for (const sx of [-1, 1] as const) {
    parts.push(part(prism(2.6, 11.0, 5), [sx * 15.4, 8.0, 3.0], PAL.crystal, { rotZ: sx * 0.22 }));
    parts.push(part(prism(2.0, 7.6, 5), [sx * 12.6, 12.4, 3.0], PAL.crystalDeep, { rotZ: sx * 0.3 }));
  }
  // Team band around the drum and across the arch.
  parts.push(part(bbox(31.4, 31.4, 2.0, 0.6), [0, 0, 16.4], PAL.trimTeam));
  return { parts };
}

/**
 * LEY CONDUIT — 2x2 power. SILHOUETTE: a lattice PYLON — a wide A-frame tower with a crossarm at the top and
 * insulators, the unmistakable shape of an electricity pylon.
 *
 * Zachary: "the Ley Conduit needs a pylon." It was a narrow mast with three floating rings, which is the same
 * silhouette as every other thin tower in the roster (IoU 0.831 against the Arcane Bunker, itself a box).
 *
 * A pylon is a very specific shape: two legs splaying from a narrow waist to a wide foot, crossarms projecting
 * horizontally, and a peak. That A-frame with outriggers appears nowhere else in the roster, and it says "power
 * transmission" immediately.
 */
function leyConduit(): Assembly {
  const parts: Part[] = [...plinth(2, 2.6)];
  /**
   * THE A-FRAME.
   *
   * Four legs, each a tapered tube running from a wide foot up to a narrow waist, then continuing to the peak. Built
   * as tubes so the taper reads; the wide foot is what gives the pylon its triangular profile.
   */
  const FOOT = 13.0;
  const WAIST = 4.2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fx = Math.cos(a) * FOOT;
    const fy = Math.sin(a) * FOOT;
    const wx = Math.cos(a) * WAIST;
    const wy = Math.sin(a) * WAIST;
    parts.push(
      part(tube([[fx, fy, 0, 1.5], [wx, wy, 20.0, 1.0], [wx * 0.7, wy * 0.7, 34.0, 0.8]], 6), [0, 0, 2.4], PAL.steelDeep),
    );
  }
  // Horizontal bracing rings at two heights, which is what makes lattice read.
  for (const [z, r] of [
    [9.0, 11.0],
    [20.0, 4.6],
    [28.0, 3.6],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const a1 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
      parts.push(
        part(
          tube([[Math.cos(a0) * r, Math.sin(a0) * r, 0, 0.45], [Math.cos(a1) * r, Math.sin(a1) * r, 0, 0.45]], 4),
          [0, 0, z],
          PAL.steel,
        ),
      );
    }
  }
  /**
   * CROSSARMS — two horizontal beams projecting well beyond the tower, each carrying insulator stacks. These are
   * the widest thing on the building and the reason a pylon is recognisable at any distance.
   */
  for (const [z, span] of [
    [30.0, 15.0],
    [24.0, 12.0],
  ] as const) {
    parts.push(part(bbox(span * 2, 2.4, 1.8, 0.6), [0, 0, z], PAL.steel));
    for (const s of [-1, 1] as const) {
      parts.push(part(cyl(1.5, 1.2, 3.4, 6), [s * span * 0.82, 0, z + 1.6], PAL.crystal, { rotZ: 0 }));
      parts.push(part(sph(1.4, 8), [s * span * 0.82, 0, z + 3.6], PAL.crystalHot));
    }
  }
  // Peak.
  parts.push(part(cone(2.6, 7.0, 6), [0, 0, 34.0], PAL.steel));
  parts.push(part(sph(1.8, 9), [0, 0, 41.6], PAL.crystalHot));
  // Team bands on the crossarms, where they are widest and most visible.
  for (const z of [23.0, 29.0]) {
    parts.push(part(bbox(26.0, 3.6, 2.4, 0.5), [0, 0, z], PAL.runeTeam));
  }
  // A wide team collar low on the frame, where the A-frame legs are widest and most visible.
  parts.push(part(bbox(27.0, 27.0, 2.2, 0.6), [0, 0, 6.0], PAL.trimTeam));
  return { parts };
}

/**
 * ASTRAL SPIRE — 3x3 superweapon. SILHOUETTE: the tallest structure on the board, ending in a
 * floating star. Deliberately the maximum height in the game.
 */
function astralSpire(): Assembly {
  const parts: Part[] = [...roundPlinth(3, 3.6)];
  parts.push(part(cyl(18.0, 16.0, 14.0, 14), [0, 0, 3.0], PAL.rock));
  parts.push(part(cyl(14.0, 12.0, 16.0, 12), [0, 0, 17.0], PAL.violet));
  parts.push(part(cyl(9.6, 7.6, 18.0, 12), [0, 0, 33.0], PAL.violetLit));
  parts.push(part(cyl(5.4, 4.0, 16.0, 10), [0, 0, 51.0], PAL.violet));
  parts.push(part(cyl(3.2, 2.4, 12.0, 8), [0, 0, 67.0], PAL.violetLit));
  // TEAM MARKER: the brass rings read as gold at every team, so the spire looked identical for all
  // four players (measured 1.4% visible). These are wide TEAM-coloured bands sitting where the camera
  // sees them, between the drums.
  for (const z of [17.0, 33.0, 51.0]) {
    parts.push(part(prism(15.6, 1.6, 12), [0, 0, z], PAL.brass));
  }
  parts.push(part(cyl(16.4, 15.2, 3.2, 14), [0, 0, 17.0], PAL.trimTeam));
  parts.push(part(cyl(11.8, 10.8, 3.0, 12), [0, 0, 33.0], PAL.runeTeam));
  parts.push(part(cyl(7.6, 6.8, 2.8, 12), [0, 0, 51.0], PAL.trimTeam));
  parts.push(part(prism(4.4, 1.2, 8), [0, 0, 24.0], PAL.runeTeam));
  /**
   * THE STAR — a wide floating crystal above the spire tip, held clear by a visible gap.
   *
   * This is what makes the Astral Spire read as a superweapon rather than "the tallest tower": the silhouette ends in a
   * detached, much wider form, which nothing else in the roster has.
   */
  parts.push(part(prism(11.0, 2.2, 8), [0, 0, 84.0], PAL.aether));
  parts.push(part(prism(7.4, 9.0, 6), [0, 0, 88.0], PAL.crystalHot));
  parts.push(part(prism(4.2, 5.0, 6), [0, 0, 94.0], PAL.crystalHot));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(prism(1.8, 6.0, 5), [Math.cos(a) * 12.0, Math.sin(a) * 12.0, 85.0], PAL.crystal, { rotZ: a }));
  }
  // the star
  parts.push(part(sph(6.6, 14), [0, 0, 56.0], PAL.crystalHot));
  parts.push(part(sph(3.4, 10), [0, 0, 56.0], PAL.eyeTeam));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(tube([[0, 0, 0, 1.1], [Math.cos(a) * 4.0, Math.sin(a) * 4.0, 4.0, 0.85], [Math.cos(a) * 5.4, Math.sin(a) * 5.4, 9.0, 0.55]], 6), [0, 0, 45.0], PAL.brass));
  }
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(bbox(3.6, 6.4, 18.0, 0.9, 0.6), [sx * 17.0, sy * 17.0, 3.0], PAL.rockLit));
  }
  return { parts };
}

/**
 * CELESTIAL CANNON — 3x3 artillery. SILHOUETTE: a heavy splayed base with ONE huge upward barrel.
 * The only structure with a long horizontal element.
 */
function celestialCannon(): Assembly {
  const parts: Part[] = [...plinth(3, 3.0)];
  /**
   * CELESTIAL CANNON — SILHOUETTE: a long BARREL projecting far beyond its own base, on a squat turret.
   *
   * Zachary: "towers need distinct weapon heads (frost crystal, flame brazier, storm coil, cannon barrel)." The
   * previous version measured **IoU 0.974** against the Golem Forge and 0.953 against the Waystone Camp: it was a
   * box with a short stub, and the barrel barely left the footprint, so nothing about the outline said "artillery".
   *
   * The identifying shape is now a barrel that overhangs the base by a third of its own width, mounted on a squat
   * tapered turret with recoil rails beneath it. Nothing else in the roster has a horizontal projection that long.
   */
  /**
   * A NARROW TURRET ON A WIDE PLINTH, WITH VISIBLE DAYLIGHT BETWEEN.
   *
   * The silhouette needs a WAIST. Every 3x3 building in the roster fills its full 96x96 base, so at normalised
   * scale they all read as "a filled square with a different top" — which is why the cannon still measured 0.968
   * against the Golem Forge even after its barrel was lengthened. Two slim legs carrying the turret above open
   * ground create a distinctive H-shaped profile with holes a solid mass cannot have.
   */
  for (const s of [-1, 1] as const) {
    parts.push(part(bbox(9.0, 14.0, 34.0, 1.4, 0.86), [s * 13.0, 2.0, 2.6], PAL.rockDeep));
  }
  // The turret deck spans between the legs, above open space.
  parts.push(part(bbox(38.0, 22.0, 4.0, 1.4, 0.94), [0, 2.0, 36.6], PAL.rockLit));
  parts.push(part(bbox(30.0, 18.0, 3.0, 1.2, 0.9), [0, 2.0, 40.6], PAL.violet));
  parts.push(part(prism(7.0, 1.2, 10), [0, 2.0, 43.6], PAL.runeTeam));

  /**
   * THE BARREL — the whole point of the building. Long, forward-projecting, tapering, with reinforcing rings and a
   * flared muzzle. It reaches ~30 world units past the turret, which is what makes this silhouette unique.
   */
  parts.push(part(tube([[0, 0, 0, 5.6], [0, -12.0, 0.8, 4.8], [0, -24.0, 1.6, 4.2], [0, -32.0, 2.2, 3.8]], 12), [0, 1.0, 42.6], PAL.steel));
  // Muzzle brake: a flared collar plus a slot, so the business end reads at phone zoom.
  parts.push(part(cyl(5.6, 6.2, 2.6, 12), [0, -33.0, 42.6], PAL.brass));
  parts.push(part(prism(4.4, 1.6, 12), [0, -34.6, 43.0], PAL.steelDeep));
  parts.push(part(sph(2.4, 10), [0, -35.4, 43.2], PAL.crystalHot));
  // Reinforcing rings along the barrel.
  for (const [dy, dz] of [
    [-8.0, 0.4],
    [-18.0, 1.2],
    [-26.0, 1.8],
  ] as const) {
    parts.push(part(cyl(4.6, 4.6, 1.6, 12), [0, dy, 40.0 + dz], PAL.brassDeep, { rotX: -Math.PI / 2 }));
  }
  // Breech block behind the barrel.
  parts.push(part(bbox(11.0, 11.0, 11.0, 2.0), [0, 5.0, 39.6], PAL.steelDeep));
  // Recoil rails: two long tubes running back under the barrel, which reinforce the horizontal read.
  for (const s of [-1, 1] as const) {
    parts.push(part(cyl(1.4, 1.2, 20.0, 8), [s * 4.8, -6.0, 38.0], PAL.brass, { rotX: -Math.PI / 2 }));
  }
  // Counterweight at the rear, so the mass is visibly balanced against the barrel.
  parts.push(part(bbox(13.0, 7.0, 8.0, 1.6, 0.8), [0, 12.0, 34.0], PAL.ironOld));
  // Team band across the turret and on the muzzle collar.
  parts.push(part(bbox(31.0, 19.0, 3.0, 0.6), [0, 2.0, 37.8], PAL.trimTeam));
  parts.push(part(bbox(31.6, 19.6, 1.6, 0.5), [0, 2.0, 41.8], PAL.runeTeam));
  parts.push(part(cyl(6.0, 6.0, 1.2, 12), [0, -33.0, 43.8], PAL.runeTeam));
  return { parts };
}

/**
 * SCRYING OBELISK — 2x2 vision. SILHOUETTE: a narrow monolith topped by a floating EYE.
 *
 * Reported as broken: the old `bbox` depth/height swap turned its capstone into a horizontal plate.
 * Rebuilt as a clean tapered monolith with a real floating iris.
 */
function scryingObelisk(): Assembly {
  const parts: Part[] = [...plinth(2, 2.6)];
  /**
   * SCRYING OBELISK — SILHOUETTE: a TALL NARROW MONOLITH carrying a large round LENS on a forked bracket, with a
   * hooded lamp below it. It powers the minimap, so the shape is an eye looking outward.
   *
   * Zachary: "the Scrying Obelisk needs a tall obelisk with an eye or lens." It had an eye, but the shaft was a squat
   * 4-sided prism with wide collars, and those collars matched the Ley Conduit's crossarm profile at 0.897 IoU — two
   * buildings whose distinguishing feature was a horizontal band at a similar height.
   *
   * The monolith is now much TALLER and NARROWER (8 wide against 52 high, a 6.5:1 shaft), which by itself separates
   * it from every other tower, and the lens is a large distinct disc rather than a small sphere.
   */
  // Tall, narrow, tapered monolith — deliberately the thinnest tall building in the roster.
  parts.push(part(prism(5.0, 44.0, 4), [0, 0, 2.6], PAL.violetDeep, { rotZ: Math.PI / 4 }));
  parts.push(part(prism(6.4, 2.2, 4), [0, 0, 4.0], PAL.brass, { rotZ: Math.PI / 4 }));
  parts.push(part(prism(4.2, 6.0, 4), [0, 0, 46.6], PAL.violetLit, { rotZ: Math.PI / 4 }));
  /**
   * THE LENS — a wide disc held in a forked bracket above the shaft.
   *
   * Its diameter (17) is more than three times the shaft's, which gives the silhouette a distinctive
   * "lollipop" head that no other tower has.
   */
  for (const s of [-1, 1] as const) {
    parts.push(
      part(tube([[s * 1.4, 0, 0, 1.0], [s * 4.6, 0, 4.0, 0.8], [s * 7.0, 0, 7.0, 0.6]], 5), [0, 0, 52.0], PAL.brass),
    );
  }
  parts.push(part(cyl(8.6, 8.6, 1.6, 16), [0, 0, 61.0], PAL.brassDeep, { rotX: Math.PI / 2 }));
  parts.push(part(cyl(7.4, 7.4, 1.4, 16), [0, 0, 61.0], PAL.crystal, { rotX: Math.PI / 2 }));
  parts.push(part(sph(4.0, 12), [0, -1.6, 61.0], PAL.eyeTeam));
  parts.push(part(sph(2.0, 10), [0, -3.4, 61.0], PAL.crystalHot));
  // Hooded lamp on the shaft: a small lit recess, which reads as "active" at phone zoom.
  parts.push(part(bbox(7.0, 1.6, 5.0, 0.6), [0, -5.4, 30.0], PAL.rockDeep));
  parts.push(part(bbox(4.6, 1.2, 3.4, 0.5), [0, -6.0, 30.4], PAL.crystalHot));
  // Team: slim collar bands, deliberately NARROW so they cannot read as crossarms.
  parts.push(part(cyl(7.4, 7.0, 3.4, 4), [0, 0, 16.0], PAL.trimTeam, { rotZ: Math.PI / 4 }));
  parts.push(part(cyl(6.4, 6.0, 2.8, 4), [0, 0, 38.0], PAL.runeTeam, { rotZ: Math.PI / 4 }));
  return { parts };
}

/**
 * SUMMONING CIRCLE — 2x2. SILHOUETTE: a flat ring on the ground ringed by standing stones.
 * The lowest structure in the game and the only mostly-flat one.
 */
function summoningCircle(): Assembly {
  const parts: Part[] = [];
  /**
   * SUMMONING CIRCLE — SILHOUETTE: a ring of TALL STANDING STONES around a glowing rune floor.
   *
   * Zachary: "the Summoning Circle needs standing stones around a glowing rune ring." The previous version was a
   * flat dais with eight 8-unit stubs, which measured **aspect 0.30** (three times as wide as it was tall) and an
   * IoU of **1.000** against the Thorn Grove — the two buildings were literally the same silhouette. It read as a
   * plate of stone, not as a place where something is summoned.
   *
   * The stones are now 26-34 units tall (taller than the 64-unit dais is wide is not possible on 2x2, but they are
   * over half its width, which is enough to break the flat profile), uneven in height and lean so the ring reads as
   * ancient rather than machined, and the rune floor glows between them.
   */
  parts.push(part(bbox(64.0, 64.0, 1.3, 1.2, 0.97), [0, 0, 0], PAL.rockDeep));
  /**
   * A RAISED STONE DRUM the ritual is performed on — 12 units tall, nearly the full footprint.
   *
   * The circle measured 60% structure share with a 1.2-unit dais; the rune floor and standing stones were the only
   * building there was, floating over stone. The drum gives it mass and lifts the ring to where the camera sees it.
   */
  parts.push(part(cyl(31.2, 29.5, 26.0, 20), [0, 0, 1.3], PAL.rock));
  parts.push(part(cyl(28.0, 27.0, 1.8, 20), [0, 0, 27.0], PAL.rockLit));
  // Team band high on the drum, above the ground-contact band the footing gate measures.
  parts.push(part(cyl(30.2, 29.6, 4.2, 20), [0, 0, 21.0], PAL.runeTeam));
  parts.push(part(cyl(29.4, 29.0, 3.4, 20), [0, 0, 12.0], PAL.trimTeam));
  // Glowing rune floor: two rings and a hot core, so the centre reads as active even at phone zoom.
  parts.push(part(cyl(25.0, 25.0, 0.4, 20), [0, 0, 3.4], PAL.emberDeep));
  parts.push(part(cyl(18.0, 18.0, 0.35, 20), [0, 0, 3.5], PAL.emberCore));
  parts.push(part(cyl(9.0, 9.0, 0.3, 16), [0, 0, 3.6], PAL.crystalHot));
  parts.push(part(cyl(22.0, 22.0, 0.22, 20), [0, 0, 3.7], PAL.runeTeam));
  /**
   * THE STANDING STONES.
   *
   * Eight slabs on a ring, each a tapered box leaning slightly outward, with heights deliberately uneven (26 to 34
   * units) so the top edge is a broken skyline rather than a rim. A lit sigil caps each one, which is what carries
   * the "ritual" read at small sizes.
   */
  /**
   * The stones stand ON the raised drum, so they must be tall enough to clear it and still form the crown.
   *
   * With an 18-unit drum the previous 26-34 unit stones left only a few units proud of it, and the building's silhouette
   * became "a cylinder" — it then confused itself with the Inferno Beacon and the Thorn Grove at 0.74-0.81 IoU. Raising
   * the stones restores the ring of standing stones as the top half of the shape.
   */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = 34 + ((i * 7) % 5) * 3.0;
    const lean = (((i % 3) - 1) * 0.05);
    const x = Math.cos(a) * 24.0;
    const y = Math.sin(a) * 24.0;
    parts.push(
      part(bbox(7.6, 5.0, h, 0.8, 0.72), [x, y, 3.4], PAL.ironOld, { rotZ: a + Math.PI / 2, rotX: lean }),
    );
    // Sigil notch near the top of each stone.
    parts.push(part(bbox(3.6, 1.6, 3.0, 0.5), [x, y, 27.0 + h * 0.82], PAL.emberCore, { rotZ: a + Math.PI / 2 }));
    parts.push(part(prism(1.5, 2.2, 6), [x, y, 27.0 + h + 1.0], PAL.crystalHot));
  }
  // Central brazier column: the tallest element, so the building has one clear peak.
  parts.push(part(cyl(6.4, 4.4, 12.0, 8), [0, 0, 3.4], PAL.stoneDeep));
  parts.push(part(cyl(7.6, 5.0, 2.4, 8), [0, 0, 15.4], PAL.brassDeep));
  parts.push(part(sph(4.6, 12), [0, 0, 19.6], PAL.emberCore));
  parts.push(part(prism(2.6, 7.0, 6), [0, 0, 24.0], PAL.crystalHot));
  return { parts };
}

/**
 * OBSIDIAN BASTION — 2x2 defence. SILHOUETTE: a squat square keep with crenellations. All hard right
 * angles — the deliberate opposite of the Arcane spires.
 */
function obsidianBastion(): Assembly {
  const parts: Part[] = [...plinth(2, 2.8)];
  parts.push(part(bbox(30, 30, 30.0, 2.4, 0.92), [0, 0, 2.6], PAL.ironOld));
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(cyl(5.0, 4.2, 34.0, 8), [sx * 15.0, sy * 15.0, 2.6], PAL.steelDeep));
    parts.push(part(cone(6.2, 9.0, 8), [sx * 15.0, sy * 15.0, 36.0], PAL.ironOld));
    parts.push(part(prism(1.4, 5.0, 5), [sx * 15.0, sy * 15.0, 44.0], PAL.crystalHot));
  }
  for (let i = -2; i <= 2; i++) {
    parts.push(part(bbox(3.2, 3.2, 3.4, 0.7), [i * 5.4, -14.0, 32.6], PAL.steel));
    parts.push(part(bbox(3.2, 3.2, 3.4, 0.7), [i * 5.4, 14.0, 32.6], PAL.steel));
  }
  for (let i = -1; i <= 1; i++) {
    parts.push(part(bbox(3.2, 3.2, 3.4, 0.7), [-14.0, i * 5.4, 32.6], PAL.steel));
    parts.push(part(bbox(3.2, 3.2, 3.4, 0.7), [14.0, i * 5.4, 32.6], PAL.steel));
  }
  // TEAM MARKER: this structure had NO team-tinted geometry at all, so both players' bastions looked
  // identical. Three bold elements fix it: a rune band around the keep, hanging banners on two faces,
  // and a lit ring under the brazier.
  parts.push(bbox(31.6, 31.6, 2.6, 0.7) && part(bbox(31.6, 31.6, 2.4, 0.7), [0, 0, 26.6], PAL.trimTeam));
  parts.push(part(bbox(31.6, 31.6, 2.0, 0.6), [0, 0, 9.4], PAL.runeTeam));
  parts.push(part(plate(7.0, 5.4, 10.0, 1.0), [0, -15.6, 12.0], PAL.bannerTeam));
  parts.push(part(plate(7.0, 5.4, 10.0, 1.0), [0, 15.6, 12.0], PAL.bannerTeam));
  parts.push(part(cyl(6.0, 6.0, 0.9, 12), [0, 0, 26.2], PAL.runeTeam));
  // ember brazier on top
  parts.push(part(cyl(4.4, 3.6, 2.6, 10), [0, 0, 26.6], PAL.steelDeep));
  parts.push(part(sph(3.4, 12), [0, 0, 31.0], PAL.emberCore));
  parts.push(part(cone(2.0, 5.0, 6), [0, 0, 34.4], PAL.emberCore));
  for (const s of [-1, 1] as const) {
    parts.push(part(bbox(2.0, 1.2, 5.0, 0.4), [s * 6.0, -15.4, 16.0], PAL.emberDeep));
  }
  return { parts };
}

/**
 * INFERNO BEACON — 2x2. SILHOUETTE: an open iron cage with a fire inside. The only structure you can
 * see through.
 */
function infernoBeacon(): Assembly {
  const parts: Part[] = [...plinth(2, 2.6)];
  /**
   * INFERNO BEACON — SILHOUETTE: a tall IRON BRAZIER CAGE, nearly as wide as its footprint, with fire burning up
   * through it.
   *
   * Zachary named this as one of the three worst: at head 2177768 the cage was r=11 in a 64-unit footprint (34% of the
   * width) on a 4-unit stone slab, so 44% of the sprite was foundation and the "building" was a small pot on a plate.
   *
   * The cage now spans r=26 of the footprint and stands 30 units tall, so the brazier IS the building. The bars, rings
   * and roof cone are kept — that shape is its identity — but scaled up to fill the tile.
   */
  // Iron bowl, nearly full width.
  parts.push(part(cyl(20.0, 17.0, 9.0, 14), [0, 0, 1.3], PAL.ironOld));
  parts.push(part(prism(27.0, 1.6, 14), [0, 0, 10.3], PAL.steel));
  /**
   * THE CAGE — bars all the way around at full width, so the silhouette is a wide open lattice rather than a solid
   * drum. The gaps are what let the fire read.
   */
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(part(cyl(1.2, 1.0, 40.0, 5), [Math.cos(a) * 18.0, Math.sin(a) * 18.0, 11.0], PAL.steelDeep));
  }
  for (const z of [16.0, 24.0, 32.0]) {
    parts.push(part(cyl(19.0, 19.0, 1.2, 14), [0, 0, z], PAL.steelDeep));
  }
  // Fire column rising through the cage.
  parts.push(part(sph(11.0, 14), [0, 0, 22.0], PAL.emberCore));
  parts.push(part(cone(8.4, 30.0, 9), [0, 0, 34.0], PAL.emberCore));
  parts.push(part(cone(4.0, 18.0, 7), [0, 0, 52.0], PAL.crystalHot));
  // Roof cone, capped at the top of the cage.
  parts.push(part(cone(20.0, 9.0, 12), [0, 0, 46.0], PAL.ironOld));
  // Team rings at the bowl and the cage shoulder.
  parts.push(part(cyl(20.6, 20.6, 2.6, 14), [0, 0, 8.0], PAL.runeTeam));
  parts.push(part(cyl(20.2, 18.0, 2.4, 12), [0, 0, 42.0], PAL.trimTeam));
  return { parts };
}

/**
 * STORM CONDUCTOR — 2x2 power. SILHOUETTE: a tall mast with three angled lightning vanes.
 */
function stormConductor(): Assembly {
  const parts: Part[] = [...roundPlinth(2, 2.8)];
  /**
   * STORM CONDUCTOR — SILHOUETTE: a mast wound with an open HELICAL COIL, with three lightning vanes splaying at
   * the top.
   *
   * Zachary: "towers need distinct weapon heads (frost crystal, flame brazier, storm coil, cannon barrel)." It had a
   * coil band and vanes, but they were small relative to a plain shaft, so its silhouette measured 0.869 against the
   * Scrying Obelisk — both read as "narrow column".
   *
   * The coil is now the BODY of the building: a wide open helix standing clear of a slim mast, which gives the
   * outline a distinctive repeating widening that no solid tower has. The vanes splay wide at the top like a tesla
   * crown.
   */
  // Slim central mast.
  parts.push(part(cyl(3.0, 2.2, 36.0, 8), [0, 0, 2.6], PAL.steelDeep));
  /**
   * THE HELIX — a stack of open rings of decreasing radius, each rotated slightly, reading as a wound coil.
   *
   * Built from ring tubes rather than solid discs so daylight shows through: that perforated profile is what makes
   * this building unmistakable next to the solid obelisk.
   */
  const RINGS = 7;
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1);
    // Rings WIDEN toward the top: an inverted cone of coils, which is the opposite profile to every other tower.
    const r = 7.0 + t * 7.0;
    const z = 6.0 + t * 22.0;
    parts.push(part(cyl(r, r, 1.3, 14), [0, 0, z], i % 2 === 0 ? PAL.steel : PAL.brassDeep));
    // Open the ring: a gap segment, so it does not read as a solid disc.
    parts.push(part(bbox(r * 1.5, r * 0.5, 1.9, 0.4), [0, 0, z], PAL.steelDeep));
  }
  // Vertical connectors between the rings, reinforcing the cage read.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(
      part(tube([[Math.cos(a) * 10.6, Math.sin(a) * 10.6, 0, 0.5], [Math.cos(a) * 8.0, Math.sin(a) * 8.0, 22.0, 0.5]], 4), [0, 0, 6.0], PAL.steel),
    );
  }
  // Crown: three wide vanes splaying outward, plus the collector.
  /**
   * A WIDE SPLAYED CROWN of six vanes, reaching well beyond the coil.
   *
   * The storm conductor measured 0.807 against the Thorn Grove and 0.799 against the Ley Conduit: with a narrower head
   * it was just another tapered column. A crown that is the WIDEST part of the building inverts its profile and
   * makes it unmistakable from above, which is the angle the game is played at.
   */
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      part(plate(13.0, 2.4, 1.0, 9.0), [Math.cos(a) * 12.0, Math.sin(a) * 12.0, 33.0], PAL.steel, {
        rotZ: a,
        rotY: -Math.PI / 2,
        rotX: 0.42,
      }),
    );
    parts.push(part(sph(1.3, 8), [Math.cos(a) * 17.0, Math.sin(a) * 17.0, 36.0], PAL.crystalHot));
  }
  parts.push(part(sph(3.6, 12), [0, 0, 36.0], PAL.crystalHot));
  parts.push(part(prism(2.2, 5.0, 6), [0, 0, 40.0], PAL.aether));
  // Team bands on two of the coil rings, where they catch the light.
  parts.push(part(cyl(9.6, 9.6, 3.6, 14), [0, 0, 10.0], PAL.runeTeam));
  parts.push(part(cyl(13.6, 13.6, 3.2, 14), [0, 0, 24.0], PAL.trimTeam));
  return { parts };
}

/**
 * SANCTUARY SPIRE — 2x2 healing. SILHOUETTE: a round bell-tower with a luminous teardrop above it.
 *
 * Distinct from the Frost Spire (which is angular and icy) by being ROUND, and from the Attunement
 * Spire by having one top element instead of a fork.
 */
function sanctuarySpire(): Assembly {
  const parts: Part[] = [...roundPlinth(2, 3.0)];
  /**
   * SANCTUARY SPIRE — SILHOUETTE: a BELL TOWER — a square shaft that flares into a wide open BELFRY with visible
   * bells, capped by a slender spire. It does not attack; it heals, so its shape is civic rather than martial.
   *
   * Zachary's note about distinct weapon heads applies in reverse here: this tower needs a distinct NON-weapon head.
   * It was a smooth round shaft ending in a teardrop, which measured 0.897 against the Storm Conductor and 0.852
   * against the Frost Spire — three towers that all read as "tapering column with something on top".
   *
   * The belfry is the identifier: a square room at the top with OPEN sides (so the silhouette has a notch at each
   * corner) and two bells hanging in it. Nothing else in the roster has an open framed head.
   */
  // Square shaft, tapered, in two stages.
  parts.push(part(bbox(20.0, 20.0, 16.0, 2.2, 0.8), [0, 0, 2.6], PAL.rock));
  parts.push(part(bbox(16.0, 16.0, 14.0, 1.8, 0.84), [0, 0, 18.6], PAL.rockLit));
  parts.push(part(bbox(20.4, 20.4, 1.8, 0.8), [0, 0, 18.0], PAL.brassDeep));
  /**
   * THE BELFRY — four corner posts carrying a roof slab, with open sides.
   *
   * Building it as posts-and-slab rather than a solid block is what creates the distinctive open head: the
   * silhouette shows a gap between the shaft top and the roof, which no solid tower has.
   */
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(bbox(4.2, 4.2, 12.0, 1.0, 0.9), [sx * 7.6, sy * 7.6, 32.6], PAL.rock));
  }
  // Bells hanging inside the belfry.
  for (const [bx, by] of [
    [-4.0, 0],
    [4.0, 0],
  ] as const) {
    parts.push(part(cyl(0.6, 0.6, 4.0, 4), [bx, by, 42.0], PAL.brass));
    parts.push(part(sph(2.6, 10), [bx, by, 37.4], PAL.brassLit, { scale: { x: 1, y: 1, z: 1.3 } }));
  }
  // Roof slab, then a slender spire.
  parts.push(part(bbox(19.0, 19.0, 2.4, 0.9, 0.96), [0, 0, 44.6], PAL.rockDeep));
  parts.push(part(cone(8.0, 7.0, 4), [0, 0, 47.0], PAL.violetDeep, { rotZ: Math.PI / 4 }));
  parts.push(part(cyl(1.2, 0.6, 9.0, 6), [0, 0, 52.0], PAL.brass));
  parts.push(part(sph(2.0, 10), [0, 0, 62.0], PAL.crystalHot));
  // Team: bands at the shaft shoulder and under the belfry roof, where they are most visible.
  parts.push(part(bbox(20.8, 20.8, 2.2, 0.7), [0, 0, 30.0], PAL.trimTeam));
  parts.push(part(bbox(16.8, 16.8, 1.8, 0.6), [0, 0, 15.0], PAL.runeTeam));
  return { parts };
}

/**
 * GOLEM FORGE — 3x3 production. SILHOUETTE: a tall CHIMNEY beside a wide forge hall, with a raised ANVIL block and a
 * glowing furnace mouth.
 *
 * Zachary: "the Golem Forge needs an anvil or furnace with chimney and glow." It had a chimney already, but the
 * outline still measured **IoU 0.974** against the Celestial Cannon — both were "a wide box with something vertical
 * at one side". The fix is to make the forge's profile unmistakably asymmetric and stepped: a low wide hall on one
 * side, a tall square chimney stack on the other, an anvil block raised above the roofline between them, and the
 * furnace mouth glowing at ground level. No other building in the roster has that stepped, industrial outline.
 */
function golemForge(): Assembly {
  const parts: Part[] = [...plinth(3, 3.0)];
  /**
   * THE HALL — deliberately low and offset, leaving the other half of the footprint for the chimney.
   *
   * Offsetting the masses is what breaks the "symmetric box" silhouette the cannon also had.
   */
  /**
   * TWO LOW WINGS flanking the chimney, which makes the profile a symmetric T rather than the cannon's asymmetric
   * L. That flanking pair is the shape that finally separated this building from the Celestial Cannon.
   */
  // Two flanking buttress wings, which read as the furnace's mass at phone zoom.
  for (const sx of [-1, 1] as const) {
    parts.push(part(bbox(18, 30, 22.0, 2.2, 0.92), [sx * 30.0, 0, 1.3], PAL.ironOld));
    parts.push(part(bbox(19, 31, 2.2, 0.9, 0.98), [sx * 30.0, 0, 23.3], PAL.steelDeep));
    parts.push(part(bbox(20.0, 32.0, 2.2, 0.6), [sx * 30.0, 0, 12.0], PAL.runeTeam));
  }

  /**
   * THE CHIMNEY STACK — square, tall, and capped with a flared crown. Square rather than round so it does not read
   * as a spire; tapered slightly so it has a direction.
   */
  parts.push(part(bbox(13.0, 13.0, 56.0, 1.6, 0.86), [0, 2.0, 2.6], PAL.steelDeep));
  parts.push(part(bbox(15.6, 15.6, 3.4, 0.8, 0.96), [0, 2.0, 56.4], PAL.steel));
  parts.push(part(bbox(13.6, 13.6, 1.8, 0.6), [0, 2.0, 59.8], PAL.ironOld));
  // Banded courses up the stack, which reads as masonry at phone zoom.
  for (const z of [14.0, 28.0, 42.0, 53.0]) {
    parts.push(part(bbox(13.8, 13.8, 1.5, 0.5), [0, 2.0, z], PAL.brassDeep));
  }
  // Smoke glow just inside the crown.
  parts.push(part(cyl(4.6, 4.0, 1.4, 8), [0, 2.0, 61.4], PAL.emberDeep));

  /**
   * THE ANVIL — a raised block on the hall's roof with a horn, the one element that says "this building makes
   * things" rather than "this building is a box". It breaks the roofline at a point no other building in the roster
   * breaks.
   */
  parts.push(part(bbox(9.0, 6.0, 2.4, 0.7), [-20.0, -3.0, 20.4], PAL.steelDeep));
  parts.push(part(bbox(6.4, 4.6, 3.0, 0.8, 0.82), [-20.0, -3.0, 22.8], PAL.ironOld));
  parts.push(part(cone(1.8, 4.2, 6), [-15.4, -3.0, 23.6], PAL.steel, { rotZ: -Math.PI / 2 }));
  parts.push(part(cyl(1.6, 1.2, 7.0, 6), [-20.0, 3.4, 21.0], PAL.stoneDeep, { rotZ: 0.5 }));

  // Furnace mouth at ground level, glowing.
  parts.push(part(bbox(12.0, 2.2, 9.0, 0.9), [20.0, -9.4, 3.4], PAL.rockDeep));
  parts.push(part(bbox(9.0, 1.6, 6.8, 0.6), [20.0, -10.2, 3.6], PAL.emberCore));
  parts.push(part(bbox(5.4, 1.2, 4.2, 0.5), [20.0, -10.6, 3.8], PAL.crystalHot));

  // Team: band on the hall, band on the stack, banner on the chimney face.
  
  parts.push(part(bbox(13.6, 13.6, 1.8, 0.6), [0, 2.0, 34.0], PAL.runeTeam));
  for (const sx of [-1, 1] as const) parts.push(part(bbox(21.0, 19.0, 1.4, 0.5), [sx * 20.0, 0, 18.4], PAL.trimTeam));
  parts.push(part(plate(6.6, 5.0, 8.4, 1.0), [0, -5.0, 40.0], PAL.bannerTeam));
  return { parts };
}

export const EXTRA_BUILDINGS: Record<string, Assembly> = {
  arcane_nexus: arcaneNexus(),
  arcane_gate: arcaneGate(),
  arcane_bunker: arcaneBunker(),
  attunement_spire: attunementSpire(),
  resonance_vault: resonanceVault(),
  ley_conduit: leyConduit(),
  astral_spire: astralSpire(),
  celestial_cannon: celestialCannon(),
  scrying_obelisk: scryingObelisk(),
  summoning_circle: summoningCircle(),
  obsidian_bastion: obsidianBastion(),
  inferno_beacon: infernoBeacon(),
  storm_conductor: stormConductor(),
  sanctuary_spire: sanctuarySpire(),
  golem_forge: golemForge(),
  // These two live in roster2 rather than pilot because their designs changed substantially from the
  // pilot pass (thorn_grove was a flat blob, waystone_camp had no tents).
  thorn_grove: thornGrove(),
  waystone_camp: waystoneCamp(),
};

/**
 * THORN GROVE — 2x2 defence. SILHOUETTE: a cluster of TALL ROOT SPIKES erupting from a bed of vines, with
 * grasping tendrils reaching outward. The only structure in the roster with a spiky, upward-splaying outline.
 *
 * Zachary's complaint applies here twice over: the old version was a flat mound (aspect **0.24**, i.e. four times
 * wider than tall) and it measured **IoU 1.000** against the Summoning Circle — the two were the same silhouette.
 * A "living barricade" has to look like something that grows up and out, so the shape is now vertical and jagged
 * rather than domed.
 */
function thornGrove(): Assembly {
  /**
   * Same footing contract as every other building: `plinth()` supplies the thin lip AND the full-footprint base course,
   * so the grove meets its tile edges and the alignment gate stays meaningful. Its own organic mass goes on top.
   */
  const parts: Part[] = [...plinth(2, 2.6)];
  /**
   * A THICK BED OF MATTED VINES across the whole footprint — the grove's mass, not a pad.
   *
   * Measured at 53% structure share before this: the mound was 1.4 units of moss on top of a 1.8-unit stone slab, so
   * two thirds of what the player saw was foundation. The bed is now 10 units of layered growth covering 56 of the 64
   * units of footprint, and the spikes erupt from it.
   */
  /**
   * A TALL THICKET, built as a real mass rather than a low mound.
   *
   * The grove kept measuring 62% structure share because its whole body was 16 units against a 64-unit footprint — a
   * wide low hump. It is now a 34-unit thicket of stacked foliage with the same footprint, so the building occupies the
   * frame instead of the pad. The organic read is preserved by the irregular sphere stacking and the thorn crown.
   */
  /**
   * The thicket sits ON TOP of the base course (which tops out at z=8), starting at z=9.
   *
   * `bodyBlock` starts at the foundation top, which put the foliage at the same height as the stone base — so the
   * alignment gate, which measures the lowest geometry, was measuring leaves instead of the footing and reported the base
   * as 37px wide against a 64px diamond.
   */
  parts.push(...bodyBlock(2, { height: 16, inset: 2.0, mat: PAL.leafDeep, lit: PAL.leaf, levels: 3 }));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rr = 20.0 + (i % 3) * 3.0;
    parts.push(part(sph(6.8, 10), [Math.cos(a) * rr, Math.sin(a) * rr, 10.0 + (i % 3) * 3.0], PAL.leafDeep, { scale: { x: 1.2, y: 1.2, z: 1.0 } }));
    parts.push(part(sph(5.4, 10), [Math.cos(a) * (rr - 5), Math.sin(a) * (rr - 5), 22.0 + (i % 4) * 3.0], PAL.leaf, { scale: { x: 1.1, y: 1.1, z: 0.9 } }));
  }
  /**
   * AN ASYMMETRIC CANOPY, not a symmetrical stack.
   *
   * With a tidy cylindrical crown the grove measured 0.717 IoU against the Storm Conductor — both were a vertical stack
   * wider at the base, and the upper-half metric could not separate them. A canopy built from unequal lobes leaning one
   * way reads as a plant, and no machine in the roster is asymmetric about its own axis.
   */
  for (const [ox, oy, oz, r] of [
    [-5.0, 2.0, 24.0, 13.0],
    [5.5, -3.0, 27.0, 11.0],
    [-1.0, -6.0, 30.0, 9.5],
    [7.0, 4.0, 32.0, 8.0],
    [-8.0, -1.0, 33.0, 7.0],
  ] as const) {
    parts.push(part(sph(r, 12), [ox, oy, oz], PAL.leafDeep, { scale: { x: 1.15, y: 1.05, z: 0.85 } }));
  }
  // One tall leaning leader shoot, which breaks the symmetrical outline decisively.
  parts.push(part(cone(5.0, 22.0, 7), [6.0, -2.0, 34.0], PAL.leaf, { rotZ: -0.22, rotX: 0.1 }));
  parts.push(part(cyl(2.0, 1.4, 3.0, 6), [8.0, -2.4, 54.0], PAL.rockMoss));
  // Team colour high on the thicket, clear of the ground-contact band.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(part(sph(3.6, 8), [Math.cos(a) * 22.0, Math.sin(a) * 22.0, 30.0], PAL.runeTeam));
  }
  parts.push(part(cyl(25.0, 24.0, 3.6, 14), [0, 0, 25.0], PAL.trimTeam));
  parts.push(part(cyl(17.0, 16.0, 3.0, 14), [0, 0, 35.0], PAL.runeTeam));
  // A crown of thorns across the top of the bed, so the mass has texture where the camera sees it.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rr = 20.0 + (i % 3) * 3.0;
    parts.push(
      part(cone(2.6, 9.0 + (i % 4) * 2.0, 5), [Math.cos(a) * rr, Math.sin(a) * rr, 22.5], PAL.boneDeep, {
        rotZ: Math.cos(a) * 0.4,
        rotX: Math.sin(a) * 0.4,
      }),
    );
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(part(sph(6.4, 10), [Math.cos(a) * 18.0, Math.sin(a) * 18.0, 5.0], PAL.leafDeep, { scale: { x: 1.2, y: 1.2, z: 0.9 } }));
  }

  /**
   * THE ROOT SPIKES — the mass of the building.
   *
   * Six upward-tapering root spires of deliberately different heights (18 to 40 units) on a ring, each leaning
   * outward. Uneven heights make the top edge a broken, organic skyline rather than a machined rim, which is what
   * separates the grove from every geometric structure at a glance.
   */
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    // Nine shorter spikes at wildly varied heights and radii: an irregular sprawl rather than a symmetric crown.
    const h = 12 + ((i * 13) % 7) * 3.4;
    const rad = 11.0 + ((i * 5) % 4) * 3.0;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    const lean = 0.22 + (i % 3) * 0.09;
    parts.push(
      part(cone(6.2, h, 6), [x, y, 3.0], i % 2 === 0 ? PAL.leafDeep : PAL.woodDeep, {
        rotZ: Math.cos(a) * -lean,
        rotX: Math.sin(a) * lean,
      }),
    );
    // A lit thorn tip on the taller spires.
    if (i % 2 === 0) parts.push(part(cone(1.5, 5.0, 5), [x * 1.14, y * 1.14, 3.0 + h * 0.86], PAL.leafLit));
  }

  // Tangled vine body filling the base between the spires, so it reads as one organism not six sticks.
  for (const [x, y, z, r] of [
    [0, 0, 7.0, 8.0],
    [-7.0, 3.0, 5.6, 5.8],
    [7.4, 1.2, 5.8, 6.0],
    [-2.4, -7.4, 6.0, 6.2],
    [3.4, 7.2, 5.4, 5.6],
  ] as const) {
    parts.push(part(sph(r, 10), [x, y, z], PAL.leafDeep, { scale: { x: 1.15, y: 1.05, z: 0.8 } }));
  }

  // Grasping tendrils: short curved tubes reaching outward and up. These break the ring silhouette.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.9;
    const r0 = 12.0;
    const x0 = Math.cos(a) * r0;
    const y0 = Math.sin(a) * r0;
    parts.push(
      part(
        tube(
          [
            [0, 0, 0, 1.5],
            [Math.cos(a) * 5.0, Math.sin(a) * 5.0, 6.0, 1.1],
            [Math.cos(a) * 9.0, Math.sin(a) * 9.0, 13.0, 0.7],
            [Math.cos(a) * 11.0, Math.sin(a) * 11.0, 19.0, 0.3],
          ],
          6,
        ),
        [x0, y0, 3.0],
        PAL.leaf,
      ),
    );
  }

  // Team blooms at the crown, where the camera sees them.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(sph(1.4, 8), [Math.cos(a) * 2.2, Math.sin(a) * 2.2, 20.0], PAL.trimTeam));
  }
  parts.push(part(sph(1.8, 8), [0, 0, 21.0], PAL.eyeTeam));
  return { parts };
}

/**
 * WAYSTONE CAMP — 3x3 forward base. SILHOUETTE: a cluster of CONICAL TENTS around a leaning standing stone, with a
 * covered wagon at the edge.
 *
 * Zachary: "the Waystone Camp needs tents or a wagon." It had four small tents, but they were 15 units tall against a
 * 96-unit base, so at normalised scale the building was a wide slab with pebbles on it — IoU 0.957 against the
 * Golem Forge and 0.931 against the Celestial Cannon.
 *
 * The tents are now nearly twice as tall (26 units), of two clearly different sizes, and grouped so the skyline is a
 * row of peaks rather than a scatter. The wagon adds a boxy counter-form and a wheel, and the standing stone is the
 * single tall spike that identifies the building from across the map.
 */
function waystoneCamp(): Assembly {
  const parts: Part[] = [...plinth(3, 2.4)];
  parts.push(part(cyl(20.0, 19.0, 1.6, 12), [0, 0, 2.2], PAL.rock));

  /**
   * TENTS — two sizes, deliberately arranged so their peaks form a jagged rank.
   *
   * A canvas tent is a cone with a ridge pole and a door flap; making the flap visible is what stops it reading as a
   * generic cone at phone zoom.
   */
  const tents: [number, number, number][] = [
    [-22.0, -12.0, 34.0],
    [-8.0, -18.0, 30.0],
    [-24.0, 8.0, 32.0],
    [4.0, -16.0, 28.0],
    [-12.0, 14.0, 26.0],
  ];
  for (const [x, y, h] of tents) {
    parts.push(part(cone(8.0, h, 8), [x, y, 3.4], PAL.bannerTeam));
    // Ridge pole and pennant.
    parts.push(part(cyl(0.5, 0.45, 5.0, 5), [x, y, 3.4 + h * 0.9], PAL.wood));
    parts.push(part(plate(3.4, 1.4, 3.4, 0.4), [x + 1.6, y, 3.4 + h * 0.9 + 2.6], PAL.trimTeam));
    // Door flap: a dark wedge on the outward face.
    parts.push(part(bbox(3.6, 1.0, 6.2, 0.5, 0.7), [x, y - 6.4, 4.6], PAL.woodDeep));
    // Guy ropes, which read as structure rather than decoration.
    for (const s of [-1, 1] as const) {
      parts.push(part(cyl(0.35, 0.3, 9.0, 4), [x + s * 5.0, y - 3.0, 3.4], PAL.woodDeep, { rotZ: s * 0.5 }));
    }
  }

  /**
   * THE WAGON — a boxy counter-form against the tents' cones, with visible wheels.
   */
  parts.push(part(bbox(15.0, 8.0, 8.0, 1.4, 0.9), [15.0, 8.0, 6.0], PAL.wood));
  parts.push(part(bbox(15.6, 8.6, 3.0, 0.9, 0.94), [15.0, 8.0, 13.6], PAL.woodDeep));
  for (const [wx, wy] of [
    [10.0, 4.6],
    [20.0, 4.6],
    [10.0, 11.4],
    [20.0, 11.4],
  ] as const) {
    parts.push(part(cyl(2.6, 2.6, 1.2, 10), [wx, wy, 3.6], PAL.ironOld, { rotX: Math.PI / 2 }));
  }

  /**
   * THE STANDING STONE — tallest element, the landmark that identifies the camp.
   */
  parts.push(part(prism(3.6, 46.0, 5), [0, 0, 2.8], PAL.rockLit, { rotZ: 0.4 }));
  parts.push(part(sph(2.6, 10), [0, 0, 49.4], PAL.crystalHot));
  parts.push(part(prism(4.8, 1.2, 5), [0, 0, 30.0], PAL.runeTeam, { rotZ: 0.4 }));
  // Campfire between the tents.
  parts.push(part(cyl(3.2, 2.6, 1.2, 10), [-8.0, 8.0, 3.2], PAL.ironOld));
  parts.push(part(sph(2.0, 9), [-8.0, 8.0, 5.4], PAL.emberCore));
  return { parts };
}
