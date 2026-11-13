// UNIT ART.
//
// Each unit is a part assembly built to read at three sizes:
//   • 24-32 px  — phone, zoomed out. Only the silhouette matters.
//   • 60-80 px  — desktop play. Silhouette + one or two material breaks.
//   • 200+ px   — gallery close-up. Part detail and shading must hold up here.
//
// The silhouette rule I applied throughout: each unit owns ONE distinctive shape idea, and nothing
// else in the roster shares it.
//
//   wisp            floating teardrop + orbiting motes
//   imp_swarmling   hunched, two big horns, long arms
//   arcane_archer   tall narrow figure + a wide asymmetric bow
//   rift_familiar   low four-legged runner, whip tail
//   stone_golem     wide stacked-monolith bulk, tiny head
//   siege_behemoth  squat quadruped with a long forward cannon
//   storm_caster    robed cone + three orbiting orbs
//   rift_skimmer    flat flying manta with swept wings
//   mana_weaver     robed figure + crescent staff
//   waystone_wagon  big boxy wagon on four visible wheels
//   thornling       spiky seed-pod body, radial thorns
//   grove_warden    tall, thin, leaf-crowned archer
//   cinder_acolyte  armoured humanoid with a glowing core
//   obsidian_siege  heavy walker on two thick legs, angled cannon

import type { Assembly, Part, Shape } from './mesh';
import { MAT } from './palette';

type M = (typeof MAT)[keyof typeof MAT];

function part(shape: Shape, pos: [number, number, number], material: M, extra: Partial<Part> = {}): Part {
  return { shape, pos: { x: pos[0], y: pos[1], z: pos[2] }, material: material as never, ...extra };
}

const box = (w: number, h: number, d: number, taper?: number): Shape =>
  taper === undefined ? { kind: 'box', w, h: h, d } : { kind: 'box', w, h, d, taper };
const cyl = (r0: number, r1: number, h: number, sides = 10): Shape => ({ kind: 'cyl', r0, r1, h, sides });
const cone = (r: number, h: number, sides = 8): Shape => ({ kind: 'cone', r, h, sides });
const sph = (r: number, seg = 7): Shape => ({ kind: 'sphere', r, seg });
const prism = (r: number, h: number, sides: number): Shape => ({ kind: 'prism', r, h, sides });

/** A small sphere is a cheap "glow mote" that reads at any size. */
const mote = (r: number): Shape => ({ kind: 'sphere', r, seg: 5 });

// ------------------------------------------------------------------------------------- units

/** Wisp — a floating teardrop of light with three orbiting motes. No legs: it hovers. */
function wisp(): Assembly {
  return {
    parts: [
      part(sph(5.2, 8), [0, 0, 13], MAT.crystalHot, { scale: { x: 1, y: 1, z: 1.35 } }),
      part(cone(5.0, 7.0, 8), [0, 0, 4.6], MAT.crystal, { rotX: Math.PI }),
      part(sph(2.4), [0, 0, 21.5], MAT.crystalHot),
      part(mote(1.5), [6.4, 0, 15], MAT.aether),
      part(mote(1.5), [-4.2, 4.9, 11], MAT.aether),
      part(mote(1.2), [-3.4, -5.2, 18], MAT.aether),
      // Team-coloured core ring, so the owner is obvious at a glance.
      part(prism(6.6, 1.1, 8), [0, 0, 13.4], MAT.runeViolet, { rotZ: 0.2 }),
    ],
  };
}

