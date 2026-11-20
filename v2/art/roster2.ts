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
import { part, bbox, tube, plate, sph, cone, cyl, prism, plinth, roundPlinth, bodyBlock, hall, towerBody } from './shapes';

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
  /**
   * ARCANE NEXUS — a RING HALL filling the tile with a tall central spire.
   *
   * At aa5c5f6 this measured 78% vertical but **42%** flat: the ring of segments stood on a plate and the plate showed
   * through. The hall walls now occupy the footprint and the ring sits on its roof as a parapet.
   */
  parts.push(...hall(2, { height: 22, wall: 3.2, mat: PAL.rock, roof: PAL.rockLit }));
  // Segment ring as a parapet around the roof edge.
  const SEG = 12;
  const RING_R = 24.0;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    parts.push(part(bbox(7.0, 9.0, 9.0, 1.1, 0.88), [Math.cos(a) * RING_R, Math.sin(a) * RING_R, 23.0], PAL.violet, { rotZ: a + Math.PI / 2 }));
    parts.push(part(prism(3.0, 1.4, 5), [Math.cos(a) * RING_R, Math.sin(a) * RING_R, 32.0], PAL.runeTeam, { rotZ: a }));
  }
  /**
   * THE CENTRAL SPIRE — the tallest element, so the building has one clear peak.
   */
  parts.push(part(cyl(12.0, 10.0, 34.0, 12), [0, 0, 23.0], PAL.violet));
  parts.push(part(cyl(9.0, 7.0, 20.0, 10), [0, 0, 57.0], PAL.violetLit));
  for (const z of [38.0, 56.0]) parts.push(part(cyl(12.4, 12.4, 2.4, 12), [0, 0, z], PAL.brass));
  parts.push(part(prism(6.0, 14.0, 6), [0, 0, 70.0], PAL.crystal));
  parts.push(part(sph(6.4, 12), [0, 0, 90.0], PAL.crystalHot));
  parts.push(part(prism(11.0, 1.6, 10), [0, 0, 82.0], PAL.aether));
  // Corner posts on the roof, giving the skyline four peaks around the spire.
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    parts.push(part(cyl(3.2, 2.4, 26.0, 8), [sx * 27.0, sy * 27.0, 23.0], PAL.rockLit));
    parts.push(part(prism(2.0, 9.0, 5), [sx * 27.0, sy * 27.0, 49.0], PAL.crystalHot));
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
   * ARCANE GATE — a gateway with real piers and a lintel, standing on a threshold block that fills the tile.
   *
   * At aa5c5f6 this measured 100% vertical but **36%** flat: the arch was thin and the plate showed around it. The piers
   * are now thick and the threshold fills the footprint, so the only opening is the doorway itself.
   */
  /**
   * THE GATEWAY IS A FRAME AT THE TILE EDGE.
   *
   * Two very thick piers occupy the tile's width — that is what gives it plan coverage — while leaving the lip's front
   * corner exposed for the alignment tracer. A continuous wall across the front hid that corner and the traced slope read
   * 1.57 instead of the diamond's 2.00.
   */
  // Thick square piers carrying the arch.
  for (const s of [-1, 1] as const) {
    parts.push(part(bbox(15.0, 26.0, 46.0, 2.0, 0.88), [s * 8.0, 0, 1.4], PAL.violet));
    parts.push(part(bbox(16.4, 27.4, 3.4, 1.1), [s * 8.0, 0, 47.4], PAL.brass));
    // Team band across each pier, high and wide — the gate has no hall, so these are its only team markers.
    parts.push(part(bbox(15.8, 27.0, 4.4, 0.8, 0.99), [s * 8.0, 0, 30.0], PAL.runeTeam));
    parts.push(part(bbox(16.6, 27.8, 2.6, 0.7, 0.99), [s * 8.0, 0, 20.0], PAL.trimTeam));
    /**
     * No rear mass.
     *
     * A block offset behind the arch projects BELOW the pivot, where the alignment tracer walks the rows looking for the
     * footprint's lower-left edge — and it found that block instead, reading a slope of 0.91. The two piers already span
     * the tile's width and depth, which is what plan coverage measures.
     */
  }
  // The arch span, from stepped segments so the opening is real.
  const SEG = 7;
  for (let i = 0; i < SEG; i++) {
    const a = Math.PI * (i / (SEG - 1));
    parts.push(part(bbox(7.4, 12.0, 5.0, 1.0), [Math.cos(a) * 8.0, 0, 49.0 + Math.sin(a) * 7.6], PAL.violet, { rotZ: -(a - Math.PI / 2) }));
  }
  // Portal surface inside the arch.
  parts.push(part(plate(13.0, 13.0, 30.0, 1.2), [0, -0.6, 3.0], PAL.aether));
  parts.push(part(sph(4.0, 10), [0, -1.4, 20.0], PAL.crystalHot, { scale: { x: 1.4, y: 1, z: 1.5 } }));
  return { parts };
}


