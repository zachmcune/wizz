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
import { part, bbox, tube, plate, sph, cone, cyl, prism, plinth, roundPlinth } from './shapes';

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
function riftSkimmer(): Assembly {
  const parts: Part[] = [];
  // saucer hull: three stacked discs, widest in the middle
  parts.push(part(cyl(4.0, 8.2, 2.4, 16), [0, 0, 7.0], PAL.robeDeep));
  parts.push(part(cyl(8.2, 8.2, 2.2, 16), [0, 0, 9.4], PAL.robe));
  parts.push(part(cyl(8.2, 4.4, 2.2, 16), [0, 0, 11.6], PAL.robeLit));
  // team ring around the rim
  parts.push(part(cyl(8.8, 8.8, 1.6, 16), [0, 0, 9.6], PAL.runeTeam));
  // dorsal fin: the vertical spike that makes the profile unmistakable
  parts.push(part(plate(9.0, 2.0, 0.8, 7.0), [0, 3.0, 12.6], PAL.robeDeep, { rotX: 0.42 }));
  parts.push(part(prism(1.4, 2.0, 5), [0, -1.4, 14.2], PAL.crystalHot));
  // underslung weapon pods
  parts.push(part(sph(2.0, 9), [-6.2, -1.2, 7.4], PAL.steel));
  parts.push(part(sph(2.0, 9), [6.2, -1.2, 7.4], PAL.steel));
  parts.push(part(cone(1.3, 3.0, 7), [-6.2, -3.4, 6.6], PAL.crystal, { rotX: -Math.PI / 2 }));
  parts.push(part(cone(1.3, 3.0, 7), [6.2, -3.4, 6.6], PAL.crystal, { rotX: -Math.PI / 2 }));
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
  parts.push(part(cyl(8.0, 7.4, 3.0, 12), [0, 0, 9.4], PAL.violetDeep));
  parts.push(part(cyl(6.0, 5.2, 10.0, 12), [0, 0, 10.0], PAL.violet));
  parts.push(part(prism(4.0, 13.0, 6), [0, 0, 18.0], PAL.crystal));
  parts.push(part(sph(4.4, 12), [0, 0, 33.0], PAL.crystalHot));
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(cyl(2.4, 2.0, 17.0, 8), [sx * 15.0, sy * 15.0, 3.0], PAL.rockLit));
    parts.push(part(sph(2.6, 9), [sx * 15.0, sy * 15.0, 21.4], PAL.crystalHot));
    parts.push(part(prism(2.8, 0.8, 8), [sx * 15.0, sy * 15.0, 19.0], PAL.brass));
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
  for (const s of [-1, 1] as const) {
    parts.push(part(bbox(4.6, 8.0, 22.0, 1.2, 0.88), [s * 7.6, 0, 2.4], PAL.violet));
    parts.push(part(bbox(5.4, 9.0, 2.4, 0.9), [s * 7.6, 0, 23.0], PAL.brass));
    parts.push(part(prism(3.4, 1.0, 8), [s * 7.6, 0, 12.0], PAL.runeTeam));
  }
  // the arch, built from stepped segments so the hole is real
  const SEG = 7;
  for (let i = 0; i < SEG; i++) {
    const a = Math.PI * (i / (SEG - 1));
    parts.push(part(bbox(4.4, 6.0, 3.2, 0.8), [Math.cos(a) * 7.6, 0, 25.0 + Math.sin(a) * 5.4], PAL.violet, { rotZ: -(a - Math.PI / 2) }));
  }
  // the portal surface, INSIDE the arch
  parts.push(part(plate(9.6, 9.6, 15.0, 1.0), [0, -0.6, 3.4], PAL.aether));
  parts.push(part(sph(3.0, 10), [0, -1.4, 11.0], PAL.crystalHot, { scale: { x: 1.4, y: 1, z: 1.5 } }));
  return { parts };
}

/**
 * ARCANE BUNKER — 2x2 garrison. SILHOUETTE: a LOW WIDE dome with a firing slit. The only structure
 * with no vertical element at all.
 */
