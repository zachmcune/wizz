// BUILDING ART.
//
// Buildings are seen from a fixed oblique angle and are much larger on screen, so they get more part
// detail than units: base plinth, main mass, roof, and one identifying feature. The identifying
// feature per building is what a player actually reads on the battlefield:
//
//   sanctum           tiered crown + floating orb
//   attunement_spire  tall thin spire with a rotating ring of crystal
//   resonance_vault   squat domed vault with brass ribs
//   ley_conduit       pylon bundle venting power orbs
//   summoning_circle  flat platform with a raised rune ring
//   golem_forge      industrial block with a huge chimney and glowing furnace mouth
//   arcane_nexus     4-legged floating platform holding an obelisk
//   astral_spire     very tall spire with three floating rings (the tallest building)
//   scrying_obelisk  a leaning monolith with an eye-lens
//   arcane_sentry    a small tripod with a crystal cluster
//   frost_spire      an ice-shard tower, pale and jagged
//   inferno_beacon   a brazier tower with an open flame bowl
//   storm_conductor  a tesla-mast with cross arms
//   celestial_cannon a huge tilted barrel on a heavy base
//   sanctuary_spire  a curved arch with a hanging light
//   arcane_bunker    a low thick block with slit windows
//   stone_wall       a stacked-block barrier
//   arcane_gate      two pillars with a lintel and an energy curtain
//   waystone_camp    a tented camp with a banner and a crystal
//   thorn_grove      a dense hedge of thorns and leaves
//   obsidian_bastion a black angular keep with ember windows

import type { Assembly, Part, Shape } from './mesh';
import { MAT } from './palette';

type M = (typeof MAT)[keyof typeof MAT];

function part(shape: Shape, pos: [number, number, number], material: M, extra: Partial<Part> = {}): Part {
  return { shape, pos: { x: pos[0], y: pos[1], z: pos[2] }, material: material as never, ...extra };
}

const box = (w: number, h: number, d: number, taper?: number): Shape =>
  taper === undefined ? { kind: 'box', w, h, d } : { kind: 'box', w, h, d, taper };
const cyl = (r0: number, r1: number, h: number, sides = 10): Shape => ({ kind: 'cyl', r0, r1, h, sides });
const cone = (r: number, h: number, sides = 8): Shape => ({ kind: 'cone', r, h, sides });
const sph = (r: number, seg = 8): Shape => ({ kind: 'sphere', r, seg });
const prism = (r: number, h: number, sides: number): Shape => ({ kind: 'prism', r, h, sides });

/** Shared plinth so every building sits on the ground convincingly. */
function plinth(w: number, d: number, h = 2.4): Part[] {
  return [
    part(box(w + 3, d + 3, h * 0.5), [0, 0, 0], MAT.voidDark),
    part(box(w + 1.2, d + 1.2, h), [0, 0, h * 0.4], MAT.stoneDark),
  ];
}

/** Four corner buttresses, used by the heavier structures. */
function buttresses(w: number, d: number, h: number, material: M = MAT.stoneDark): Part[] {
  const out: Part[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      out.push(part(box(3.2, 3.2, h), [(sx * w) / 2, (sy * d) / 2, 0], material, { rotZ: 0 }));
    }
  }
  return out;
}