/**
 * ARCANE BUNKER — 2x2 garrison. SILHOUETTE: a LOW WIDE dome with a firing slit. The only structure
 * with no vertical element at all.
 */
function arcaneBunker(): Assembly {
  const parts: Part[] = [...plinth(2, 2.6)];
  /**
   * ARCANE BUNKER — a low ARMOURED REDOUBT whose walls rise from the tile edge, with a parapet and a corner turret.
   *
   * At aa5c5f6 this had **41%** vertical and **46%** flat: a dome on a plate. The hall walls now stand at the footprint
   * edge, so the building fills its tile and the only flat surface is the roof.
   */
  parts.push(...hall(2, { height: 26, wall: 3.4, mat: PAL.violetDeep, roof: PAL.violet }));
  /**
   * CRENELLATIONS around the parapet — the repeating notched top edge that reads as a defended structure.
   */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    parts.push(part(bbox(7.4, 6.0, 6.0, 1.0, 0.86), [Math.cos(a) * 27.0, Math.sin(a) * 27.0, 27.5], PAL.rockLit, { rotZ: a }));
  }
  // Firing slit with a team-lit inner line, on the front wall.
  parts.push(part(bbox(40.0, 1.8, 4.0, 0.7), [0, -30.0, 12.0], PAL.rockDeep));
  /**
   * The team-lit inner line of the slit sits high on the wall.
   *
   * `art-footing` measures the lowest 30% of the sprite and requires it to be neutral stone; a team line at z=12.4 fell
   * inside that band once the walls grew, and measured 92% team colour there.
   */
  parts.push(part(bbox(36.0, 1.2, 2.0, 0.5), [0, -30.6, 22.0], PAL.runeTeam));
  /**
   * A WATCH TURRET on one corner, taller than the parapet — gives the building a single clear peak.
   */
  parts.push(part(cyl(7.4, 6.6, 22.0, 10), [24.0, -24.0, 27.0], PAL.rock));
  parts.push(part(cyl(8.6, 8.6, 2.2, 10), [24.0, -24.0, 49.0], PAL.rockLit));
  parts.push(part(cone(9.0, 8.0, 10), [24.0, -24.0, 51.2], PAL.violetDeep));
  parts.push(part(prism(2.4, 4.0, 6), [24.0, -24.0, 59.4], PAL.crystalHot));
  // Team ring at the shoulder.
  parts.push(part(bbox(66.0, 66.0, 2.2, 0.6), [0, 0, 28.0], PAL.trimTeam));
  return { parts };
}


/**
 * ATTUNEMENT SPIRE — 2x2 support tower. SILHOUETTE: a thin shaft with THREE tuning-fork prongs.
 * Nothing else in the roster has a forked top.
 */