function arcaneBunker(): Assembly {
  const parts: Part[] = [...plinth(2, 2.6)];
  parts.push(part(cyl(17.0, 15.0, 9.0, 10), [0, 0, 2.2], PAL.rock));
  parts.push(part(sph(15.4, 14), [0, 0, 11.0], PAL.violet, { scale: { x: 1.0, y: 1.0, z: 0.42 } }));
  parts.push(part(cyl(11.0, 11.0, 1.0, 12), [0, 0, 15.4], PAL.violetDeep));
  // firing slit with a team glow
  parts.push(part(cyl(16.2, 16.2, 2.2, 12), [0, 0, 7.0], PAL.violetDeep));
  // TEAM MARKER: a wide ring at the dome shoulder, where the top-down camera actually sees it (the
  // old thin slit at z=7.4 measured 2.4% visible).
  parts.push(part(cyl(15.8, 14.6, 2.6, 12), [0, 0, 12.4], PAL.trimTeam));
  parts.push(part(cyl(16.6, 16.6, 0.9, 12), [0, 0, 7.4], PAL.runeTeam));
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(bbox(6.0, 7.0, 7.0, 1.2, 0.8), [sx * 13.0, sy * 13.0, 2.4], PAL.rockLit));
  }
  parts.push(part(prism(2.6, 5.0, 6), [0, 0, 16.4], PAL.crystalHot));
  return { parts };
}

/**
 * ATTUNEMENT SPIRE — 2x2 support tower. SILHOUETTE: a thin shaft with THREE tuning-fork prongs.
 * Nothing else in the roster has a forked top.
 */
function attunementSpire(): Assembly {
  const parts: Part[] = [...roundPlinth(2, 3.0)];
  parts.push(part(cyl(7.0, 4.0, 28.0, 10), [0, 0, 2.6], PAL.violet));
  for (const z of [10.0, 18.0, 25.0]) {
    parts.push(part(cyl(6.2, 5.6, 1.2, 10), [0, 0, z], PAL.brass));
  }
  // TEAM MARKER: high bands on the visible upper shaft, plus lit prong tips. The old single band sat
  // low where the plinth occluded it (0.7% visible).
  parts.push(part(cyl(5.4, 4.6, 2.2, 10), [0, 0, 20.4], PAL.runeTeam));
  parts.push(part(cyl(4.6, 4.0, 1.8, 10), [0, 0, 26.0], PAL.trimTeam));
  parts.push(part(bbox(13.4, 4.4, 2.2, 0.7), [0, 0, 29.2], PAL.trimTeam));
  // the fork: three prongs
  for (const [dx, tilt] of [
    [-4.6, 0.32],
    [0, 0],
    [4.6, -0.32],
  ] as const) {
    parts.push(part(tube([[0, 0, 0, 1.5], [dx * 0.4, 0, 5.0, 1.2], [dx, 0, 10.0, 0.7]], 6), [0, 0, 29.4], PAL.violetLit, { rotZ: tilt }));
    parts.push(part(sph(1.8, 9), [dx * 1.1, 0, 39.0], PAL.crystalHot));
  }
  parts.push(part(bbox(13.0, 4.0, 1.8, 0.7), [0, 0, 29.0], PAL.rockLit));
  return { parts };
}

/**
 * RESONANCE VAULT — 2x2 upgrade. SILHOUETTE: a sealed CUBE with brass banding. In a roster of spires,
 * "the one that is just a heavy box" is itself the read.
 */