function sanctum(): Assembly {
  // A Sanctum has to read as a COMMAND CENTRE: tall, tiered, with a bright crown. The first attempt
  // used three wide drums (r=27/21/15) at low heights, which the oblique camera foreshortened into a
  // featureless dome. The fix is narrower tiers and much more vertical spacing, so the silhouette is
  // a stepped tower rather than a squashed bowl.
  return {
    parts: [
      ...plinth(46, 46, 3.0),
      // Base block: square, not round, so there is a clear "building" footprint.
      part(box(38, 38, 9, 0.92), [0, 0, 3.0], MAT.stone),
      part(box(40, 40, 2.4), [0, 0, 12.0], MAT.stoneLight),
      // Tier 1: a narrow drum with bright windows.
      part(cyl(14, 13, 12, 12), [0, 0, 14.0], MAT.void),
      part(prism(13.2, 1.8, 12), [0, 0, 20.0], MAT.crystalHot),
      // Tier 2: narrower again, with buttress fins for vertical emphasis.
      part(cyl(10.5, 9.5, 12, 12), [0, 0, 28.0], MAT.voidLight),
      ...[-1, 0, 1].map((i) => part(box(2.2, 5.0, 16.0), [i * 9.6, 0, 25.0], MAT.stoneLight)),
      part(prism(9.8, 1.6, 12), [0, 0, 32.0], MAT.crystalHot),
      // Tier 3: the crown drum.
      part(cyl(7.6, 6.8, 12, 10), [0, 0, 41.0], MAT.void),
      part(prism(7.0, 1.4, 10), [0, 0, 45.0], MAT.aether),
      // Four tall crown fins + the obelisk + the floating orb.
      part(box(2.6, 2.6, 14.0), [-7.0, -7.0, 50.0], MAT.voidLight),
      part(box(2.6, 2.6, 14.0), [7.0, -7.0, 50.0], MAT.voidLight),
      part(box(2.6, 2.6, 14.0), [-7.0, 7.0, 50.0], MAT.voidLight),
      part(box(2.6, 2.6, 14.0), [7.0, 7.0, 50.0], MAT.voidLight),
      part(prism(4.4, 16, 6), [0, 0, 50.0], MAT.stoneLight),
      part(sph(6.0, 9), [0, 0, 71.0], MAT.crystalHot),
      part(prism(9.0, 1.2, 8), [0, 0, 63.0], MAT.aether),
      // Entrance arch on the front face.
      part(box(12.0, 1.6, 12.0), [0, -19.6, 3.0], MAT.stoneLight),
      part(box(9.0, 1.0, 9.0), [0, -20.0, 4.6], MAT.crystalHot),
      // Banners.
      part(cyl(0.9, 0.9, 18, 5), [-18.0, -18.0, 11.0], MAT.wood),
      part(box(0.9, 8.0, 9.0), [-18.0, -21.6, 21.0], MAT.banner),
      part(cyl(0.9, 0.9, 18, 5), [18.0, 18.0, 11.0], MAT.wood),
      part(box(0.9, 8.0, 9.0), [18.0, 21.6, 21.0], MAT.banner),
    ],
  };
}

function attunementSpire(): Assembly {
  return {
    parts: [
      ...plinth(42, 42, 2.6),
      part(cyl(15, 13, 8, 10), [0, 0, 2.4], MAT.stone),
      // main tower
      part(cyl(9.5, 6.0, 30, 10), [0, 0, 10.0], MAT.stoneLight),
      part(cyl(6.6, 6.6, 2.4, 10), [0, 0, 30.0], MAT.brass),
      // crystal at the top plus an orbiting ring — the identifying feature
      part(crystalCluster(0, 0, 33.0, 7.0), [0, 0, 0], MAT.crystal),
      part(prism(15.0, 1.1, 12), [0, 0, 40.0], MAT.crystalDim, { rotZ: 0.3 }),
      part(prism(13.0, 1.0, 12), [0, 0, 40.0], MAT.crystalDim, { rotZ: 1.4, rotY: 0.8 }),
      // intake pipes to the ground
      part(cyl(2.4, 2.4, 16, 6), [-13.0, -9.0, 2.0], MAT.brassDark, { rotX: 0.25 }),
      part(cyl(2.4, 2.4, 16, 6), [13.0, 9.0, 2.0], MAT.brassDark, { rotX: 0.25 }),
      // team band
      part(prism(14.4, 1.6, 10), [0, 0, 12.0], MAT.runeViolet),
    ],
  };
}

/** A cluster of crystals around a point, used by several buildings. */
function crystalCluster(x: number, y: number, z: number, size: number): Shape {
  return prism(size, size * 2.4, 6);
}

function resonanceVault(): Assembly {
  return {
    parts: [
      ...plinth(40, 40, 2.4),
      part(box(32, 32, 12, 0.92), [0, 0, 2.0], MAT.stone),
      // squat dome
      part(sph(17, 10), [0, 0, 14.0], MAT.stoneLight, { scale: { x: 1, y: 1, z: 0.62 } }),
      // brass ribs over the dome
      part(prism(17.4, 1.0, 14), [0, 0, 15.0], MAT.brass),
      part(prism(13.0, 1.0, 14), [0, 0, 20.0], MAT.brass),
      // crown crystal
      part(prism(5.0, 12.0, 6), [0, 0, 24.0], MAT.crystal),
      // vault door
      part(box(11.0, 1.6, 10.0), [0, -16.4, 2.0], MAT.ironDark),
      part(prism(5.0, 1.4, 10), [0, -16.8, 7.0], MAT.runeViolet, { rotX: Math.PI / 2 }),
      // side pillars
      part(cyl(3.0, 2.4, 14, 8), [-15.0, -11.0, 2.0], MAT.stoneDark),
      part(cyl(3.0, 2.4, 14, 8), [15.0, -11.0, 2.0], MAT.stoneDark),
    ],
  };
}