function attunementSpire(): Assembly {
  const parts: Part[] = [...roundPlinth(2, 3.0)];
  /**
   * ATTUNEMENT SPIRE — a mana HOLDING TOWER: a round drum filling the tile, ringed by intake vanes, carrying a single
   * floating orb.
   *
   * At aa5c5f6 this measured 63% vertical but **35%** flat — the vanes and orb stood on a plate. The drum now fills the
   * footprint and the vanes spring from its shoulder.
   */
  parts.push(...towerBody(2, { height: 40, mat: PAL.violet, top: PAL.brass }));
  /**
   * THE VANES — four plates flaring outward and up, the building's "gathering" read.
   */
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(plate(26.0, 8.0, 28.0, 1.8), [Math.cos(a) * 18.0, Math.sin(a) * 18.0, 26.0], PAL.violetDeep, { rotZ: a + Math.PI / 2, rotX: -0.42 }));
    parts.push(part(cyl(4.8, 3.8, 3.8, 6), [Math.cos(a) * 26.0, Math.sin(a) * 26.0, 48.0], PAL.brass, { rotZ: a }));
  }
  /**
   * THE ORB — one big smooth sphere on a cradle, held clear above the drum.
   */
  parts.push(part(cyl(8.0, 6.6, 3.0, 12), [0, 0, 41.0], PAL.brass));
  parts.push(part(sph(12.0, 16), [0, 0, 56.0], PAL.crystalHot));
  parts.push(part(sph(8.6, 14), [0, 0, 56.0], PAL.aether));
  parts.push(part(sph(4.0, 10), [0, -4.0, 56.0], PAL.crystalHot));
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
  /**
   * RESONANCE VAULT — a heavy VAULT keep filling the tile, with a buttressed arched door, a domed roof and crystal stores.
   *
   * At aa5c5f6 this measured 54% vertical and **50%** flat: a cube on a plate. The keep now rises from the tile edge and
   * the dome caps it.
   */
  parts.push(...hall(2, { height: 34, wall: 4.0, mat: PAL.violetDeep, roof: PAL.brassDeep }));
  /**
   * THE ARCHED DOOR — a recessed opening with a semicircular head, the identifying feature.
   */
  parts.push(part(bbox(18.0, 2.2, 15.0, 1.0), [0, -29.0, 2.0], PAL.rockDeep));
  parts.push(part(cyl(9.0, 9.0, 2.2, 14), [0, -29.0, 17.0], PAL.rockDeep, { rotX: Math.PI / 2 }));
  parts.push(part(bbox(13.0, 1.6, 9.0, 0.8), [0, -30.0, 3.0], PAL.brass));
  parts.push(part(prism(4.6, 1.4, 8), [0, -30.4, 10.0], PAL.runeTeam, { rotX: Math.PI / 2 }));
  /**
   * THE DOME — a wide flattened sphere capping the keep, with a lantern spire.
   */
  parts.push(part(sph(30.0, 16), [0, 0, 36.0], PAL.violet, { scale: { x: 1, y: 1, z: 0.55 } }));
  parts.push(part(cyl(5.0, 3.4, 8.0, 8), [0, 0, 50.0], PAL.brass));
  parts.push(part(sph(4.0, 10), [0, 0, 60.0], PAL.crystalHot));
  parts.push(part(prism(2.4, 7.0, 6), [0, 0, 66.0], PAL.crystal));
  /**
   * CRYSTAL STORES stacked against the flanks.
   */
  for (const sx of [-1, 1] as const) {
    parts.push(part(prism(3.4, 15.0, 5), [sx * 29.0, 14.0, 2.0], PAL.crystal, { rotZ: sx * 0.22 }));
    parts.push(part(prism(2.6, 10.0, 5), [sx * 24.0, 20.0, 2.0], PAL.crystalDeep, { rotZ: sx * 0.3 }));
  }
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
   * LEY CONDUIT — a LATTICE PYLON on a solid transformer house that fills the tile.
   *
   * At aa5c5f6 this was the worst offender on flat surface: **81%** of its sprite was visible base, because the A-frame
   * legs stood on a plate and left the whole tile showing between them. The transformer house now fills the footprint
   * and the pylon rises from its roof, so the tile is building rather than stone.
   */
  parts.push(...hall(2, { height: 24, wall: 3.2, mat: PAL.ironOld, roof: PAL.steelDeep }));
  /**
   * THE PYLON — four legs converging to a waist, then bracing rings and crossarms with insulators.
   */
  const FOOT = 22.0;
  const WAIST = 5.0;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fx = Math.cos(a) * FOOT;
    const fy = Math.sin(a) * FOOT;
    const wx = Math.cos(a) * WAIST;
    const wy = Math.sin(a) * WAIST;
    parts.push(part(tube([[fx, fy, 0, 2.0], [wx, wy, 40.0, 1.2], [wx * 0.7, wy * 0.7, 62.0, 0.9]], 6), [0, 0, 25.0], PAL.steelDeep));
  }
  for (const [z, r] of [[40.0, 14.0], [50.0, 6.0], [58.0, 4.4]] as const) {
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const a1 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
      parts.push(part(tube([[Math.cos(a0) * r, Math.sin(a0) * r, 0, 0.5], [Math.cos(a1) * r, Math.sin(a1) * r, 0, 0.5]], 4), [0, 0, z], PAL.steel));
    }
  }
  /**
   * CROSSARMS — the widest thing on the building, and why a pylon is recognisable at any distance.
   */
  for (const [z, span] of [[60.0, 19.0], [52.0, 15.0]] as const) {
    parts.push(part(bbox(span * 2, 2.8, 2.0, 0.6), [0, 0, z], PAL.steel));
    for (const sx of [-1, 1] as const) {
      parts.push(part(cyl(1.7, 1.4, 4.0, 6), [sx * span * 0.82, 0, z + 1.8], PAL.crystal));
      parts.push(part(sph(1.6, 8), [sx * span * 0.82, 0, z + 4.2], PAL.crystalHot));
    }
  }
  parts.push(part(cone(2.8, 9.0, 6), [0, 0, 62.0], PAL.steel));
  parts.push(part(sph(2.0, 9), [0, 0, 72.0], PAL.crystalHot));
  return { parts };
}