function resonanceVault(): Assembly {
  const parts: Part[] = [...plinth(2, 2.8)];
  parts.push(part(bbox(30, 30, 20.0, 3.0, 0.96), [0, 0, 2.6], PAL.violetDeep));
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(bbox(4.6, 4.6, 21.0, 1.0), [sx * 13.0, sy * 13.0, 2.4], PAL.brass));
  }
  for (const z of [8.0, 15.0]) {
    parts.push(part(bbox(31.0, 31.0, 2.0, 0.8), [0, 0, z], PAL.brassDeep));
  }
  // TEAM MARKER: raised clear of the plinth skirt onto the front face, and widened into a band that
  // wraps both visible sides. Measured at 0.2% visible before, because the old lock was occluded.
  parts.push(part(bbox(11.0, 1.8, 11.0, 1.0), [0, -16.0, 15.0], PAL.rockLit));
  parts.push(part(prism(5.0, 1.6, 6), [0, -16.8, 15.0], PAL.runeTeam, { rotX: Math.PI / 2 }));
  parts.push(part(bbox(31.4, 31.4, 2.2, 0.7), [0, 0, 21.6], PAL.trimTeam));
  parts.push(part(cone(20.0, 5.0, 4), [0, 0, 22.6], PAL.violet, { rotZ: Math.PI / 4 }));
  parts.push(part(sph(2.8, 10), [0, 0, 27.6], PAL.crystalHot));
  return { parts };
}

/**
 * LEY CONDUIT — 2x2 power. SILHOUETTE: a lattice mast with floating energy rings around it.
 */
function leyConduit(): Assembly {
  const parts: Part[] = [...plinth(2, 2.6)];
  parts.push(part(bbox(9.0, 9.0, 22.0, 1.4, 0.5), [0, 0, 2.4], PAL.steelDeep));
  for (const z of [8.0, 14.0, 20.0]) {
    parts.push(part(bbox(11.0, 11.0, 1.2, 0.5), [0, 0, z], PAL.steel));
  }
  parts.push(part(cyl(9.4, 9.4, 0.9, 14), [0, 0, 12.0], PAL.crystal));
  parts.push(part(cyl(7.4, 7.4, 0.8, 14), [0, 0, 19.0], PAL.aether));
  parts.push(part(cyl(5.4, 5.4, 0.7, 12), [0, 0, 25.0], PAL.crystalHot));
  parts.push(part(sph(3.4, 12), [0, 0, 16.0], PAL.crystalHot));
  parts.push(part(prism(4.2, 1.0, 10), [0, 0, 3.0], PAL.runeTeam));
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(tube([[0, 0, 8.0, 1.0], [Math.cos(ang) * 3.0, Math.sin(ang) * 3.0, 4.0, 0.8], [Math.cos(ang) * 6.4, Math.sin(ang) * 6.4, 0.4, 0.7]], 5), [0, 0, 2.4], PAL.steelDeep));
  }
  return { parts };
}

/**
 * ASTRAL SPIRE — 3x3 superweapon. SILHOUETTE: the tallest structure on the board, ending in a
 * floating star. Deliberately the maximum height in the game.
 */