function leyConduit(): Assembly {
  return {
    parts: [
      ...plinth(34, 34, 2.2),
      part(box(24, 24, 7), [0, 0, 2.0], MAT.stone),
      // three pylons of different heights
      part(cyl(4.0, 2.4, 26, 8), [-7.0, -3.0, 7.0], MAT.iron),
      part(cyl(3.4, 2.0, 20, 8), [7.0, 4.0, 7.0], MAT.iron),
      part(cyl(3.0, 1.8, 15, 8), [5.0, -8.0, 7.0], MAT.iron),
      // power orbs
      part(sph(4.2, 8), [-7.0, -3.0, 35.0], MAT.crystalHot),
      part(sph(3.2, 8), [7.0, 4.0, 28.0], MAT.crystal),
      part(sph(2.6, 8), [5.0, -8.0, 23.0], MAT.aether),
      // arcing connector
      part(cyl(1.2, 1.2, 15, 5), [0, 0.5, 30.0], MAT.brass, { rotZ: 1.2 }),
      // team rune band
      part(prism(12.4, 1.2, 8), [0, 0, 9.0], MAT.runeViolet),
    ],
  };
}

function summoningCircle(): Assembly {
  return {
    parts: [
      ...plinth(44, 44, 1.6),
      // flat platform
      part(cyl(18, 18, 2.0, 16), [0, 0, 1.2], MAT.stoneLight),
      // raised rune ring
      part(prism(17.0, 1.0, 16), [0, 0, 3.4], MAT.runeViolet),
      part(prism(12.0, 0.8, 16), [0, 0, 3.4], MAT.crystalDim),
      // standing stones around the rim
      ...[-1, 1].flatMap((sx) => [
        part(box(3.0, 5.4, 13.0), [sx * 14.0, 0, 1.0], MAT.stoneDark, { rotZ: 0.08 * sx }),
        part(box(3.0, 5.4, 13.0), [0, sx * 14.0, 1.0], MAT.stoneDark),
      ]),
      // central hovering sigil
      part(prism(6.0, 1.0, 6), [0, 0, 14.0], MAT.crystalHot),
      part(moteArt(0, 0, 22.0, 4.0), [0, 0, 0], MAT.aether),
      // brazier posts
      part(cyl(1.2, 1.2, 12, 5), [-19.0, -19.0, 1.0], MAT.woodDark),
      part(moteArt(-19, -19, 14.0, 2.0), [0, 0, 0], MAT.flameCore),
      part(cyl(1.2, 1.2, 12, 5), [19.0, 19.0, 1.0], MAT.woodDark),
      part(moteArt(19, 19, 14.0, 2.0), [0, 0, 0], MAT.flameCore),
    ],
  };
}

function moteArt(x: number, y: number, z: number, r: number): Shape {
  void x;
  void y;
  void z;
  return sph(r, 6);
}

function golemForge(): Assembly {
  return {
    parts: [
      ...plinth(56, 56, 2.6),
      // main industrial block
      part(box(42, 38, 22, 0.9), [0, 0, 2.0], MAT.ironDark),
      part(box(44, 40, 3.0), [0, 0, 24.0], MAT.stoneDark),
      // sawtooth roof
      part(box(10, 40, 7.0), [-15, 0, 26.0], MAT.iron, { rotZ: 0.5 }),
      part(box(10, 40, 7.0), [0, 0, 26.0], MAT.iron, { rotZ: 0.5 }),
      part(box(10, 40, 7.0), [15, 0, 26.0], MAT.iron, { rotZ: 0.5 }),
      // huge chimney
      part(cyl(6.0, 5.0, 34, 10), [17.0, -12.0, 2.0], MAT.stoneDark),
      part(cyl(6.4, 6.4, 2.0, 10), [17.0, -12.0, 36.0], MAT.iron),
      part(moteArt(17, -12, 39.0, 3.4), [0, 0, 0], MAT.emberDim),
      // glowing furnace mouth
      part(box(16, 1.6, 13.0), [0, -19.4, 2.0], MAT.emberDim),
      part(box(12, 1.2, 9.0), [0, -19.8, 4.0], MAT.flameCore),
      // anvil arms
      part(box(6, 10, 5), [-24.0, 8.0, 8.0], MAT.iron),
      // team banner on the roof
      part(cyl(1.0, 1.0, 16, 5), [0, 16.0, 26.0], MAT.wood),
      part(box(0.9, 9.0, 8.0), [0, 19.4, 34.0], MAT.banner),
    ],
  };
}