/** Imp Swarmling — hunched, horned, long-armed. Deliberately asymmetric and top-heavy. */
function impSwarmling(): Assembly {
  return {
    parts: [
      // legs
      part(box(3.4, 5.2, 6), [-3.2, 1.2, 0], MAT.fleshDark, { rotZ: -0.16 }),
      part(box(3.4, 5.2, 6), [3.2, 1.2, 0], MAT.fleshDark, { rotZ: 0.16 }),
      // torso, leaning forward
      part(box(9, 7, 8, 0.78), [0, 0, 8.4], MAT.flesh, { rotX: 0.22 }),
      // hunched shoulders
      part(sph(4.4), [0, 1.4, 13.4], MAT.flesh),
      // head, low and forward
      part(box(6.4, 6.2, 5.4), [0, 2.2, 15.2], MAT.flesh),
      part(box(4.4, 2.0, 2.4), [0, 4.4, 13.4], MAT.fleshDark),
      // horns — the identifying silhouette cue
      part(cone(1.7, 6.6, 6), [-3.0, 2.4, 17.4], MAT.bone, { rotZ: 0.45, rotX: -0.2 }),
      part(cone(1.7, 6.6, 6), [3.0, 2.4, 17.4], MAT.bone, { rotZ: -0.45, rotX: -0.2 }),
      // arms
      part(cyl(1.5, 1.1, 8.5, 6), [-5.0, 1.6, 12.4], MAT.flesh, { rotZ: 0.55 }),
      part(cyl(1.5, 1.1, 8.5, 6), [5.0, 1.6, 12.4], MAT.flesh, { rotZ: -0.55 }),
      // team-coloured eyes
      part(mote(1.25), [-1.7, 4.4, 16.4], MAT.eyeGlow),
      part(mote(1.25), [1.7, 4.4, 16.4], MAT.eyeGlow),
      // tail
      part(cone(1.3, 7.5, 6), [0, -4.2, 7.6], MAT.fleshDark, { rotX: -2.3 }),
    ],
  };
}

/** Arcane Archer — tall and narrow, with a wide bow that breaks the silhouette horizontally. */
function arcaneArcher(): Assembly {
  return {
    parts: [
      part(box(2.6, 3.4, 7.0), [-2.2, 0, 0], MAT.clothDark),
      part(box(2.6, 3.4, 7.0), [2.2, 0, 0], MAT.clothDark),
      part(box(7.4, 5.4, 8.0, 0.82), [0, 0, 6.6], MAT.cloth),
      // cloak drape
      part(box(8.2, 3.0, 9.0, 0.9), [0, 1.4, 8.4], MAT.clothLight),
      part(box(5.4, 5.0, 5.0), [0, 0, 13.6], MAT.cloth),
      // head
      part(sph(3.5, 7), [0, 0, 15.4], MAT.bone),
      // hood crest
      part(cone(3.2, 6.4, 7), [0, 0.6, 17.2], MAT.clothLight, { rotX: 0.12 }),
      // bow: a tall thin arc on one side — the unit's signature
      part(cyl(0.85, 0.85, 22, 5), [5.6, 0.4, 10.4], MAT.wood, { rotZ: -0.38, rotX: 0.1 }),
      part(cyl(0.7, 0.7, 4.2, 5), [5.2, 0.2, 19.2], MAT.woodDark, { rotZ: 0.9 }),
      part(cyl(0.7, 0.7, 4.2, 5), [5.4, 0.2, 2.4], MAT.woodDark, { rotZ: -1.0 }),
      // team-coloured sash and quiver
      part(box(8.0, 1.5, 2.4), [0, 0.4, 10.6], MAT.runeViolet),
      part(cyl(1.9, 1.9, 7.6, 6), [-4.2, 0.6, 8.4], MAT.clothDark, { rotZ: 0.5 }),
      part(mote(1.0), [-5.4, 1.0, 12.4], MAT.crystal),
    ],
  };
}