function astralSpire(): Assembly {
  const parts: Part[] = [...roundPlinth(3, 3.6)];
  parts.push(part(cyl(18.0, 16.0, 12.0, 14), [0, 0, 3.0], PAL.rock));
  parts.push(part(cyl(14.0, 12.0, 12.0, 12), [0, 0, 15.0], PAL.violet));
  parts.push(part(cyl(10.0, 8.4, 12.0, 12), [0, 0, 27.0], PAL.violetLit));
  parts.push(part(cyl(6.4, 5.0, 10.0, 10), [0, 0, 39.0], PAL.violet));
  // TEAM MARKER: the brass rings read as gold at every team, so the spire looked identical for all
  // four players (measured 1.4% visible). These are wide TEAM-coloured bands sitting where the camera
  // sees them, between the drums.
  for (const z of [15.0, 27.0, 39.0]) {
    parts.push(part(prism(15.6, 1.4, 12), [0, 0, z], PAL.brass));
  }
  parts.push(part(cyl(16.4, 15.2, 3.0, 14), [0, 0, 15.0], PAL.trimTeam));
  parts.push(part(cyl(12.4, 11.4, 2.8, 12), [0, 0, 27.0], PAL.runeTeam));
  parts.push(part(cyl(8.8, 7.8, 2.6, 12), [0, 0, 39.0], PAL.trimTeam));
  parts.push(part(prism(4.4, 1.2, 8), [0, 0, 20.0], PAL.runeTeam));
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
  const parts: Part[] = [...plinth(3, 3.2)];
  parts.push(part(cyl(19.0, 17.0, 9.0, 10), [0, 0, 2.6], PAL.rock));
  parts.push(part(cyl(20.0, 20.0, 1.4, 10), [0, 0, 11.4], PAL.rockLit));
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(tube([[0, 0, 9.0, 1.8], [Math.cos(ang) * 7.0, Math.sin(ang) * 7.0, 4.0, 1.4], [Math.cos(ang) * 12.0, Math.sin(ang) * 12.0, 0.6, 1.2]], 6), [0, 0, 2.6], PAL.steelDeep));
    parts.push(part(bbox(5.0, 5.0, 2.0, 0.8), [Math.cos(ang) * 13.0, Math.sin(ang) * 13.0, 1.2], PAL.steelDeep));
  }
  parts.push(part(bbox(20.0, 18.0, 11.0, 2.2, 0.9), [0, 0, 12.0], PAL.violet));
  parts.push(part(prism(9.0, 1.2, 10), [0, 0, 23.4], PAL.runeTeam));
  // the barrel: one massive tapered tube angled up and forward
  parts.push(part(tube([[0, 0, 0, 5.0], [0, -10.0, 0.6, 4.2], [0, -20.0, 1.4, 3.6], [0, -27.0, 2.0, 3.2]], 12), [0, -1.0, 20.0], PAL.steel));
  parts.push(part(cyl(3.6, 3.6, 2.0, 12), [0, -28.6, 22.4], PAL.brass));
  parts.push(part(sph(2.8, 10), [0, -30.6, 22.6], PAL.crystalHot));
  parts.push(part(bbox(9.0, 9.0, 9.0, 1.8), [0, -1.0, 20.0], PAL.steelDeep));
  for (const s of [-1, 1] as const) {
    parts.push(part(cyl(1.6, 1.4, 12.0, 8), [s * 4.4, -10.0, 19.4], PAL.brass, { rotX: -Math.PI / 2 }));
  }
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
  parts.push(part(prism(8.4, 34.0, 4), [0, 0, 2.6], PAL.violetDeep, { rotZ: Math.PI / 4 }));
  parts.push(part(prism(9.0, 1.4, 4), [0, 0, 4.0], PAL.brass, { rotZ: Math.PI / 4 }));
  // TEAM MARKER: the monolith is a 4-sided prism 8.4 across, so a band "around" it at radius 6.6 was
  // still buried inside the taper. These rings are deliberately OVERSIZED (radius 7.6 at the widest
  // point, and a flared collar at the top) so they stand proud of the stone and are visible from above.
  parts.push(part(cyl(8.2, 7.6, 3.0, 4), [0, 0, 14.0], PAL.trimTeam, { rotZ: Math.PI / 4 }));
  parts.push(part(cyl(7.6, 7.0, 2.8, 4), [0, 0, 25.0], PAL.runeTeam, { rotZ: Math.PI / 4 }));
  parts.push(part(cyl(7.4, 5.6, 2.4, 10), [0, 0, 34.0], PAL.trimTeam));
  parts.push(part(bbox(1.6, 2.0, 20.0, 0.6), [0, -5.4, 8.0], PAL.crystalDeep));
  // the floating eye: two opposed cones forming an almond, with a hot iris
  for (const s of [-1, 1] as const) {
    parts.push(part(cone(4.6, 4.2, 10), [0, 0, s * 2.0], PAL.violetLit, { rotX: (s * Math.PI) / 2, pos: { x: 0, y: 0, z: 38.0 } }));
  }
  parts.push(part(sph(2.8, 12), [0, -3.4, 38.0], PAL.eyeTeam));
  parts.push(part(sph(1.4, 8), [0, -4.4, 38.0], PAL.crystalHot));
  for (const s of [-1, 1] as const) {
    parts.push(part(tube([[0, 0, 0, 0.9], [s * 2.0, 0, 2.6, 0.6], [s * 2.6, 0, 5.2, 0.35]], 5), [0, 0, 35.0], PAL.brass));
  }
  return { parts };
}