function arcaneNexus(): Assembly {
  return {
    parts: [
      ...plinth(48, 48, 2.2),
      // four legs holding the platform UP — the identifying silhouette
      part(box(5.0, 5.0, 22.0), [-15.0, -15.0, 2.0], MAT.stoneDark, { rotZ: 0.06 }),
      part(box(5.0, 5.0, 22.0), [15.0, -15.0, 2.0], MAT.stoneDark, { rotZ: -0.06 }),
      part(box(5.0, 5.0, 22.0), [-15.0, 15.0, 2.0], MAT.stoneDark, { rotZ: 0.06 }),
      part(box(5.0, 5.0, 22.0), [15.0, 15.0, 2.0], MAT.stoneDark, { rotZ: -0.06 }),
      // floating platform
      part(prism(22.0, 4.0, 8), [0, 0, 24.0], MAT.void),
      part(prism(19.0, 1.2, 8), [0, 0, 28.0], MAT.runeViolet),
      // obelisk on top
      part(prism(7.0, 22.0, 4), [0, 0, 28.0], MAT.voidLight),
      part(sph(4.6, 8), [0, 0, 53.0], MAT.crystalHot),
      // orbiting shards
      part(prism(2.6, 7.0, 4), [-13.0, 0, 40.0], MAT.crystal),
      part(prism(2.6, 7.0, 4), [13.0, 0, 40.0], MAT.crystal),
      part(prism(2.2, 6.0, 4), [0, 13.0, 46.0], MAT.aether),
      // under-glow
      part(prism(16.0, 1.0, 8), [0, 0, 22.0], MAT.aether),
    ],
  };
}

function astralSpire(): Assembly {
  return {
    parts: [
      ...plinth(58, 58, 3.0),
      ...buttresses(44, 44, 16, MAT.void),
      // tall tapering shaft
      part(cyl(13, 9, 26, 10), [0, 0, 3.0], MAT.void),
      part(cyl(9, 6, 22, 10), [0, 0, 29.0], MAT.voidLight),
      part(cyl(6, 3.6, 20, 10), [0, 0, 51.0], MAT.void),
      part(cone(4.2, 14, 8), [0, 0, 71.0], MAT.crystal),
      // three floating rings — the tallest, most magical silhouette in the game
      part(prism(22.0, 1.2, 14), [0, 0, 36.0], MAT.aether),
      part(prism(18.0, 1.2, 14), [0, 0, 52.0], MAT.aether),
      part(prism(13.0, 1.0, 14), [0, 0, 66.0], MAT.crystal),
      // orbs between the rings
      part(sph(3.2, 8), [20.0, 0, 36.0], MAT.crystalHot),
      part(sph(2.6, 8), [0, 17.0, 52.0], MAT.crystalHot),
      // team rune bands
      part(prism(13.6, 1.6, 10), [0, 0, 12.0], MAT.runeViolet),
      part(prism(9.6, 1.4, 10), [0, 0, 40.0], MAT.runeViolet),
    ],
  };
}

function scryingObelisk(): Assembly {
  return {
    parts: [
      ...plinth(36, 36, 2.2),
      // leaning monolith
      part(box(13, 9, 34, 0.55), [0, 0, 2.0], MAT.stoneDark, { rotZ: 0.12 }),
      part(box(9, 6, 6), [2.6, 0, 34.0], MAT.stone),
      // eye lens
      part(sph(5.4, 9), [3.4, 0, 30.0], MAT.crystalHot, { scale: { x: 1, y: 0.85, z: 0.6 } }),
      part(prism(6.4, 1.2, 10), [3.0, 0, 30.0], MAT.crystalDim, { rotY: Math.PI / 2 }),
      // support stones
      part(box(4.0, 4.0, 14.0), [-10.0, 8.0, 2.0], MAT.stone, { rotZ: -0.3 }),
      part(box(4.0, 4.0, 10.0), [8.0, -10.0, 2.0], MAT.stone, { rotZ: 0.3 }),
      // team runes up the flank
      part(box(1.2, 1.2, 20.0), [-5.4, -3.4, 6.0], MAT.runeViolet, { rotZ: 0.12 }),
    ],
  };
}