/** Rift Familiar — a low, long four-legged runner with a whip tail. Fast and tiny. */
function riftFamiliar(): Assembly {
  return {
    parts: [
      // four splayed legs
      part(cyl(1.0, 0.8, 5.0, 5), [-3.4, -3.2, 0], MAT.ironDark, { rotZ: 0.12 }),
      part(cyl(1.0, 0.8, 5.0, 5), [3.4, -3.2, 0], MAT.ironDark, { rotZ: -0.12 }),
      part(cyl(1.0, 0.8, 5.0, 5), [-3.4, 3.2, 0], MAT.ironDark, { rotZ: 0.12 }),
      part(cyl(1.0, 0.8, 5.0, 5), [3.4, 3.2, 0], MAT.ironDark, { rotZ: -0.12 }),
      // long low body
      part(box(7.0, 12.5, 5.6, 0.9), [0, 0, 6.2], MAT.iron),
      part(box(6.0, 4.0, 3.2), [0, 6.6, 6.0], MAT.ironLight),
      // head with a forward-swept crest
      part(box(5.0, 4.6, 4.2), [0, 8.6, 7.4], MAT.ironDark),
      part(cone(1.2, 6.0, 5), [0, 10.2, 10.2], MAT.crystal, { rotX: -2.5 }),
      // whip tail
      part(cone(1.0, 9.0, 5), [0, -9.2, 6.0], MAT.crystalDim, { rotX: 2.4 }),
      // team-coloured spine ridge
      part(box(1.6, 11.0, 1.4), [0, 0, 9.0], MAT.runeViolet),
      part(mote(1.15), [-1.6, 9.6, 7.6], MAT.eyeGlow),
      part(mote(1.15), [1.6, 9.6, 7.6], MAT.eyeGlow),
    ],
  };
}

/** Stone Golem — wide stacked monoliths, tiny head. Mass is the whole read. */
function stoneGolem(): Assembly {
  return {
    parts: [
      // thick legs
      part(box(6.4, 6.4, 6.0), [-4.6, 0, 0], MAT.stoneDark),
      part(box(6.4, 6.4, 6.0), [4.6, 0, 0], MAT.stoneDark),
      // pelvis and torso as stacked slabs, each slightly narrower -> a ziggurat
      part(box(14.0, 8.4, 5.4), [0, 0, 6.0], MAT.stone, { rotY: 0.06 }),
      part(box(15.0, 9.0, 7.2), [0, 0, 11.4], MAT.stone),
      part(box(12.4, 8.0, 6.4), [0, 0, 18.4], MAT.stoneLight),
      // shoulder boulders
      part(sph(5.4), [-7.4, 0.6, 19.6], MAT.stone),
      part(sph(5.4), [7.4, 0.6, 19.6], MAT.stone),
      // tiny head sunk between the shoulders
      part(box(5.0, 4.6, 4.0), [0, 1.0, 22.6], MAT.stoneDark),
      part(mote(1.35), [-1.4, 2.6, 23.6], MAT.eyeGlow),
      part(mote(1.35), [1.4, 2.6, 23.6], MAT.eyeGlow),
      // huge fists
      part(box(5.4, 5.4, 5.6), [-8.6, 0.8, 11.0], MAT.stoneDark),
      part(box(5.4, 5.4, 5.6), [8.6, 0.8, 11.0], MAT.stoneDark),
      // glowing chest rune — the only team colour on the model
      part(prism(3.6, 1.0, 6), [0, -4.4, 18.0], MAT.runeViolet, { rotX: Math.PI / 2 }),
    ],
  };
}

/** Siege Behemoth — squat quadruped with a very long forward cannon. */
function siegeBehemoth(): Assembly {
  return {
    parts: [
      // four short thick legs
      part(box(5.0, 5.0, 5.0), [-7.0, -6.0, 0], MAT.stoneDark),
      part(box(5.0, 5.0, 5.0), [7.0, -6.0, 0], MAT.stoneDark),
      part(box(5.0, 5.0, 5.0), [-7.0, 6.0, 0], MAT.stoneDark),
      part(box(5.0, 5.0, 5.0), [7.0, 6.0, 0], MAT.stoneDark),
      // broad low hull
      part(box(18.0, 15.0, 8.0, 0.94), [0, 0, 5.0], MAT.ironDark),
      part(box(16.0, 13.0, 3.0), [0, 0, 12.4], MAT.brassDark),
      // turret block
      part(box(9.0, 9.0, 6.0, 0.9), [0, -1.0, 15.0], MAT.iron),
      // the long cannon, angled forward and slightly up
      part(cyl(3.0, 2.2, 22.0, 8), [0, 8.0, 18.0], MAT.ironLight, { rotX: Math.PI / 2 + 0.08 }),
      part(cyl(3.6, 3.6, 2.4, 8), [0, 17.4, 19.8], MAT.brass, { rotX: Math.PI / 2 + 0.08 }),
      part(cyl(2.4, 2.4, 1.6, 8), [0, 19.0, 20.0], MAT.flameDeep, { rotX: Math.PI / 2 + 0.08 }),
      // rear exhaust stacks
      part(cyl(2.0, 1.5, 6.4, 6), [0, -8.4, 12.0], MAT.ironDark),
      part(mote(2.2), [0, -8.4, 19.0], MAT.flameCore),
      // team banners on the flanks
      part(box(1.0, 7.0, 5.0), [-9.4, 0, 10.0], MAT.banner),
      part(box(1.0, 7.0, 5.0), [9.4, 0, 10.0], MAT.banner),
    ],
  };
}

