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

import type { Assembly, Part } from './mesh2';
import { PAL } from './palette2';
import { part, bbox, tube, cap, plate, sph, cone, cyl, prism, plinth } from './shapes';

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
      // Tail: a LONG tapering streamer trailing down and BACK (+y). A wisp is nearly spherical, so
      // the tail is the only thing that makes its facing legible; it has to be long enough to move the
      // silhouette's centre of mass noticeably behind the body.
      part(
        tube(
          [
            [0, 0, 4.4, 2.8],
            [0, 3.0, 0.4, 2.0],
            [0, 6.2, -2.6, 1.1],
            [0, 9.0, -4.8, 0.35],
          ],
          8,
        ),
        [0, 0, 0],
        PAL.crystalDeep,
      ),
      // Two forward brow motes on the FRONT of the orb (which also reads as the "face" direction).
      part(sph(1.35, 8), [-3.2, -5.2, 12.0], PAL.crystalHot),
      part(sph(1.35, 8), [3.2, -5.2, 12.0], PAL.crystalHot),
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
  // DESIGN: hunched biped. Big wedge head over a compact body, arms so long they nearly touch the
  // ground, two swept horns.
  //
  // Zachary read this as "a box". The cause was that the hips, torso and head all sat on one vertical
  // axis with similar widths, so the outline was a rectangle. Four changes fix it, all within the
  // approved style:
  //   * the torso LEANS FORWARD, stepping toward -y as it rises, so the chest overhangs the feet and
  //     the side profile is a diagonal;
  //   * the head is a WEDGE thrust forward of the chest rather than stacked on top of it;
  //   * a spine ridge climbs the hunched back, breaking the top edge;
  //   * shoulders are held WIDE and LOW, below the head.
  return {
    parts: [
      // ---- legs: short, bent, digitigrade
      part(tube([[0, 0, 9.0, 2.6], [0.8, 0.6, 5.0, 2.1], [0.4, 1.8, 1.4, 1.6]], 7), [-3.8, 0.6, 0], PAL.hideDeep),
      part(tube([[0, 0, 9.0, 2.6], [-0.8, 0.6, 5.0, 2.1], [-0.4, 1.8, 1.4, 1.6]], 7), [3.8, 0.6, 0], PAL.hideDeep),
      part(bbox(4.0, 5.6, 2.0, 0.8), [-3.8, -1.2, 0.9], PAL.hideDeep),
      part(bbox(4.0, 5.6, 2.0, 0.8), [3.8, -1.2, 0.9], PAL.hideDeep),

      // ---- hips, set BACK so the torso can lean over them
      part(bbox(9.0, 7.0, 5.4, 1.4, 0.9), [0, 2.4, 8.8], PAL.hide),

      // ---- torso: each section steps toward -y, so the body leans forward
      part(tube([[0, 2.4, 10.0, 4.8], [0, 0.6, 13.6, 5.8], [0, -1.6, 17.0, 5.4]], 12), [0, 0, 0], PAL.hide),
      part(plate(7.8, 6.6, 6.8, 1.2), [0, -5.4, 12.0], PAL.belly),

      // ---- spine ridge: three plates climbing the hunched back, breaking the top edge
      part(plate(2.8, 1.6, 3.0, 2.4), [0, 4.8, 15.4], PAL.hideDeep, { rotX: -0.5 }),
      part(plate(3.2, 1.8, 3.6, 2.8), [0, 3.4, 17.4], PAL.hideDeep, { rotX: -0.42 }),
      part(plate(2.6, 1.4, 2.8, 2.2), [0, 2.0, 18.8], PAL.hideDeep, { rotX: -0.34 }),

      // ---- shoulders: wide and LOW, below the head
      part(cap(3.4, 6.8, 10), [-6.2, 0.4, 16.4], PAL.hide, { rotZ: Math.PI / 2 }),
      part(cap(3.4, 6.8, 10), [6.2, 0.4, 16.4], PAL.hide, { rotZ: Math.PI / 2 }),

      // ---- arms: elbow out, forearm reaching almost to the ground
      part(tube([[-2.2, 0, 15.8, 2.7], [-6.0, 0.6, 11.0, 2.1], [-7.4, 2.0, 5.4, 1.8]], 7), [0, 0, 0], PAL.hide),
      part(tube([[2.2, 0, 15.8, 2.7], [6.0, 0.6, 11.0, 2.1], [7.4, 2.0, 5.4, 1.8]], 7), [0, 0, 0], PAL.hide),
      ...[-1, 1].flatMap((si) =>
        [-1, 0, 1].map((k) => part(plate(1.3, 0.3, 3.6, 0.9), [si * 7.4 + k * 1.4, 2.4, 3.8], PAL.boneDeep, { rotX: 0.3 })),
      ),

      // ---- head: a WEDGE thrust forward of the chest, wide brow, small jaw
      part(bbox(9.4, 8.2, 6.8, 1.8, 0.82), [0, -3.4, 19.0], PAL.hide),
      part(bbox(7.4, 3.4, 4.6, 1.2, 0.7), [0, -6.8, 17.8], PAL.hideDeep),
      // brow ridge, angled down at the front for an angry read
      part(bbox(9.0, 2.4, 2.0, 0.6), [0, -5.8, 22.0], PAL.hideLit, { rotX: -0.28 }),

      // ---- horns: swept back and up, the strongest silhouette cue
      part(tube([[0, 0, 0, 2.2], [-1.0, 1.8, 3.2, 1.4], [-1.9, 3.8, 5.8, 0.4]], 7), [-3.6, 0.6, 21.2], PAL.bone),
      part(tube([[0, 0, 0, 2.2], [1.0, 1.8, 3.2, 1.4], [1.9, 3.8, 5.8, 0.4]], 7), [3.6, 0.6, 21.2], PAL.bone),

      // ---- eyes under the brow
      part(sph(1.4, 8), [-2.3, -6.2, 20.4], PAL.eyeTeam),
      part(sph(1.4, 8), [2.3, -6.2, 20.4], PAL.eyeTeam),

      // ---- TEAM MARKER: a broad chest sash, a belt, and a band on each horn. The imp is a large
      //      warm-toned mass, so one thin strip disappeared at sprite size.
      part(plate(10.4, 8.4, 4.2, 1.2), [0, -5.6, 11.4], PAL.trimTeam),
      part(bbox(10.2, 6.6, 1.8, 0.5), [0, 1.6, 9.2], PAL.trimTeam),
      part(prism(2.2, 1.2, 6), [-3.6, 0.6, 23.4], PAL.trimTeam),
      part(prism(2.2, 1.2, 6), [3.6, 0.6, 23.4], PAL.trimTeam),

      // ---- tail
      part(tube([[0, 0, 0, 2.0], [0, -3.4, -1.4, 1.4], [0, -7.0, -1.2, 0.4]], 7), [0, 0.8, 9.4], PAL.hideDeep),
    ],
  };
}