function arcaneSentry(): Assembly {
  return {
    parts: [
      ...plinth(30, 30, 1.8),
      // tripod legs
      part(cyl(1.8, 1.2, 14, 6), [-7.0, -5.0, 1.0], MAT.ironDark, { rotZ: 0.42 }),
      part(cyl(1.8, 1.2, 14, 6), [7.0, -5.0, 1.0], MAT.ironDark, { rotZ: -0.42 }),
      part(cyl(1.8, 1.2, 16, 6), [0, 8.0, 1.0], MAT.ironDark, { rotX: -0.4 }),
      // pivot housing
      part(sph(5.4, 8), [0, 0, 15.0], MAT.iron),
      // crystal cluster — the firing head
      part(prism(3.6, 10.0, 5), [0, 0, 18.0], MAT.crystal),
      part(prism(2.8, 8.0, 5), [-4.4, 0, 18.0], MAT.crystal, { rotZ: 0.5 }),
      part(prism(2.8, 8.0, 5), [4.4, 0, 18.0], MAT.crystal, { rotZ: -0.5 }),
      part(sph(3.0, 7), [0, 0, 29.0], MAT.crystalHot),
      // team ring
      part(prism(6.4, 1.2, 10), [0, 0, 15.0], MAT.runeViolet),
    ],
  };
}

function frostSpire(): Assembly {
  return {
    parts: [
      ...plinth(38, 38, 2.0),
      part(cyl(11, 9, 10, 9), [0, 0, 2.0], MAT.stoneDark),
      // jagged ice shards, not a smooth tower — that is the read
      part(prism(8.0, 22.0, 5), [0, 0, 11.0], MAT.crystalDim, { rotZ: 0.1 }),
      part(prism(5.4, 18.0, 5), [-7.0, 2.0, 12.0], MAT.frostCore, { rotZ: 0.5 }),
      part(prism(5.0, 15.0, 5), [7.4, -1.6, 12.0], MAT.frostCore, { rotZ: -0.45 }),
      part(prism(3.4, 12.0, 5), [1.0, 7.0, 14.0], MAT.crystal, { rotZ: -0.25 }),
      part(cone(3.0, 8.0, 6), [0, 0, 32.0], MAT.frostCore),
      // cold halo
      part(prism(12.0, 1.0, 12), [0, 0, 26.0], MAT.frostCore),
      // team runes on the base
      part(prism(9.6, 1.2, 9), [0, 0, 8.0], MAT.runeViolet),
    ],
  };
}

function infernoBeacon(): Assembly {
  return {
    parts: [
      ...plinth(38, 38, 2.0),
      part(cyl(10, 12, 16, 9), [0, 0, 2.0], MAT.stoneDark),
      part(cyl(7.0, 9.0, 6.0, 9), [0, 0, 18.0], MAT.iron),
      // open brazier bowl
      part(cyl(11.0, 7.0, 6.0, 11), [0, 0, 24.0], MAT.ironDark),
      part(prism(10.0, 1.2, 11), [0, 0, 29.4], MAT.emberDim),
      // flame: three tapered cones of different heights
      part(cone(6.4, 17.0, 7), [0, 0, 29.0], MAT.flameDeep),
      part(cone(4.4, 22.0, 7), [0, 0, 30.0], MAT.flameCore),
      part(cone(2.4, 13.0, 6), [-1.4, 1.2, 36.0], MAT.flameCore, { rotZ: 0.2 }),
      // radiating heat fins
      ...[-1, 1].map((s) => part(box(2.0, 11.0, 12.0), [s * 11.0, 0, 10.0], MAT.iron, { rotZ: 0.2 * s })),
      // team band on the shaft
      part(prism(11.4, 1.4, 9), [0, 0, 12.0], MAT.runeViolet),
    ],
  };
}