/** Storm Caster — robed cone with three orbiting orbs. Reads as "wizard" instantly. */
function stormCaster(): Assembly {
  return {
    parts: [
      // robe: a wide cone, the stable silhouette
      part(cone(8.2, 15.0, 10), [0, 0, 0], MAT.clothDark),
      part(cone(6.0, 9.0, 10), [0, 0, 14.0], MAT.cloth),
      // shoulders / cowl
      part(sph(5.0, 7), [0, 0, 20.6], MAT.clothLight),
      part(box(4.2, 4.0, 3.6), [0, 1.4, 21.4], MAT.bone),
      part(cone(3.6, 7.6, 7), [0, 0, 23.6], MAT.clothLight, { rotX: 0.1 }),
      // staff, held out to one side
      part(cyl(1.0, 1.0, 24, 6), [7.2, 0.8, 4.0], MAT.wood, { rotZ: 0.1 }),
      part(sph(3.2, 7), [7.6, 0.8, 28.2], MAT.crystalHot),
      // three orbiting orbs at different heights and radii — the identifying motif
      part(mote(2.3), [-8.4, -2.0, 24.0], MAT.crystal),
      part(mote(1.8), [4.6, -7.2, 17.0], MAT.aether),
      part(mote(1.5), [-2.4, 7.8, 29.0], MAT.crystalHot),
      // team-coloured trim on the robe hem
      part(prism(8.4, 1.4, 10), [0, 0, 3.0], MAT.runeViolet),
    ],
  };
}

/** Rift Skimmer — flat flying manta with swept wings. Hovers, so no legs. */
function riftSkimmer(): Assembly {
  return {
    parts: [
      // central fuselage, flattened
      part(box(6.0, 13.0, 4.4, 0.7), [0, 0, 11.0], MAT.iron),
      // swept wings: two thin angled slabs
      part(box(13.0, 5.0, 1.6), [-8.4, 1.2, 12.0], MAT.ironDark, { rotZ: 0.26, rotY: 0.22 }),
      part(box(13.0, 5.0, 1.6), [8.4, 1.2, 12.0], MAT.ironDark, { rotZ: -0.26, rotY: -0.22 }),
      // wing tip vanes
      part(cone(1.5, 5.0, 5), [-14.6, 2.4, 13.6], MAT.crystalDim, { rotZ: -1.35 }),
      part(cone(1.5, 5.0, 5), [14.6, 2.4, 13.6], MAT.crystalDim, { rotZ: 1.35 }),
      // tail fin
      part(cone(2.0, 7.0, 5), [0, -8.2, 11.4], MAT.iron, { rotX: 2.2 }),
      // cockpit crystal
      part(sph(3.2, 7), [0, 3.4, 13.8], MAT.crystalHot, { scale: { x: 1, y: 1.5, z: 0.8 } }),
      // team-coloured underglow strip
      part(box(3.4, 10.0, 0.9), [0, 0, 9.4], MAT.runeViolet),
      // hover motes beneath
      part(mote(1.3), [-4.0, -3.0, 7.6], MAT.aether),
      part(mote(1.3), [4.0, -3.0, 7.6], MAT.aether),
    ],
  };
}