/**
 * ASTRAL SPIRE — 3x3 superweapon. SILHOUETTE: the tallest structure on the board, ending in a
 * floating star. Deliberately the maximum height in the game.
 */
function astralSpire(): Assembly {
  const parts: Part[] = [...roundPlinth(3, 3.6)];
  /**
   * ASTRAL SPIRE — the superweapon. A stepped ziggurat base filling the tile, rising to the tallest tower on the board
   * and ending in a detached floating star.
   *
   * At aa5c5f6 this measured **58%** vertical and **29%** flat. The base steps now occupy the footprint, so the spire
   * rises out of a building rather than out of a plate.
   */
  parts.push(...towerBody(3, { height: 34, mat: PAL.rock, top: PAL.violetDeep }));
  parts.push(part(cyl(40.0, 34.0, 16.0, 16), [0, 0, 36.0], PAL.violet));
  parts.push(part(cyl(32.0, 26.0, 18.0, 14), [0, 0, 52.0], PAL.violetLit));
  parts.push(part(cyl(22.0, 17.0, 20.0, 12), [0, 0, 70.0], PAL.violet));
  parts.push(part(cyl(13.0, 10.0, 18.0, 10), [0, 0, 90.0], PAL.violetLit));
  for (const z of [36.0, 52.0, 70.0, 90.0]) {
    parts.push(part(prism(42.0, 2.6, 16), [0, 0, z], PAL.brass));
    parts.push(part(cyl(38.0, 34.0, 2.8, 16), [0, 0, z + 2.2], PAL.runeTeam));
  }
  /**
   * THE STAR — a wide floating crystal above the spire tip, held clear by a visible gap. The superweapon's signature.
   */
  parts.push(part(prism(16.0, 3.0, 8), [0, 0, 112.0], PAL.aether));
  parts.push(part(prism(11.0, 13.0, 6), [0, 0, 117.0], PAL.crystalHot));
  parts.push(part(prism(6.0, 8.0, 6), [0, 0, 126.0], PAL.crystalHot));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(prism(2.6, 9.0, 5), [Math.cos(a) * 18.0, Math.sin(a) * 18.0, 113.0], PAL.crystal, { rotZ: a }));
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
   * CELESTIAL CANNON — a solid ARTILLERY EMPLACEMENT: a stone bastion filling the tile, with a turret and a long barrel
   * on top.
   *
   * Zachary: "the VERTICAL mass has to fill the footprint... walls/body should rise from at or near the footprint edge."
   * Measured at aa5c5f6 this building had only **22%** of its pixels above the ground diamond and **73%** visible flat
   * base — the worst in the roster. Its two legs and a deck left the whole tile showing as a plate.
   *
   * Now the emplacement itself is a walled bastion at the tile edge (the `hall` calls), so the building occupies its
   * footprint, and the turret and barrel sit on its roof.
   */
  parts.push(...hall(3, { height: 56, wall: 3.6, mat: PAL.rock, roof: PAL.rockLit }));
  // Corbelled parapet, so the roofline is not a clean rectangle.
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    parts.push(part(bbox(9.0, 9.0, 18.0, 1.4, 0.86), [sx * 34.0, sy * 34.0, 57.0], PAL.rock));
    parts.push(part(cone(6.2, 11.0, 6), [sx * 34.0, sy * 34.0, 73.0], PAL.violetDeep));
  }
  /**
   * THE TURRET — a squat drum on the roof.
   */
  parts.push(part(cyl(15.0, 13.0, 40.0, 10), [0, 6.0, 59.0], PAL.violet));
  parts.push(part(cyl(17.0, 17.0, 3.0, 10), [0, 6.0, 99.0], PAL.runeTeam));
  /**
   * THE BARREL — long, forward-projecting, with reinforcing rings and a flared muzzle. It overhangs the bastion, which is
   * what keeps this silhouette unlike any other even now that its body is a solid block.
   */
  parts.push(part(tube([[0, 0, 0, 6.4], [0, -20.0, 2.0, 5.2], [0, -40.0, 5.0, 4.4], [0, -56.0, 8.0, 4.0]], 12), [0, 4.0, 96.0], PAL.steel));
  parts.push(part(cyl(6.2, 6.8, 3.0, 12), [0, -57.0, 104.6], PAL.brass));
  parts.push(part(prism(4.8, 1.8, 12), [0, -58.8, 105.0], PAL.steelDeep));
  parts.push(part(sph(2.8, 10), [0, -59.8, 105.2], PAL.crystalHot));
  for (const [dy, dz] of [[-10.0, 0.6], [-22.0, 1.5], [-32.0, 2.2]] as const) {
    parts.push(part(cyl(5.0, 5.0, 1.8, 12), [0, dy - 4.0, 98.0 + dz], PAL.brassDeep, { rotX: -Math.PI / 2 }));
  }
  // Counterweight behind the turret.
  parts.push(part(bbox(15.0, 9.0, 16.0, 1.8, 0.8), [0, 22.0, 60.0], PAL.ironOld));
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
   * SCRYING OBELISK — a MONOLITH raised on a buttressed plinth hall that fills the tile, carrying a large LENS.
   *
   * At aa5c5f6 this measured 81% vertical but **74%** flat: the monolith was a narrow shaft standing on a plate, so the
   * plate was most of what the player saw. The plinth hall now fills the footprint at the tile edge, and the obelisk rises
   * from its roof.
   */
  parts.push(...hall(2, { height: 22, wall: 3.4, mat: PAL.violetDeep, roof: PAL.rockLit }));
  /**
   * THE SHAFT — tall, narrow, four-sided, the thinnest tall element in the roster.
   */
  parts.push(part(prism(8.0, 60.0, 4), [0, 0, 23.0], PAL.violetDeep, { rotZ: Math.PI / 4 }));
  parts.push(part(prism(9.6, 2.6, 4), [0, 0, 24.0], PAL.brass, { rotZ: Math.PI / 4 }));
  parts.push(part(prism(6.6, 8.0, 4), [0, 0, 81.0], PAL.violetLit, { rotZ: Math.PI / 4 }));
  /**
   * THE LENS — a wide disc in a forked bracket above the shaft; more than three times the shaft's width, giving the
   * silhouette its distinctive head.
   */
  for (const s of [-1, 1] as const) {
    parts.push(part(tube([[s * 2.0, 0, 0, 1.2], [s * 6.0, 0, 5.0, 0.9], [s * 9.0, 0, 8.6, 0.7]], 5), [0, 0, 88.0], PAL.brass));
  }
  parts.push(part(cyl(12.0, 12.0, 2.0, 16), [0, 0, 99.0], PAL.brassDeep, { rotX: Math.PI / 2 }));
  parts.push(part(cyl(10.4, 10.4, 1.8, 16), [0, 0, 99.0], PAL.crystal, { rotX: Math.PI / 2 }));
  parts.push(part(sph(5.6, 12), [0, -2.0, 99.0], PAL.eyeTeam));
  parts.push(part(sph(2.8, 10), [0, -4.4, 99.0], PAL.crystalHot));
  // Hooded lamp on the shaft.
  parts.push(part(bbox(10.0, 2.2, 7.0, 0.7), [0, -7.6, 44.0], PAL.rockDeep));
  parts.push(part(bbox(6.6, 1.6, 4.6, 0.6), [0, -8.4, 44.4], PAL.crystalHot));
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
  /**
   * OBSIDIAN BASTION — a fortified KEEP filling the tile with four corner spires.
   *
   * At aa5c5f6 this measured 88% vertical but **33%** flat: the keep stood on a plate that showed around it. The keep
   * walls now rise from the tile edge, with crenellations and spires on the corners.
   */
  parts.push(...hall(2, { height: 40, wall: 4.2, mat: PAL.ironOld, roof: PAL.steelDeep }));
  /**
   * FOUR CORNER SPIRES, taller than the keep — the gothic silhouette.
   */
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    parts.push(part(cyl(7.0, 6.0, 46.0, 8), [sx * 26.0, sy * 26.0, 2.0], PAL.steelDeep));
    parts.push(part(cone(8.6, 13.0, 8), [sx * 26.0, sy * 26.0, 48.0], PAL.ironOld));
    parts.push(part(prism(2.0, 7.0, 5), [sx * 26.0, sy * 26.0, 60.0], PAL.crystalHot));
  }
  /**
   * CRENELLATIONS along the parapet between the spires.
   */
  for (const oy of [-27, 27]) {
    for (let i = -2; i <= 2; i++) parts.push(part(bbox(4.4, 4.4, 4.6, 0.8), [i * 9.6, oy, 42.0], PAL.steel));
  }
  for (const ox of [-27, 27]) {
    for (let i = -1; i <= 1; i++) parts.push(part(bbox(4.4, 4.4, 4.6, 0.8), [ox, i * 9.6, 42.0], PAL.steel));
  }
  // Banners on two faces.
  parts.push(part(plate(9.0, 7.0, 13.0, 1.2), [0, -29.0, 20.0], PAL.bannerTeam));
  parts.push(part(plate(9.0, 7.0, 13.0, 1.2), [0, 29.0, 20.0], PAL.bannerTeam));
  return { parts };
}