function stormConductor(): Assembly {
  return {
    parts: [
      ...plinth(36, 36, 2.0),
      part(cyl(9, 7, 8, 9), [0, 0, 2.0], MAT.stoneDark),
      // tall mast
      part(cyl(3.0, 1.8, 34, 8), [0, 0, 8.0], MAT.iron),
      // cross arms with orbs — the tesla read
      part(box(24, 2.4, 2.4), [0, 0, 30.0], MAT.brassDark),
      part(box(2.4, 24, 2.4), [0, 0, 36.0], MAT.brassDark),
      part(sph(4.0, 8), [-12.0, 0, 31.0], MAT.crystalHot),
      part(sph(4.0, 8), [12.0, 0, 31.0], MAT.crystalHot),
      part(sph(3.4, 8), [0, -12.0, 37.0], MAT.crystal),
      part(sph(3.4, 8), [0, 12.0, 37.0], MAT.crystal),
      part(sph(4.6, 8), [0, 0, 44.0], MAT.crystalHot),
      // arcs between the arms
      part(cyl(0.8, 0.8, 22, 4), [0, 0, 40.0], MAT.aether, { rotZ: 1.35 }),
      // team runes
      part(prism(9.6, 1.2, 9), [0, 0, 7.0], MAT.runeViolet),
    ],
  };
}

function celestialCannon(): Assembly {
  return {
    parts: [
      ...plinth(52, 52, 3.0),
      // heavy base
      part(box(34, 34, 10, 0.95), [0, 0, 2.0], MAT.stoneDark),
      part(cyl(13, 11, 8, 10), [0, 0, 12.0], MAT.stone),
      // enormous tilted barrel
      part(cyl(7.4, 5.6, 40.0, 10), [0, 6.0, 26.0], MAT.stoneLight, { rotX: Math.PI / 2 - 0.38 }),
      part(cyl(8.4, 8.4, 3.0, 10), [0, 24.0, 33.0], MAT.brass, { rotX: Math.PI / 2 - 0.38 }),
      part(cyl(5.6, 5.6, 2.0, 10), [0, 26.6, 34.0], MAT.crystalHot, { rotX: Math.PI / 2 - 0.38 }),
      // counterweight behind
      part(box(12, 12, 11), [0, -16.0, 18.0], MAT.ironDark),
      // support struts
      part(cyl(2.2, 2.2, 22, 6), [-11.0, 4.0, 12.0], MAT.iron, { rotZ: 0.3 }),
      part(cyl(2.2, 2.2, 22, 6), [11.0, 4.0, 12.0], MAT.iron, { rotZ: -0.3 }),
      // skyfire lens on top
      part(prism(9.0, 1.2, 10), [0, 0, 20.0], MAT.crystalDim),
      // team bands
      part(box(1.4, 30, 3.0), [-16.0, 0, 8.0], MAT.runeViolet),
      part(box(1.4, 30, 3.0), [16.0, 0, 8.0], MAT.runeViolet),
    ],
  };
}

function sanctuarySpire(): Assembly {
  return {
    parts: [
      ...plinth(40, 40, 2.2),
      // two curved pillars formed from stacked blocks
      ...[-1, 1].flatMap((s) => [
        part(box(6.0, 6.0, 16.0), [s * 10.0, 0, 2.0], MAT.stoneLight),
        part(box(5.4, 5.4, 8.0), [s * 8.4, 0, 18.0], MAT.stone, { rotZ: -0.22 * s }),
        part(box(4.6, 4.6, 7.0), [s * 5.6, 0, 25.0], MAT.stone, { rotZ: -0.5 * s }),
      ]),
      // arch lintel
      part(box(13.0, 4.4, 4.0), [0, 0, 31.0], MAT.stoneLight),
      // hanging light
      part(cyl(0.7, 0.7, 8.0, 4), [0, 0, 35.0], MAT.brass),
      part(sph(4.2, 9), [0, 0, 30.0], MAT.sapGlow),
      // healing rune pool on the ground
      part(prism(15.0, 1.0, 14), [0, 0, 2.4], MAT.runeViolet),
      part(prism(10.0, 0.8, 14), [0, 0, 3.0], MAT.sapGlow),
      // leafy growth
      part(cone(4.0, 7.0, 6), [-13.0, 0, 16.0], MAT.leaf),
      part(cone(3.4, 6.0, 6), [13.0, 0, 14.0], MAT.leaf),
    ],
  };
}