/** Mana Weaver — tall robed figure with a crescent staff. Deliberately the tallest small unit. */
function manaWeaver(): Assembly {
  return {
    parts: [
      part(cone(7.0, 18.0, 10), [0, 0, 0], MAT.cloth),
      part(cone(5.4, 8.0, 10), [0, 0, 17.0], MAT.clothLight),
      part(sph(4.6, 7), [0, 0, 23.6], MAT.clothDark),
      part(box(3.6, 3.4, 3.2), [0, 1.2, 24.2], MAT.bone),
      // crescent staff: an arc of three segments
      part(cyl(0.9, 0.9, 26, 6), [-6.8, 0.6, 4.0], MAT.wood, { rotZ: -0.08 }),
      part(cyl(0.9, 0.9, 6.0, 6), [-6.4, 0.6, 27.0], MAT.wood, { rotZ: 0.5 }),
      part(cyl(0.9, 0.9, 5.0, 6), [-4.2, 0.6, 30.4], MAT.wood, { rotZ: 1.1 }),
      part(sph(2.6, 7), [-6.4, 0.6, 31.4], MAT.crystalHot),
      // team-coloured rune band and sash
      part(prism(7.2, 1.3, 10), [0, 0, 6.0], MAT.runeViolet),
      part(box(6.6, 1.2, 2.0), [0, -3.4, 15.0], MAT.runeViolet),
      part(mote(1.2), [4.2, 1.6, 22.0], MAT.aether),
    ],
  };
}

/** Waystone Wagon — a big boxy wagon on four very visible wheels. */
function waystoneWagon(): Assembly {
  return {
    parts: [
      // four large wheels (prisms read as wheels when seen obliquely)
      part(prism(5.0, 3.0, 12), [-9.0, -8.0, 5.0], MAT.woodDark, { rotX: Math.PI / 2 }),
      part(prism(5.0, 3.0, 12), [9.0, -8.0, 5.0], MAT.woodDark, { rotX: Math.PI / 2 }),
      part(prism(5.0, 3.0, 12), [-9.0, 8.0, 5.0], MAT.woodDark, { rotX: Math.PI / 2 }),
      part(prism(5.0, 3.0, 12), [9.0, 8.0, 5.0], MAT.woodDark, { rotX: Math.PI / 2 }),
      part(cyl(1.8, 1.8, 18.0, 6), [0, 0, 5.0], MAT.ironDark, { rotX: Math.PI / 2 }),
      // chassis
      part(box(22.0, 20.0, 4.0), [0, 0, 9.0], MAT.wood),
      // cargo box, tapered upward
      part(box(20.0, 18.0, 13.0, 0.86), [0, 0, 12.0], MAT.woodDark),
      part(box(21.0, 19.0, 1.6), [0, 0, 24.4], MAT.iron),
      // the waystone itself: a large upright crystal on the roof
      part(prism(5.0, 16.0, 6), [0, 0, 26.0], MAT.crystal, { rotZ: 0.0 }),
      part(sph(3.0, 7), [0, 0, 42.0], MAT.crystalHot),
      // team-coloured banner poles and cloth
      part(cyl(0.8, 0.8, 12.0, 5), [-10.4, 6.0, 20.0], MAT.wood),
      part(box(0.8, 7.0, 6.0), [-10.4, 2.6, 26.0], MAT.banner),
      part(cyl(0.8, 0.8, 12.0, 5), [10.4, -6.0, 20.0], MAT.wood),
      part(box(0.8, 7.0, 6.0), [10.4, -9.4, 26.0], MAT.banner),
    ],
  };
}