/**
 * INFERNO BEACON — 2x2. SILHOUETTE: an open iron cage with a fire inside. The only structure you can
 * see through.
 */
function infernoBeacon(): Assembly {
  const parts: Part[] = [...plinth(2, 2.6)];
  /**
   * INFERNO BEACON — an iron BRAZIER on a stone furnace hall that fills the tile.
   *
   * At aa5c5f6 this measured 86% vertical but **30%** flat: the cage stood on a plate that showed around it. The furnace
   * hall now occupies the footprint and the brazier rises from its roof.
   */
  parts.push(...hall(2, { height: 24, wall: 3.4, mat: PAL.ironOld, roof: PAL.steel }));
  /**
   * THE BRAZIER — a wide iron bowl with a ring of bars and fire burning up through them.
   */
  parts.push(part(cyl(17.0, 14.0, 9.0, 14), [0, 0, 25.0], PAL.ironOld));
  parts.push(part(prism(18.0, 1.6, 14), [0, 0, 34.0], PAL.steel));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(part(cyl(1.5, 1.2, 52.0, 5), [Math.cos(a) * 15.0, Math.sin(a) * 15.0, 35.0], PAL.steelDeep));
  }
  for (const z of [44.0, 56.0, 68.0]) {
    parts.push(part(cyl(20.0, 20.0, 1.3, 14), [0, 0, z], PAL.steelDeep));
  }
  // Fire column.
  parts.push(part(sph(12.0, 14), [0, 0, 44.0], PAL.emberCore));
  parts.push(part(cone(9.0, 30.0, 9), [0, 0, 56.0], PAL.emberCore));
  parts.push(part(cone(4.4, 18.0, 7), [0, 0, 78.0], PAL.crystalHot));
  parts.push(part(cone(21.0, 10.0, 12), [0, 0, 74.0], PAL.ironOld));
  parts.push(part(cyl(21.4, 20.0, 2.6, 14), [0, 0, 70.0], PAL.trimTeam));
  return { parts };
}