/**
 * SUMMONING CIRCLE — 2x2. SILHOUETTE: a flat ring on the ground ringed by standing stones.
 * The lowest structure in the game and the only mostly-flat one.
 */
function summoningCircle(): Assembly {
  const parts: Part[] = [];
  /**
   * SQUARE STONE FOOTING, round ritual dais above it.
   *
   * A circle cannot meet a square footprint: inscribed, it reaches only the edge midpoints, so its
   * projected width is 1/sqrt(2) (70.7%) of the tile diamond and the whole building reads as a coin
   * resting inside the tile rather than a foundation meeting the ground. The footing course is square
   * and spans the full 2x2 footprint; the circle is then correctly inscribed on top of it.
   */
  parts.push(part(bbox(64.0, 64.0, 2.2, 1.6, 0.97), [0, 0, 0], PAL.rockDeep));
  parts.push(part(cyl(30.0, 29.0, 1.0, 20), [0, 0, 2.2], PAL.rock));
  parts.push(part(cyl(23.0, 23.0, 0.35, 20), [0, 0, 3.2], PAL.emberDeep));
  parts.push(part(cyl(14.0, 14.0, 0.35, 20), [0, 0, 3.3], PAL.emberCore));
  parts.push(part(cyl(25.0, 25.0, 0.2, 20), [0, 0, 3.4], PAL.runeTeam));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = 8.0 + ((i * 5) % 4) * 1.4;
    parts.push(part(bbox(3.4, 2.4, h, 0.7, 0.86), [Math.cos(a) * 14.6, Math.sin(a) * 14.6, 3.0], PAL.ironOld, { rotZ: a + Math.PI / 2 }));
    parts.push(part(sph(1.2, 8), [Math.cos(a) * 14.6, Math.sin(a) * 14.6, 3.0 + h], PAL.emberCore));
  }
  parts.push(part(sph(3.6, 12), [0, 0, 11.0], PAL.emberCore));
  parts.push(part(prism(2.0, 5.0, 6), [0, 0, 14.0], PAL.emberDeep));
  return { parts };
}

/**
 * OBSIDIAN BASTION — 2x2 defence. SILHOUETTE: a squat square keep with crenellations. All hard right
 * angles — the deliberate opposite of the Arcane spires.
 */
function obsidianBastion(): Assembly {
  const parts: Part[] = [...plinth(2, 2.8)];
  parts.push(part(bbox(30, 30, 24.0, 2.4, 0.94), [0, 0, 2.6], PAL.ironOld));
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(part(cyl(5.0, 4.6, 20.0, 8), [sx * 15.0, sy * 15.0, 2.6], PAL.steelDeep));
    parts.push(part(cone(5.6, 6.0, 8), [sx * 15.0, sy * 15.0, 22.6], PAL.ironOld));
  }
  for (let i = -2; i <= 2; i++) {
    parts.push(part(bbox(3.2, 3.2, 3.4, 0.7), [i * 5.4, -14.0, 26.6], PAL.steel));
    parts.push(part(bbox(3.2, 3.2, 3.4, 0.7), [i * 5.4, 14.0, 26.6], PAL.steel));
  }
  for (let i = -1; i <= 1; i++) {
    parts.push(part(bbox(3.2, 3.2, 3.4, 0.7), [-14.0, i * 5.4, 26.6], PAL.steel));
    parts.push(part(bbox(3.2, 3.2, 3.4, 0.7), [14.0, i * 5.4, 26.6], PAL.steel));
  }
  // TEAM MARKER: this structure had NO team-tinted geometry at all, so both players' bastions looked
  // identical. Three bold elements fix it: a rune band around the keep, hanging banners on two faces,
  // and a lit ring under the brazier.
  parts.push(bbox(31.6, 31.6, 2.6, 0.7) && part(bbox(31.6, 31.6, 2.4, 0.7), [0, 0, 20.6], PAL.trimTeam));
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
  parts.push(part(cyl(11.0, 9.0, 7.0, 10), [0, 0, 2.6], PAL.ironOld));
  parts.push(part(prism(11.6, 1.2, 10), [0, 0, 9.0], PAL.steel));
  // fire inside the cage
  parts.push(part(sph(5.4, 12), [0, 0, 19.0], PAL.emberCore));
  parts.push(part(cone(3.4, 9.0, 7), [0, 0, 24.0], PAL.emberCore));
  // vertical iron bars, open between them
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(part(cyl(0.7, 0.6, 18.0, 5), [Math.cos(a) * 7.4, Math.sin(a) * 7.4, 10.0], PAL.steelDeep));
  }
  for (const z of [13.0, 20.0, 27.0]) {
    parts.push(part(cyl(7.8, 7.8, 0.8, 12), [0, 0, z], PAL.steelDeep));
  }
  parts.push(part(cone(8.4, 6.0, 10), [0, 0, 27.6], PAL.ironOld));
  // TEAM MARKER: a wide lit ring at the cage shoulder plus a band on the roof cone, both visible from
  // the game camera.
  parts.push(part(cyl(8.4, 8.4, 2.0, 12), [0, 0, 27.0], PAL.trimTeam));
  parts.push(part(cyl(6.6, 5.0, 1.8, 10), [0, 0, 31.4], PAL.runeTeam));
  parts.push(part(cyl(11.4, 11.4, 1.0, 10), [0, 0, 5.4], PAL.runeTeam));
  return { parts };
}