/** Thornling — a spiky seed-pod body with radial thorns. Reads as hostile plant. */
function thornling(): Assembly {
  return {
    parts: [
      part(box(4.4, 4.4, 4.6), [-3.4, 0, 0], MAT.barkDark),
      part(box(4.4, 4.4, 4.6), [3.4, 0, 0], MAT.barkDark),
      // pod torso
      part(sph(7.0, 8), [0, 0, 9.0], MAT.bark, { scale: { x: 1, y: 1, z: 1.15 } }),
      // radial thorns — six cones pointing outward at different pitches
      part(cone(1.5, 8.0, 5), [0, 0, 15.6], MAT.leafDark, { rotX: 0.1 }),
      part(cone(1.3, 7.0, 5), [-7.6, 0, 11.0], MAT.barkLight, { rotZ: 1.5 }),
      part(cone(1.3, 7.0, 5), [7.6, 0, 11.0], MAT.barkLight, { rotZ: -1.5 }),
      part(cone(1.2, 6.0, 5), [0, 7.6, 8.0], MAT.barkLight, { rotX: -1.4 }),
      part(cone(1.2, 6.0, 5), [0, -7.6, 8.0], MAT.barkLight, { rotX: 1.4 }),
      part(cone(1.2, 6.4, 5), [-5.4, -5.4, 13.0], MAT.leaf, { rotZ: 0.9, rotX: 0.7 }),
      part(cone(1.2, 6.4, 5), [5.4, 5.4, 13.0], MAT.leaf, { rotZ: -0.9, rotX: -0.7 }),
      // thorn arms
      part(cone(1.6, 9.0, 5), [-8.6, 1.0, 6.0], MAT.bark, { rotZ: 2.2 }),
      part(cone(1.6, 9.0, 5), [8.6, 1.0, 6.0], MAT.bark, { rotZ: -2.2 }),
      // glowing sap eyes + team accent
      part(mote(1.35), [-2.2, 5.0, 12.4], MAT.sapGlow),
      part(mote(1.35), [2.2, 5.0, 12.4], MAT.sapGlow),
      part(prism(4.6, 0.9, 7), [0, 0, 14.2], MAT.runeViolet),
    ],
  };
}

/** Grove Warden — tall and thin, leaf-crowned, with a long bow. */
function groveWarden(): Assembly {
  return {
    parts: [
      part(box(2.6, 3.2, 6.4), [-2.0, 0, 0], MAT.barkDark),
      part(box(2.6, 3.2, 6.4), [2.0, 0, 0], MAT.barkDark),
      // slim trunk torso
      part(cyl(3.4, 4.4, 17.0, 8), [0, 0, 6.0], MAT.bark),
      part(cyl(4.6, 3.0, 5.0, 8), [0, 0, 22.0], MAT.barkLight),
      // leaf crown: stacked cones
      part(cone(6.4, 6.0, 7), [0, 0, 26.0], MAT.leafDark),
      part(cone(4.8, 5.0, 7), [0, 0, 30.0], MAT.leaf),
      part(cone(3.0, 4.4, 6), [0, 0, 33.4], MAT.leafLight),
      // bow
      part(cyl(0.8, 0.8, 21, 5), [5.4, 0, 13.0], MAT.wood, { rotZ: -0.34 }),
      part(cyl(0.62, 0.62, 4.0, 5), [4.9, 0, 22.0], MAT.woodDark, { rotZ: 0.85 }),
      part(cyl(0.62, 0.62, 4.0, 5), [5.2, 0, 4.4], MAT.woodDark, { rotZ: -0.95 }),
      // team-coloured sap runes along the trunk
      part(prism(3.8, 1.0, 8), [0, 0, 12.0], MAT.runeViolet),
      part(mote(1.15), [-1.6, 3.4, 24.0], MAT.sapGlow),
      part(mote(1.15), [1.6, 3.4, 24.0], MAT.sapGlow),
    ],
  };
}