function arcaneBunker(): Assembly {
  return {
    parts: [
      ...plinth(42, 42, 2.2),
      // low thick block
      part(box(34, 32, 16, 0.94), [0, 0, 2.0], MAT.stone),
      part(box(36, 34, 3.0), [0, 0, 18.0], MAT.stoneLight),
      // sloped glacis on the front
      part(box(34, 4.0, 11.0), [0, -15.0, 2.0], MAT.stoneDark, { rotX: 0.5 }),
      // firing slits — three glowing horizontal bars
      part(box(24, 1.2, 1.6), [0, -16.6, 12.0], MAT.runeViolet),
      part(box(24, 1.2, 1.6), [0, -16.6, 8.0], MAT.runeViolet),
      part(box(1.6, 1.2, 1.6), [-16.6, 0, 12.0], MAT.runeViolet),
      // cupola
      part(cyl(6.4, 5.4, 5.0, 9), [0, 0, 19.0], MAT.iron),
      part(prism(4.0, 1.0, 8), [0, 0, 24.0], MAT.crystalDim),
      // sandbag-like blocks around the base
      ...[-1, 1].flatMap((s) => [
        part(box(6, 5, 3.4), [s * 12.0, -13.0, 2.0], MAT.stoneDark, { rotZ: 0.2 * s }),
        part(box(6, 5, 3.4), [s * 12.0, 13.0, 2.0], MAT.stoneDark, { rotZ: -0.2 * s }),
      ]),
    ],
  };
}

function stoneWall(): Assembly {
  return {
    parts: [
      part(box(30, 14, 4.0), [0, 0, 0], MAT.stoneDark),
      part(box(29, 13, 6.0), [0, 0, 3.2], MAT.stone),
      part(box(28, 12, 5.0), [0, 0, 8.4], MAT.stone),
      part(box(27, 11, 4.0), [0, 0, 12.6], MAT.stoneLight),
      // crenellations
      ...[-1, 0, 1].map((i) => part(box(6, 10, 4.0), [i * 10.0, 0, 16.0], MAT.stone)),
      // a team banner draped over the wall
      part(box(8.0, 0.9, 7.0), [0, -6.6, 9.0], MAT.banner),
      // moss / grime
      part(box(10, 1.0, 1.2), [-6.0, 7.2, 3.0], MAT.leafDark),
    ],
  };
}

function arcaneGate(): Assembly {
  return {
    parts: [
      ...plinth(30, 34, 1.6),
      // two pillars
      part(box(7.0, 7.0, 24.0), [-9.0, 0, 1.0], MAT.stoneLight),
      part(box(7.0, 7.0, 24.0), [9.0, 0, 1.0], MAT.stoneLight),
      part(box(8.4, 8.4, 2.4), [-9.0, 0, 24.0], MAT.brass),
      part(box(8.4, 8.4, 2.4), [9.0, 0, 24.0], MAT.brass),
      // lintel
      part(box(24.0, 5.4, 4.0), [0, 0, 26.0], MAT.stone),
      part(box(10.0, 3.4, 2.0), [0, 0, 30.0], MAT.runeViolet),
      // energy curtain between the pillars
      part(box(11.0, 0.9, 18.0), [0, 0, 3.0], MAT.aether),
      part(moteArtGate(0, 0, 14.0, 2.6), [0, 0, 0], MAT.crystalHot),
    ],
  };
}

function moteArtGate(x: number, y: number, z: number, r: number): Shape {
  void x;
  void y;
  void z;
  return sph(r, 6);
}

function waystoneCamp(): Assembly {
  return {
    parts: [
      ...plinth(46, 46, 1.8),
      // big tent
      part(cone(17.0, 26.0, 4), [0, 0, 2.0], MAT.cloth, { rotY: Math.PI / 4 }),
      part(cone(15.0, 21.0, 4), [-6.0, 10.0, 2.0], MAT.clothLight, { rotY: Math.PI / 4 }),
      // tent entrance
      part(box(7.0, 1.0, 11.0), [0, -12.0, 2.0], MAT.clothDark),
      // the waystone crystal
      part(prism(6.0, 20.0, 6), [15.0, 12.0, 2.0], MAT.crystal),
      part(sph(3.4, 8), [15.0, 12.0, 24.0], MAT.crystalHot),
      // banner and camp fire
      part(cyl(1.0, 1.0, 22, 5), [-16.0, -12.0, 2.0], MAT.wood),
      part(box(0.9, 11.0, 13.0), [-16.0, -17.0, 14.0], MAT.banner),
      ...[-1, 0, 1].map((i) => part(cyl(1.2, 1.2, 3.0, 5), [i * 3.4, 14.0, 2.0], MAT.woodDark, { rotZ: 0.9 * i })),
      part(moteArtGate(0, 14, 6.0, 3.0), [0, 0, 0], MAT.flameCore),
      // crates
      part(box(6.0, 6.0, 5.0), [-12.0, 14.0, 2.0], MAT.wood),
      part(box(4.4, 4.4, 4.0), [-7.0, 16.0, 2.0], MAT.woodDark),
    ],
  };
}