/**
 * STORM CONDUCTOR — 2x2 power. SILHOUETTE: a tall mast with three angled lightning vanes.
 */
function stormConductor(): Assembly {
  const parts: Part[] = [...roundPlinth(2, 2.8)];
  parts.push(part(cyl(3.6, 2.2, 34.0, 8), [0, 0, 2.6], PAL.steelDeep));
  for (const z of [10.0, 16.0, 22.0, 28.0]) {
    parts.push(part(cyl(5.0, 5.0, 0.8, 8), [0, 0, z], PAL.steel));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(part(plate(7.0, 2.4, 1.0, 8.0), [Math.cos(a) * 4.4, Math.sin(a) * 4.4, 31.0], PAL.steel, { rotZ: a, rotY: -Math.PI / 2 }));
  }
  parts.push(part(sph(3.2, 12), [0, 0, 37.0], PAL.crystalHot));
  // TEAM MARKER: high bands on the visible mast, where the old base ring was occluded (1.8%).
  parts.push(part(cyl(4.4, 4.4, 2.4, 8), [0, 0, 24.0], PAL.trimTeam));
  parts.push(part(cyl(4.0, 4.0, 2.0, 8), [0, 0, 30.0], PAL.runeTeam));
  parts.push(part(prism(4.4, 1.4, 8), [0, 0, 4.0], PAL.runeTeam));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(tube([[0, 0, 0, 0.35], [Math.cos(a) * 4.0, Math.sin(a) * 4.0, -4.0, 0.3], [Math.cos(a) * 8.0, Math.sin(a) * 8.0, -8.0, 0.25]], 4), [0, 0, 14.0], PAL.brass));
  }
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
  parts.push(part(cyl(8.0, 10.0, 22.0, 12), [0, 0, 2.8], PAL.rockLit));
  parts.push(part(cyl(10.4, 10.4, 2.4, 12), [0, 0, 24.8], PAL.rock));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(bbox(3.2, 1.6, 8.0, 0.8, 0.9), [Math.cos(a) * 8.6, Math.sin(a) * 8.6, 15.0], PAL.violetDeep, { rotZ: a + Math.PI / 2 }));
  }
  parts.push(part(sph(10.4, 14), [0, 0, 27.2], PAL.violet, { scale: { x: 1, y: 1, z: 0.72 } }));
  parts.push(part(prism(10.6, 1.2, 12), [0, 0, 26.8], PAL.brass));
  // the luminous teardrop
  parts.push(part(tube([[0, 0, 0, 1.2], [0, 0, 2.6, 3.2], [0, 0, 6.0, 4.0], [0, 0, 9.4, 2.6], [0, 0, 12.0, 0.6]], 10), [0, 0, 33.0], PAL.crystalHot));
  parts.push(part(sph(2.6, 10), [0, 0, 38.0], PAL.eyeTeam));
  // TEAM MARKER: on the belfry, above the flare, where the camera sees it (was 1.8% at the base).
  parts.push(part(cyl(9.4, 8.6, 2.4, 12), [0, 0, 21.6], PAL.trimTeam));
  parts.push(part(cyl(10.8, 10.8, 1.6, 12), [0, 0, 26.2], PAL.runeTeam));
  parts.push(part(prism(8.4, 1.0, 12), [0, 0, 8.0], PAL.runeTeam));
  return { parts };
}