/** Cinder Acolyte — armoured humanoid with a glowing chest core. */
function cinderAcolyte(): Assembly {
  return {
    parts: [
      part(box(3.6, 3.6, 7.0), [-2.6, 0, 0], MAT.obsidianDark),
      part(box(3.6, 3.6, 7.0), [2.6, 0, 0], MAT.obsidianDark),
      // heavy plated torso
      part(box(9.2, 7.0, 8.0, 0.88), [0, 0, 6.6], MAT.obsidian),
      part(box(10.4, 7.6, 3.0), [0, 0, 13.4], MAT.obsidianLight),
      // pauldrons
      part(box(4.6, 5.0, 3.4), [-5.6, 0, 14.2], MAT.obsidian, { rotZ: 0.25 }),
      part(box(4.6, 5.0, 3.4), [5.6, 0, 14.2], MAT.obsidian, { rotZ: -0.25 }),
      // helm with a horn crest
      part(box(5.0, 4.8, 4.6), [0, 0.4, 16.4], MAT.obsidianDark),
      part(cone(1.4, 6.0, 5), [0, 0.4, 20.4], MAT.obsidianLight, { rotX: 0.15 }),
      // chest core
      part(sph(2.6, 7), [0, -3.9, 11.4], MAT.emberGlow),
      // arms with ember gauntlets
      part(cyl(1.5, 1.3, 8.5, 6), [-5.4, 0, 12.4], MAT.obsidian, { rotZ: 0.4 }),
      part(cyl(1.5, 1.3, 8.5, 6), [5.4, 0, 12.4], MAT.obsidian, { rotZ: -0.4 }),
      part(box(3.2, 3.2, 3.2), [-6.6, 0, 4.6], MAT.emberDim),
      part(box(3.2, 3.2, 3.2), [6.6, 0, 4.6], MAT.emberDim),
      // eye slit
      part(box(3.4, 0.8, 0.8), [0, 2.0, 18.8], MAT.eyeGlow),
    ],
  };
}

/** Obsidian Siegebreaker — a heavy two-legged walker with an angled cannon. */
function obsidianSiege(): Assembly {
  return {
    parts: [
      // two thick reverse-jointed legs
      part(box(5.4, 5.4, 10.0), [-6.0, 0, 0], MAT.obsidianDark, { rotZ: 0.08 }),
      part(box(5.4, 5.4, 10.0), [6.0, 0, 0], MAT.obsidianDark, { rotZ: -0.08 }),
      part(box(7.0, 6.0, 2.4), [-6.0, 1.6, 0], MAT.obsidian, { rotZ: 0.08 }),
      part(box(7.0, 6.0, 2.4), [6.0, 1.6, 0], MAT.obsidian, { rotZ: -0.08 }),
      // hip housing
      part(box(14.0, 11.0, 5.0), [0, 0, 10.0], MAT.obsidian),
      // tall angular torso
      part(box(12.0, 10.0, 9.0, 0.8), [0, 0, 15.0], MAT.obsidianLight),
      part(box(13.0, 11.0, 2.0), [0, 0, 23.0], MAT.obsidianDark),
      // angled cannon, tilted up
      part(cyl(3.2, 2.4, 20.0, 8), [0, 9.4, 22.0], MAT.obsidianDark, { rotX: Math.PI / 2 - 0.22 }),
      part(cyl(3.8, 3.8, 2.2, 8), [0, 18.0, 24.4], MAT.iron),
      part(sph(2.0, 6), [0, 19.2, 24.8], MAT.emberGlow),
      // vent stacks
      part(cyl(1.8, 1.4, 5.0, 6), [-4.4, -6.0, 22.0], MAT.obsidianDark),
      part(mote(1.6), [-4.4, -6.0, 28.0], MAT.emberDim),
      // team-coloured furnace slits
      part(box(1.2, 8.0, 4.0), [-6.4, 0, 16.0], MAT.runeViolet),
      part(box(1.2, 8.0, 4.0), [6.4, 0, 16.0], MAT.runeViolet),
    ],
  };
}

export const UNIT_ART: Record<string, Assembly> = {
  wisp: wisp(),
  imp_swarmling: impSwarmling(),
  arcane_archer: arcaneArcher(),
  rift_familiar: riftFamiliar(),
  stone_golem: stoneGolem(),
  siege_behemoth: siegeBehemoth(),
  storm_caster: stormCaster(),
  rift_skimmer: riftSkimmer(),
  mana_weaver: manaWeaver(),
  waystone_wagon: waystoneWagon(),
  thornling: thornling(),
  grove_warden: groveWarden(),
  cinder_acolyte: cinderAcolyte(),
  obsidian_siege: obsidianSiege(),
};