// ================================================================================================
// ARCANE ARCHER — upright, tall, narrow. The read is the BOW: a big asymmetric arc held out to one
// side, plus a pointed hood.
// ================================================================================================
function arcaneArcher(): Assembly {
  // DESIGN: upright, tall, narrow. The read is the BOW held clear of the body plus a pointed hood.
  //
  // Zachary read this as "a blob". The cause was that the hood, shoulders and robe were all roughly
  // the same width, so the outline had no pinch. Fixed with three deliberate width changes down the
  // body — broad hood, NARROW WAIST, flared hem — and by pushing the bow out to one side so the
  // silhouette is asymmetric rather than a single lump. The drawing arm crosses the gap, which fills
  // the negative space without closing the pinch.
  return {
    parts: [
      // ---- legs / boots
      part(tube([[0, 0, 9.0, 2.2], [0.2, 0, 4.6, 1.7], [0, 0, 1.0, 1.5]], 7), [-2.4, 0, 0], PAL.robeDeep),
      part(tube([[0, 0, 9.0, 2.2], [-0.2, 0, 4.6, 1.7], [0, 0, 1.0, 1.5]], 7), [2.4, 0, 0], PAL.robeDeep),
      part(bbox(3.4, 4.2, 1.8, 0.7), [-2.4, -0.4, 0.6], PAL.leather),
      part(bbox(3.4, 4.2, 1.8, 0.7), [2.4, -0.4, 0.6], PAL.leather),

      // ---- HEM: wide and flat, the bottom of the hourglass
      part(tube([[0, 0, 1.4, 5.0], [0, 0, 6.0, 4.3], [0, 0, 9.2, 3.4]], 14), [0, 0, 0], PAL.robeLit),
      part(cyl(5.1, 5.1, 1.1, 14), [0, 0, 1.3], PAL.robeDeep),

      // ---- WAIST: the pinch. This narrow section is what stops the figure reading as one mass.
      part(bbox(4.4, 3.8, 4.0, 1.3, 0.86), [0, 0, 11.0], PAL.robe),
      // TEAM MARKER: a full sash around the waist plus a hood band. The archer's robe and hood are
      // both large violet masses, so a single narrow strip was invisible at sprite size.
      part(cyl(4.9, 4.7, 2.2, 14), [0, 0, 10.6], PAL.trimTeam),
      part(cyl(4.2, 3.4, 1.6, 10), [0, 0.2, 22.4], PAL.trimTeam),
      part(bbox(4.4, 1.2, 1.4, 0.4), [0, -2.9, 13.4], PAL.trimTeam),

      // ---- CHEST + SHOULDERS: broad again, so the top is the widest part after the hem
      part(bbox(7.4, 5.6, 5.4, 1.8, 0.9), [0, 0, 14.2], PAL.robe),
      part(bbox(6.2, 1.6, 4.4, 0.8), [0, -3.1, 14.6], PAL.steel),
      part(cap(2.5, 5.0, 10), [-4.6, 0, 16.6], PAL.robeLit, { rotZ: Math.PI / 2 }),
      part(cap(2.5, 5.0, 10), [4.6, 0, 16.6], PAL.robeLit, { rotZ: Math.PI / 2 }),

      // ---- HOOD: a hard pointed cone, the top of the read
      part(sph(2.9, 10), [0, -0.4, 18.8], PAL.bone),
      part(cone(4.0, 8.2, 9), [0, 0.2, 19.4], PAL.robeLit, { rotX: 0.16 }),
      part(bbox(4.6, 1.2, 2.6, 0.5), [0, -2.9, 18.8], PAL.robeDeep),
      part(sph(0.85, 6), [-1.25, -3.1, 19.0], PAL.eyeTeam),
      part(sph(0.85, 6), [1.25, -3.1, 19.0], PAL.eyeTeam),

      // ---- BOW: pushed well clear of the torso on the left, so the outline is not a single lump
      part(
        tube(
          [
            [0, 0, -7.0, 0.6],
            [2.4, 0, -1.0, 1.0],
            [2.6, 0, 4.0, 0.85],
            [0, 0, 10.0, 0.45],
          ],
          7,
        ),
        [-7.4, 0, 11.6],
        PAL.wood,
      ),
      // String spans exactly between the limb tips (local z -7.0 -> +10.0 at x 0).
      part(tube([[0, 0, -7.0, 0.14], [0, 0, 10.0, 0.14]], 4), [-7.4, 0, 11.6], PAL.bone),
      // Drawing arm reaching across to the string: also fills the gap between body and bow.
      part(tube([[0, 0, 0, 1.5], [-3.0, -0.6, -4.2, 1.1], [-5.6, -1.0, -7.4, 0.85]], 8), [-1.6, 0, 16.0], PAL.robe),

      // ---- QUIVER on the back (a facing cue: it is behind, with arrows above it)
      part(cyl(1.9, 1.7, 7.0, 8), [3.2, 3.4, 11.6], PAL.leather),
      ...[-1, 0, 1].map((k) => part(cyl(0.22, 0.22, 4.4, 5), [3.2 + k * 1.1, 3.4, 18.0], PAL.woodLit, { rotZ: 0.1 * k })),
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
  // between them. Everything else is subordinate.
  //
  // Two defects were fixed here after review, without changing the approved style:
  //
  //   "reads as soft and beige" — the stone was a warm sandy beige (`rock`/`rockLit`) that read as
  //   sandstone and blended into the grass. It is now a COLDER, darker stone with harder specular and
  //   stronger occlusion (`stone`/`stoneDeep`), and the torso is built from stacked angular PLATES
  //   rather than one rounded block, so the form is chiselled rather than soft.
  //
  //   "facings 2/6 become an oblong slab" — the model was 31 wide by 14 deep, so from the side the
  //   arms overlapped into a plank. The arms were pulled inward and the shoulders, fists and head
  //   thrust FORWARD, taking depth to >= 55% of width. A side facing now shows a body with a chest
  //   and a back, not a slab.
  const parts: Part[] = [];

  // ---- legs: two thick tapered columns, feet merged into the leg so there is no ankle seam
  for (const sx of [-1, 1] as const) {
    parts.push(
      part(tube([[0, 0, 9.0, 4.8], [0.7 * sx, 0, 4.4, 4.2], [0.4 * sx, 0, 1.0, 4.6]], 10), [sx * 6.4, 0, 0], PAL.stoneDeep),
    );
    parts.push(part(bbox(7.4, 9.0, 3.2, 1.4), [sx * 6.4, 0, 1.0], PAL.stoneDeep));
    // knee plate: an angular detail that survives to sprite size
    parts.push(part(bbox(6.0, 6.4, 2.6, 1.0, 0.9), [sx * 6.4, -1.6, 5.6], PAL.stone));
  }

  // ---- hips
  parts.push(part(bbox(16.0, 12.0, 5.6, 2.0, 0.94), [0, 0, 8.6], PAL.stone));

  // ---- torso: three stacked angular plates of decreasing width, so the form has steps in it rather
  //      than reading as one smooth boulder
  parts.push(part(bbox(19.0, 14.5, 6.0, 1.8, 0.92), [0, -0.6, 11.8], PAL.stone));
  parts.push(part(bbox(20.5, 15.5, 6.4, 1.8, 0.88), [0, -0.9, 16.4], PAL.stone));
  parts.push(part(bbox(17.0, 13.0, 4.6, 1.6, 0.9), [0, -1.0, 20.6], PAL.stoneLit));

  // ---- chest rune: one bold team shape, big enough to read at 20 px
  parts.push(part(prism(4.6, 1.6, 6), [0, -8.6, 17.6], PAL.runeTeam, { rotX: Math.PI / 2 }));

  // ---- TEAM MARKER. The golem is the single largest unit body, so small team details vanish inside
  //      it. Three bold team-tinted elements make ownership unmistakable in a pile: a wide rune band
  //      across the chest, a pauldron stripe on each shoulder, and a crest on the head.
  parts.push(part(bbox(15.0, 1.8, 3.2, 0.7), [0, -8.6, 13.4], PAL.runeTeam));
  parts.push(part(bbox(15.0, 1.8, 2.4, 0.6), [0, -8.6, 20.8], PAL.trimTeam));
  for (const sx of [-1, 1] as const) {
    parts.push(part(bbox(7.4, 1.6, 2.0, 0.5), [sx * 9.4, -8.4, 25.6], PAL.trimTeam));
  }
  parts.push(part(bbox(3.4, 1.4, 1.4, 0.4), [0, -7.2, 25.4], PAL.trimTeam));
  // glowing cracks: thin emissive slivers across the chest, for internal contrast at sprite size.
  parts.push(part(bbox(0.9, 0.8, 7.0, 0.3), [-4.4, -8.8, 15.2], PAL.emberCore, { rotY: 0.22 }));
  parts.push(part(bbox(0.7, 0.8, 5.0, 0.3), [5.2, -8.8, 14.0], PAL.emberDeep, { rotY: -0.28 }));

  // ---- shoulders: two boulders, proud of the torso and thrust FORWARD so the profile has depth
  for (const sx of [-1, 1] as const) {
    parts.push(part(sph(6.6, 12), [sx * 9.4, -3.6, 20.6], PAL.stoneLit));
    // flat chiselled cap on each shoulder: kills the "soft ball" read
    parts.push(part(bbox(9.4, 10.0, 2.2, 1.0, 0.82), [sx * 9.4, -3.6, 25.0], PAL.stone, { rotZ: sx * 0.12 }));
  }

  // ---- arms: the defining feature. Forearm LONG and thicker than the upper arm, hanging past the
  //      knee, and angled forward so the fists sit in front of the body.
  for (const sx of [-1, 1] as const) {
    parts.push(
      part(
        tube(
          [
            [0, 0, 0, 3.4],
            [sx * 0.6, -2.0, -4.2, 3.9],
            [sx * 0.9, -3.4, -9.4, 4.3],
            [sx * 0.9, -3.8, -13.0, 3.7],
          ],
          10,
        ),
        [sx * 9.6, -2.2, 19.0],
        PAL.stone,
      ),
    );
    // fist: a wide bevelled block, thrust forward. The defining shape of the silhouette.
    parts.push(part(bbox(9.2, 10.4, 8.2, 1.8), [sx * 10.4, -5.0, 3.4], PAL.stoneDeep));
    // knuckle ridge
    parts.push(part(bbox(9.4, 2.6, 2.0, 0.7), [sx * 10.4, -9.6, 6.2], PAL.stoneLit));
  }

  // ---- head: TINY, sunk between the shoulders and projecting FORWARD (which is also the facing cue)
  parts.push(part(bbox(5.6, 5.4, 4.8, 1.2, 0.92), [0, -4.6, 24.6], PAL.stoneDeep));
  parts.push(part(bbox(4.6, 1.2, 1.2, 0.4), [0, -7.0, 25.6], PAL.stoneLit));
  parts.push(part(sph(1.6, 8), [-1.6, -6.8, 26.2], PAL.eyeTeam));
  parts.push(part(sph(1.6, 8), [1.6, -6.8, 26.2], PAL.eyeTeam));

  // ---- moss: ONE patch, on one shoulder, asymmetric. Two patches read as noise.
  parts.push(part(sph(4.6, 10), [-10.2, -5.6, 24.6], PAL.rockMoss, { scale: { x: 1.25, y: 1.0, z: 0.4 } }));

  return { parts };
}

// ================================================================================================
// STORM CASTER — robed wizard. Silhouette plan: a narrow cone of robe topped by a high collar, with
// three orbiting orbs that break the outline.
// ================================================================================================
function stormCaster(): Assembly {
  return {
    parts: [
      // robe: a cone with a slight flare. Kept NARROW (5.6 at the hem, not 7.4) because a wide cone
      // base reads as a building, not a person — the earlier version was mistaken for a Sanctum.
      part(tube([[0, 0, 0, 5.6], [0, 0, 3.0, 5.0], [0, 0, 9.0, 4.0], [0, 0, 14.0, 3.4]], 14), [0, 0, 0], PAL.robeDeep),
      // hem band (team)
      part(prism(5.8, 1.4, 14), [0, 0, 1.2], PAL.trimTeam),
      // torso / shoulders under the robe
      part(bbox(6.6, 5.8, 5.6, 1.6, 0.8), [0, 0, 14.4], PAL.robe),
      // high collar: a flared tube around the neck — the identifying shape
      part(tube([[0, 0, 0, 3.8], [0, 0, 3.4, 5.0]], 12), [0, 0, 17.6], PAL.robeLit),
      // head inside the collar
      part(sph(2.8, 10), [0, 0, 20.4], PAL.bone),
      part(sph(0.95, 6), [-1.2, -2.4, 20.6], PAL.eyeTeam),
      part(sph(0.95, 6), [1.2, -2.4, 20.6], PAL.eyeTeam),
      // pointed hat
      // The hat leans FORWARD and the crown ring sits with it, so the profile direction is readable.
      part(cone(4.4, 9.0, 9), [0, -1.4, 22.2], PAL.robeDeep, { rotX: 0.32 }),
      part(prism(4.2, 0.9, 9), [0, -1.4, 23.0], PAL.trimTeam, { rotX: 0.32 }),
      // forward chest rune: the front face of the robe, which gives the body a clear "front"
      part(bbox(5.0, 1.6, 3.4, 0.6), [0, -4.6, 14.6], PAL.trimTeam),
      // ---- staff: shaft planted at the caster's side and GRIPPED by a visible arm. Without the arm
      // the staff read as a separate object standing next to the unit.
      part(tube([[0, 0, 0, 0.8], [0.3, 0, 11.0, 0.66], [0.6, 0, 22.0, 0.5]], 7), [6.2, 0, 1.4], PAL.wood),
      part(sph(2.5, 10), [6.8, 0, 25.0], PAL.crystalHot),
      ...[-1, 1].map((s) =>
        part(tube([[0, 0, 0, 0.4], [0.45 * s, 0, 2.3, 0.18]], 5), [6.8, 0, 23.2], PAL.brass, { rotZ: s * 0.5 }),
      ),
      // right arm reaching out to grip the shaft (shoulder -> elbow -> hand)
      part(
        tube([[0, 0, 0, 1.5], [3.4, 0.2, -3.2, 1.15], [5.6, 0.1, -6.4, 0.9]], 8),
        [1.2, 0, 17.4],
        PAL.robe,
      ),
      part(sph(1.15, 8), [6.2, 0, 10.6], PAL.bone),
      // left arm, hanging with a bracer
      part(tube([[0, 0, 0, 1.4], [-2.6, 0.2, -4.0, 1.05], [-3.4, 0.2, -7.0, 0.85]], 8), [-1.4, 0, 17.2], PAL.robe),
      // ---- three orbiting orbs at different radii, giving the outline movement
      part(sph(2.1, 9), [-8.0, -1.6, 21.4], PAL.crystal),
      part(sph(1.6, 9), [4.6, -7.0, 15.0], PAL.aether),
      part(sph(1.3, 9), [-2.6, 7.2, 26.2], PAL.crystalHot),
      // a couple of floating rune shards
      part(prism(0.9, 3.0, 4), [-5.0, 4.2, 12.6], PAL.aether, { rotZ: 0.4 }),
      part(prism(0.7, 2.4, 4), [4.2, 4.8, 10.2], PAL.crystal, { rotZ: -0.3 }),
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

  // TEAM MARKER. The old banner sat behind the coping course on a wall only 5 units deep, so from the
  // game camera it was fully occluded — a pixel diff of the four team renders measured 0.0% visible
  // difference. The banner now hangs on the outward front face well BELOW the coping, pushed proud of
  // the wall, and a team stripe runs along the coping so a marker is visible from any angle.
  parts.push(part(cyl(0.55, 0.55, 10, 6), [0, -(WALL_D / 2 + 1.0), 1.8], PAL.woodLit));
  parts.push(part(plate(7.0, 6.0, 10.0, 0.8), [0, -(WALL_D / 2 + 1.8), 4.4], PAL.bannerTeam));
  parts.push(part(bbox(WALL_W - 2.5, 1.8, 1.8, 0.6), [0, -(WALL_D / 2 + 1.1), rows * blockH + 1.2], PAL.trimTeam));

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