/**
 * GOLEM FORGE — 3x3 production. SILHOUETTE: a wide forge hall with a TALL chimney. The chimney is the
 * identifier; the glowing furnace mouth shows what it does.
 */
function golemForge(): Assembly {
  const parts: Part[] = [...plinth(3, 3.2)];
  parts.push(part(bbox(34, 30, 16.0, 2.6, 0.94), [0, 0, 2.8], PAL.ironOld));
  parts.push(part(bbox(36, 32, 2.4, 1.0, 0.98), [0, 0, 18.4], PAL.steelDeep));
  // tall chimney
  parts.push(part(cyl(5.4, 4.2, 30.0, 10), [-11.0, 8.0, 2.8], PAL.steelDeep));
  parts.push(part(prism(6.2, 2.0, 10), [-11.0, 8.0, 32.0], PAL.steel));
  parts.push(part(cyl(4.6, 4.6, 1.2, 10), [-11.0, 8.0, 20.0], PAL.brass));
  // furnace mouth
  parts.push(part(bbox(13.0, 2.0, 11.0, 1.0), [0, -15.6, 4.0], PAL.rockDeep));
  parts.push(part(bbox(10.0, 1.4, 8.6, 0.6), [0, -16.4, 4.0], PAL.emberCore));
  for (const s of [-1, 1] as const) {
    parts.push(part(bbox(4.4, 6.0, 14.0, 1.0, 0.7), [s * 16.0, 0, 2.8], PAL.steelDeep));
  }
  // TEAM MARKER: the forge is a huge iron mass, so one small banner was lost. A full rune band around
  // the hall plus roof trim and two hanging banners make ownership legible.
  parts.push(part(bbox(35.0, 31.0, 2.2, 0.7), [0, 0, 12.0], PAL.runeTeam));
  parts.push(part(bbox(37.0, 33.0, 1.6, 0.6), [0, 0, 19.4], PAL.trimTeam));
  parts.push(part(plate(7.0, 5.4, 9.0, 1.0), [0, -15.8, 6.0], PAL.bannerTeam));
  parts.push(part(plate(6.0, 4.6, 8.0, 1.0), [-11.0, 8.0, 22.0], PAL.bannerTeam));
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
 * THORN GROVE — 2x2 defence. SILHOUETTE: a low matted dome of vines bristling with thorns. The only
 * structure with an irregular, organic outline.
 */
function thornGrove(): Assembly {
  const parts: Part[] = [];
  /**
   * SQUARE EARTH FOOTING under the mound.
   *
   * Same reason as the summoning circle: a round mound is inscribed in its square footprint, reaching
   * only 70.7% of the tile diamond, so the grove looked like it was hovering in the middle of its tiles.
   * A low, square footing spans the full 2x2 footprint and gives the tendrils something to grow out of
   * that visibly meets the ground.
   *
   * It is TEAM-TINTED moss rather than plain earth: the footing is now the largest surface on the model,
   * and neutral earth made the grove read as unclaimed scenery. Ownership has to be legible at default
   * zoom, and the ground the grove grows out of is the natural place to show it.
   */
  parts.push(part(bbox(64.0, 64.0, 1.8, 2.0, 0.98), [0, 0, 0], PAL.runeTeam));
  parts.push(part(cyl(28.0, 27.0, 1.4, 16), [0, 0, 1.6], PAL.rockMoss));
  // tangled body: overlapping flattened spheres, deliberately uneven
  for (const [x, y, z, r] of [
    [0, 0, 5.0, 7.4],
    [-6.0, 2.0, 4.4, 5.4],
    [6.2, 1.0, 4.6, 5.6],
    [-2.0, -6.0, 4.8, 5.8],
    [3.0, 6.0, 4.2, 5.2],
  ] as const) {
    parts.push(part(sph(r, 10), [x, y, z], PAL.leafDeep, { scale: { x: 1.2, y: 1.1, z: 0.62 } }));
  }
  // second lighter layer, so it has depth instead of reading as one blob
  parts.push(part(sph(6.4, 10), [-2.0, 1.0, 9.0], PAL.leaf, { scale: { x: 1.15, y: 1.0, z: 0.6 } }));
  parts.push(part(sph(4.8, 10), [4.0, -2.4, 9.6], PAL.leafLit, { scale: { x: 1.1, y: 1.0, z: 0.55 } }));
  // thorns projecting outward at varied angles
  for (const [dx, dy, len, spread, r] of [
    [-1.1, 0.0, 8.0, 4.0, 0.9],
    [1.1, 0.2, 8.4, 4.6, 1.0],
    [-0.6, 1.6, 6.4, 3.4, 0.75],
    [0.6, -1.5, 6.6, 3.6, 0.8],
    [0.0, 2.6, 7.0, 4.2, 0.9],
    [0.2, -2.6, 7.4, 4.4, 0.95],
  ] as const) {
    parts.push(part(cone(r, len, 6), [dx * spread, dy * spread, 7.0], PAL.boneDeep, { rotZ: -dx * 1.1, rotX: dy * 1.1 }));
  }
  // team flower cluster at the crown
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(sph(1.1, 8), [Math.cos(a) * 1.6, Math.sin(a) * 1.6, 12.6], PAL.trimTeam));
  }
  parts.push(part(sph(1.4, 8), [0, 0, 13.0], PAL.eyeTeam));
  return { parts };
}