function thornGrove(): Assembly {
  return {
    parts: [
      ...plinth(42, 42, 1.8),
      // dense hedge mass
      part(sph(15.0, 9), [0, 0, 12.0], MAT.leafDark, { scale: { x: 1.2, y: 1.2, z: 0.85 } }),
      part(sph(11.0, 8), [-10.0, 6.0, 9.0], MAT.leaf, { scale: { x: 1, y: 1, z: 0.9 } }),
      part(sph(10.0, 8), [11.0, -6.0, 10.0], MAT.leaf),
      // thorns poking out in all directions
      ...[-1, 1].flatMap((s) => [
        part(cone(2.0, 12.0, 5), [s * 16.0, 0, 14.0], MAT.barkLight, { rotZ: (s * 1.45) }),
        part(cone(1.8, 10.0, 5), [s * 8.0, s * 13.0, 18.0], MAT.bark, { rotX: -s * 1.2 }),
        part(cone(1.6, 9.0, 5), [s * 4.0, -s * 14.0, 8.0], MAT.bark, { rotX: s * 1.2 }),
      ]),
      // trunks
      part(cyl(3.4, 4.6, 12, 7), [-5.0, 3.0, 2.0], MAT.bark),
      part(cyl(3.0, 4.0, 10, 7), [6.0, -4.0, 2.0], MAT.barkDark),
      // glowing sap nodes
      part(moteArtGate(-6, 8, 20.0, 2.2), [0, 0, 0], MAT.sapGlow),
      part(moteArtGate(8, -8, 16.0, 1.8), [0, 0, 0], MAT.sapGlow),
      // team rune on a stone
      part(prism(5.0, 1.0, 7), [0, 0, 2.6], MAT.runeViolet),
    ],
  };
}

function obsidianBastion(): Assembly {
  return {
    parts: [
      ...plinth(46, 46, 2.6),
      // black angular keep
      part(box(32, 30, 22, 0.82), [0, 0, 2.0], MAT.obsidian),
      part(box(34, 32, 2.4), [0, 0, 24.0], MAT.obsidianLight),
      // angled corner spurs — the aggressive silhouette
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) =>
          part(box(6.0, 6.0, 30.0), [sx * 15.0, sy * 14.0, 2.0], MAT.obsidianDark, { rotY: 0.6 }),
        ),
      ),
      // ember windows
      part(box(20, 1.4, 2.0), [0, -15.6, 14.0], MAT.emberGlow),
      part(box(20, 1.4, 2.0), [0, -15.6, 19.0], MAT.emberDim),
      part(box(1.4, 18, 2.0), [-16.6, 0, 12.0], MAT.emberDim),
      // twin spires on the roof
      part(prism(4.0, 16.0, 5), [-8.0, 0, 26.0], MAT.obsidianLight),
      part(prism(4.0, 20.0, 5), [8.0, 0, 26.0], MAT.obsidianLight),
      part(sph(2.8, 7), [-8.0, 0, 43.0], MAT.emberGlow),
      part(sph(2.8, 7), [8.0, 0, 47.0], MAT.emberGlow),
      // furnace mouth
      part(box(11.0, 1.6, 9.0), [0, -15.8, 2.0], MAT.emberGlow),
      // team rune band
      part(prism(16.0, 1.2, 8), [0, 0, 9.0], MAT.runeViolet),
    ],
  };
}

export const BUILDING_ART: Record<string, Assembly> = {
  sanctum: sanctum(),
  attunement_spire: attunementSpire(),
  resonance_vault: resonanceVault(),
  ley_conduit: leyConduit(),
  summoning_circle: summoningCircle(),
  golem_forge: golemForge(),
  arcane_nexus: arcaneNexus(),
  astral_spire: astralSpire(),
  scrying_obelisk: scryingObelisk(),
  arcane_sentry: arcaneSentry(),
  frost_spire: frostSpire(),
  inferno_beacon: infernoBeacon(),
  storm_conductor: stormConductor(),
  celestial_cannon: celestialCannon(),
  sanctuary_spire: sanctuarySpire(),
  arcane_bunker: arcaneBunker(),
  stone_wall: stoneWall(),
  arcane_gate: arcaneGate(),
  waystone_camp: waystoneCamp(),
  thorn_grove: thornGrove(),
  obsidian_bastion: obsidianBastion(),
};