/**
 * STORM CONDUCTOR — 2x2 power. SILHOUETTE: a tall mast with three angled lightning vanes.
 */
function stormConductor(): Assembly {
  const parts: Part[] = [...roundPlinth(2, 2.8)];
  /**
   * STORM CONDUCTOR — an inductor TOWER: a round hall filling the tile with a mast and an open helical coil above it,
   * crowned by splayed lightning vanes.
   *
   * At aa5c5f6 this measured 51% vertical and **35%** flat. The hall now fills the footprint so the coil rises from the
   * roofline rather than from a plate.
   */
  parts.push(...towerBody(2, { height: 30, mat: PAL.steelDeep, top: PAL.steel }));
  parts.push(part(cyl(4.0, 3.0, 40.0, 8), [0, 0, 30.0], PAL.steelDeep));
  /**
   * THE HELIX — open rings widening upward, so the coil is the widest part of the profile.
   */
  const RINGS = 6;
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1);
    const r = 9.0 + t * 9.0;
    const z = 34.0 + t * 26.0;
    parts.push(part(cyl(r, r, 1.8, 14), [0, 0, z], i % 2 === 0 ? PAL.steel : PAL.brassDeep));
  }
  /**
   * THE CROWN — six vanes splaying wide, the widest thing on the building.
   */
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(part(plate(16.0, 3.0, 1.2, 11.0), [Math.cos(a) * 16.0, Math.sin(a) * 16.0, 64.0], PAL.steel, { rotZ: a, rotY: -Math.PI / 2, rotX: 0.4 }));
    parts.push(part(sph(1.7, 8), [Math.cos(a) * 22.0, Math.sin(a) * 22.0, 68.0], PAL.crystalHot));
  }
  parts.push(part(sph(4.6, 12), [0, 0, 68.0], PAL.crystalHot));
  parts.push(part(prism(2.8, 7.0, 6), [0, 0, 74.0], PAL.aether));
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
   * SANCTUARY SPIRE — a BELL TOWER: a square shaft rising from a full-footprint base hall, flaring into an open belfry.
   *
   * At aa5c5f6 this measured 72% vertical and **34%** flat. The base hall now fills the tile, so the tower is a building
   * rather than a mast on a plate.
   */
  parts.push(...hall(2, { height: 24, wall: 3.4, mat: PAL.rock, roof: PAL.rockLit }));
  // Square shaft, tapered, in two stages.
  parts.push(part(bbox(32.0, 32.0, 24.0, 2.4, 0.82), [0, 0, 25.0], PAL.rock));
  parts.push(part(bbox(26.0, 26.0, 20.0, 2.0, 0.86), [0, 0, 49.0], PAL.rockLit));
  parts.push(part(bbox(33.0, 33.0, 2.2, 0.9), [0, 0, 49.0], PAL.brassDeep));
  /**
   * THE BELFRY — four corner posts carrying a roof slab, open at the sides, with bells hanging inside.
   */
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    parts.push(part(bbox(6.4, 6.4, 17.0, 1.2, 0.9), [sx * 11.6, sy * 11.6, 69.0], PAL.rock));
  }
  for (const [bx, by] of [[-6.0, 0], [6.0, 0]] as const) {
    parts.push(part(cyl(0.8, 0.8, 5.0, 4), [bx, by, 84.0], PAL.brass));
    parts.push(part(sph(3.6, 10), [bx, by, 78.0], PAL.brassLit, { scale: { x: 1, y: 1, z: 1.3 } }));
  }
  // Roof slab and spire.
  parts.push(part(bbox(30.0, 30.0, 3.0, 1.0, 0.96), [0, 0, 86.0], PAL.rockDeep));
  parts.push(part(cone(13.0, 11.0, 4), [0, 0, 89.0], PAL.violetDeep, { rotZ: Math.PI / 4 }));
  parts.push(part(cyl(1.8, 0.9, 14.0, 6), [0, 0, 99.0], PAL.brass));
  parts.push(part(sph(3.0, 10), [0, 0, 115.0], PAL.crystalHot));
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
   * GOLEM FORGE — a solid FORGE HALL filling the tile, with a chimney stack and an anvil on the roof.
   *
   * Zachary: "the VERTICAL mass has to fill the footprint... walls/body should rise from at or near the footprint edge."
   * At aa5c5f6 only **27%** of its pixels were above the ground diamond: a 78x66 hall sat on a 96-unit plate and the
   * plate was most of the silhouette.
   *
   * The hall now rises from the tile edge via `hall()`, so the walls are the footprint, and the chimney and anvil sit on
   * its roof where the camera reads them.
   */
  parts.push(...hall(3, { height: 46, wall: 3.8, mat: PAL.ironOld, roof: PAL.steelDeep }));
  /**
   * THE CHIMNEY — square, tall, capped with a flared crown. Square rather than round so it does not read as a spire.
   */
  parts.push(part(bbox(15.0, 15.0, 58.0, 1.8, 0.88), [16.0, 14.0, 60.0], PAL.steelDeep));
  parts.push(part(bbox(17.4, 17.4, 3.6, 0.9, 0.96), [16.0, 14.0, 118.0], PAL.steel));
  parts.push(part(bbox(15.2, 15.2, 1.8, 0.6), [16.0, 14.0, 121.6], PAL.ironOld));
  for (const z of [48.0, 62.0, 74.0]) {
    parts.push(part(bbox(15.8, 15.8, 1.7, 0.5), [16.0, 14.0, z + 44.0], PAL.brassDeep));
  }
  // Glowing flue mouth.
  parts.push(part(cyl(5.0, 4.4, 1.6, 8), [16.0, 14.0, 123.2], PAL.emberDeep));
  /**
   * THE ANVIL — a raised block with a horn, on the roof's other side. The one element that says "this building makes
   * things" rather than "this building is a box".
   */
  parts.push(part(bbox(11.0, 7.0, 3.0, 0.8), [-14.0, -6.0, 48.0], PAL.steelDeep));
  parts.push(part(bbox(7.6, 5.4, 3.6, 0.9, 0.82), [-14.0, -6.0, 51.0], PAL.ironOld));
  parts.push(part(cone(2.0, 5.0, 6), [-8.6, -6.0, 52.0], PAL.steel, { rotZ: -Math.PI / 2 }));
  parts.push(part(cyl(1.9, 1.4, 8.0, 6), [-14.0, 1.0, 49.0], PAL.stoneDeep, { rotZ: 0.5 }));
  /**
   * FURNACE MOUTH at the base of the front wall, glowing under the roofline.
   */
  parts.push(part(bbox(16.0, 2.4, 11.0, 1.0), [0, -44.0, 4.0], PAL.rockDeep));
  parts.push(part(bbox(12.0, 1.8, 8.0, 0.7), [0, -45.2, 4.4], PAL.emberCore));
  parts.push(part(bbox(7.0, 1.4, 5.0, 0.6), [0, -45.8, 4.6], PAL.crystalHot));
  // Team banners on the chimney and the roof edge.
  parts.push(part(plate(7.0, 5.2, 13.0, 1.0), [16.0, 6.0, 96.0], PAL.bannerTeam));
  parts.push(part(bbox(84.0, 84.0, 1.8, 0.6), [0, 0, 46.0], PAL.trimTeam));
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
  /**
   * WAYSTONE CAMP — SILHOUETTE: a WALLED camp. A stockade wall stands at the footprint edge with tents, a wagon and a
   * standing stone inside it.
   *
   * Zachary: "the VERTICAL mass has to fill the footprint... walls/body should rise from at or near the footprint edge."
   * This building was the worst in the roster on the honest metric — only **11%** of its pixels were above the ground
   * diamond, because it was four small tents on a 96-unit plate. The wall is what makes it occupy its tile: it rises from
   * the edge and the camp is inside it.
   */
  const parts: Part[] = [...plinth(3, 2.4)];
  /**
   * THE STOCKADE — a ring of palisade posts at the footprint edge, with a solid sill behind them.
   *
   * Posts rather than a smooth wall so the outline is ragged, which reads as a camp rather than a fortress.
   */
  const R = 44.0;
  const postCount = 22;
  for (let i = 0; i < postCount; i++) {
    const a = (i / postCount) * Math.PI * 2;
    const h = 40.0 + ((i * 5) % 4) * 4.0;
    parts.push(
      part(cyl(2.6, 2.0, h, 6), [Math.cos(a) * R, Math.sin(a) * R, 1.0], i % 2 === 0 ? PAL.wood : PAL.woodDeep, {
        rotZ: Math.cos(a) * 0.04,
      }),
    );
    parts.push(part(cone(2.6, 3.4, 6), [Math.cos(a) * R, Math.sin(a) * R, 1.0 + h], PAL.woodLit));
  }
  // Sill behind the posts, so daylight does not show through at the base.
  /**
   * A CONTINUOUS WALL behind the palisade.
   *
   * The posts alone left gaps, so the footprint measured 63% covered in plan view. A solid wall ring at the tile edge
   * closes it, and the posts read as the wall's facing.
   */
  parts.push(part(cyl(R + 2.0, R + 1.0, 18.0, 26), [0, 0, 1.0], PAL.woodDeep));

  /**
   * TENTS inside the stockade — two sizes, peaks forming a jagged rank.
   */
  const tents: [number, number, number][] = [
    [-16.0, -8.0, 52.0],
    [-6.0, -14.0, 44.0],
    [-20.0, 10.0, 48.0],
    [6.0, -12.0, 40.0],
  ];
  for (const [x, y, h] of tents) {
    parts.push(part(cone(9.0, h, 8), [x, y, 1.0], PAL.bannerTeam));
    parts.push(part(cyl(0.6, 0.5, 6.0, 5), [x, y, 1.0 + h * 0.9], PAL.wood));
    parts.push(part(plate(4.0, 1.6, 4.0, 0.4), [x + 1.8, y, 1.0 + h * 0.9 + 3.0], PAL.trimTeam));
    parts.push(part(bbox(4.2, 1.2, 7.0, 0.5, 0.7), [x, y - 7.2, 2.0], PAL.woodDeep));
  }

  /**
   * THE WAGON — boxy counter-form against the cones.
   */
  parts.push(part(bbox(16.0, 9.0, 9.0, 1.4, 0.9), [16.0, 8.0, 2.6], PAL.wood));
  parts.push(part(bbox(16.6, 9.6, 3.2, 0.9, 0.94), [16.0, 8.0, 11.6], PAL.woodDeep));
  for (const [wx, wy] of [
    [10.6, 4.4],
    [21.4, 4.4],
    [10.6, 11.6],
    [21.4, 11.6],
  ] as const) {
    parts.push(part(cyl(2.8, 2.8, 1.3, 10), [wx, wy, 3.8], PAL.ironOld, { rotX: Math.PI / 2 }));
  }

  /**
   * THE STANDING STONE — the landmark, inside the stockade.
   */
  parts.push(part(prism(4.0, 84.0, 5), [0, 0, 1.0], PAL.rockLit, { rotZ: 0.4 }));
  parts.push(part(sph(2.8, 10), [0, 0, 86.6], PAL.crystalHot));
  parts.push(part(prism(4.4, 1.3, 5), [0, 0, 24.0], PAL.runeTeam, { rotZ: 0.4 }));
  // Campfire.
  parts.push(part(cyl(3.2, 2.6, 1.3, 10), [-6.0, 6.0, 1.6], PAL.ironOld));
  parts.push(part(sph(2.0, 9), [-6.0, 6.0, 4.0], PAL.emberCore));
  return { parts };
}