/**
 * WAYSTONE CAMP — 3x3 forward base. SILHOUETTE: a ring of TENTS around a standing stone. The only
 * structure made of cloth rather than stone.
 */
function waystoneCamp(): Assembly {
  const parts: Part[] = [...plinth(3, 2.4)];
  parts.push(part(cyl(20.0, 19.0, 1.6, 12), [0, 0, 2.2], PAL.rock));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 12.0;
    const y = Math.sin(a) * 12.0;
    parts.push(part(cone(6.4, 15.0, 8), [x, y, 3.4], PAL.bannerTeam));
    parts.push(part(cyl(0.5, 0.5, 4.0, 5), [x, y, 17.4], PAL.wood));
    parts.push(part(sph(0.9, 6), [x, y, 21.0], PAL.trimTeam));
    parts.push(part(bbox(2.4, 1.2, 4.6, 0.5, 0.7), [x * 1.16, y * 1.16, 3.6], PAL.woodDeep, { rotZ: a + Math.PI / 2 }));
  }
  // the standing stone at the centre
  parts.push(part(prism(4.6, 26.0, 5), [0, 0, 3.0], PAL.rockLit, { rotZ: 0.4 }));
  parts.push(part(sph(2.6, 10), [0, 0, 28.0], PAL.crystalHot));
  parts.push(part(prism(4.8, 1.0, 5), [0, 0, 14.0], PAL.runeTeam, { rotZ: 0.4 }));
  // campfire
  parts.push(part(cyl(3.0, 2.4, 1.2, 10), [0, -7.0, 3.2], PAL.ironOld));
  parts.push(part(sph(1.8, 9), [0, -7.0, 5.0], PAL.emberCore));
  // low fence
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(part(cyl(0.4, 0.35, 3.0, 5), [Math.cos(a) * 19.0, Math.sin(a) * 19.0, 2.4], PAL.woodDeep));
  }
  return { parts };
}
