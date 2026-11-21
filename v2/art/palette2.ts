// PRODUCTION MATERIAL PALETTE (pilot round).
//
// Goals: warm saturated colour with clear team accents, and enough VALUE separation that a sprite
// reads at 20 px. Each material names its AO strength, because stone wants strong occlusion in its
// crevices while cloth wants almost none.

import type { Material } from './mesh2';

const M = (m: Material): Material => m;

export const PAL = {
  // ------------------------------------------------------------------ stone / rock (golem, walls)
  rockDeep: M({ color: [117, 107, 94], grain: 0.5, specular: 0.05, rim: 0.3, ao: 1.0 }),
  rock: M({ color: [178, 163, 142], grain: 0.55, specular: 0.06, rim: 0.35, ao: 1.0 }),
  rockLit: M({ color: [227, 210, 180], grain: 0.5, specular: 0.08, rim: 0.4, ao: 0.9 }),
  rockMoss: M({ color: [154, 190, 106], grain: 0.6, rim: 0.3, ao: 1.0 }),

  // ------------------------------------------------------------------ chiselled golem stone
  //
  // The golem was reported as "soft and beige", and it was: `rock`/`rockLit` are a warm sandy beige
  // that reads as sandstone and blends into the grass. These are a COLDER, darker, higher-contrast
  // stone with more specular (so the chiselled facets catch hard highlights and the form reads as
  // carved rather than rounded) and stronger occlusion (so the plate edges separate).
  stoneDeep: M({ color: [92, 96, 104], grain: 0.62, specular: 0.14, rim: 0.4, ao: 1.15 }),
  stone: M({ color: [138, 144, 154], grain: 0.66, specular: 0.2, rim: 0.46, ao: 1.1 }),
  stoneLit: M({ color: [186, 194, 204], grain: 0.6, specular: 0.3, rim: 0.52, ao: 1.0 }),

  // ------------------------------------------------------------------ metal
  steelDeep: M({ color: [98, 105, 130], specular: 0.4, rim: 0.35, ao: 1.0 }),
  steel: M({ color: [156, 166, 194], specular: 0.5, rim: 0.45, ao: 0.95 }),
  steelLit: M({ color: [220, 232, 255], specular: 0.62, rim: 0.5, ao: 0.9 }),
  ironOld: M({ color: [100, 90, 84], specular: 0.3, grain: 0.35, rim: 0.3, ao: 1.0 }),

  // ------------------------------------------------------------------ brass / gold trim
  brassDeep: M({ color: [122, 88, 40], specular: 0.55, rim: 0.35, ao: 1.0 }),
  brass: M({ color: [198, 152, 66], specular: 0.75, rim: 0.45, ao: 0.95 }),
  brassLit: M({ color: [240, 204, 118], specular: 0.85, rim: 0.5, ao: 0.9 }),

  /**
   * ARCANE STRUCTURE — SLATE, not violet.
   *
   * Zachary, reviewing 277a26d: "the bigger buildings now show a lot of bright violet and lilac... which reads as the
   * 'purple AI slop' look". Measured on that art the sanctum was 39% violet and the resonance vault 48%, because these
   * three materials built its main mass.
   *
   * The names are kept (`violet*`) so the ~90 call sites do not have to change in the same commit as the palette, but the
   * COLOURS are now cool blue-grey slate: the same value structure (deep / mid / lit) so the lighting still reads, at hue
   * 210-215 instead of 260-270. Arcane character now comes from the energy accents, not from a purple body.
   */
  violetDeep: M({ color: [60, 70, 84], rim: 0.3, ao: 1.0 }),
  violet: M({ color: [104, 118, 136], specular: 0.28, rim: 0.4, ao: 1.0 }),
  violetLit: M({ color: [156, 170, 188], specular: 0.36, rim: 0.46, ao: 0.95 }),

  // ------------------------------------------------------------------ magic / crystal (team accents)
  crystal: M({ color: [120, 200, 255], teamTint: 0.4, emissive: 0.5, specular: 0.9, rim: 0.6, ao: 0.6 }),
  crystalHot: M({ color: [200, 244, 255], teamTint: 0.3, emissive: 0.9, specular: 0.95, rim: 0.7, ao: 0.4 }),
  crystalDeep: M({ color: [64, 112, 176], teamTint: 0.45, emissive: 0.22, specular: 0.6, rim: 0.45, ao: 0.8 }),
  /**
   * AETHER — the arcane glow. Restrained TEAL, not lilac.
   *
   * This is the accent that keeps a slate building feeling magical: a desaturated teal at hue ~185, emissive, used for
   * portals, cores and rune channels. Small areas only.
   */
  aether: M({ color: [128, 216, 208], teamTint: 0.3, emissive: 0.62, rim: 0.58, ao: 0.5 }),
  runeTeam: M({ color: [210, 220, 240], teamTint: 0.95, emissive: 0.55, rim: 0.4, ao: 0.7 }),
  emberCore: M({ color: [255, 176, 74], emissive: 0.95, rim: 0.5, ao: 0.4 }),
  emberDeep: M({ color: [214, 84, 40], emissive: 0.6, rim: 0.35, ao: 0.6 }),
  frostCore: M({ color: [188, 238, 255], emissive: 0.75, specular: 0.7, rim: 0.6, ao: 0.5 }),

  // ------------------------------------------------------------------ flesh (imp, caster skin)
  hideDeep: M({ color: [154, 83, 68], grain: 0.4, rim: 0.3, ao: 1.0 }),
  hide: M({ color: [228, 129, 97], grain: 0.42, specular: 0.08, rim: 0.35, ao: 1.0 }),
  hideLit: M({ color: [255, 173, 132], grain: 0.4, specular: 0.1, rim: 0.4, ao: 0.95 }),
  belly: M({ color: [245, 188, 144], grain: 0.3, rim: 0.3, ao: 0.95 }),

  // ------------------------------------------------------------------ cloth / robes
  /**
   * ROBES — indigo-grey wool, not lilac.
   *
   * The caster units wore the same violet family as the buildings. Woollen cloth in a cool grey-blue keeps them readable
   * against stone without the purple cast.
   */
  robeDeep: M({ color: [54, 62, 78], grain: 0.18, rim: 0.25, ao: 0.9 }),
  robe: M({ color: [88, 100, 118], grain: 0.18, rim: 0.32, ao: 0.9 }),
  robeLit: M({ color: [132, 146, 164], grain: 0.16, rim: 0.38, ao: 0.85 }),
  trimTeam: M({ color: [226, 230, 250], teamTint: 0.92, emissive: 0.25, rim: 0.4, ao: 0.8 }),
  bannerTeam: M({ color: [232, 236, 255], teamTint: 0.95, rim: 0.35, ao: 0.85 }),
  leather: M({ color: [146, 108, 68], grain: 0.45, specular: 0.18, rim: 0.3, ao: 1.0 }),
  leatherLit: M({ color: [156, 115, 73], grain: 0.45, specular: 0.2, rim: 0.35, ao: 1.0 }),

  // ------------------------------------------------------------------ bone
  bone: M({ color: [252, 242, 214], grain: 0.25, specular: 0.2, rim: 0.4, ao: 1.0 }),
  boneDeep: M({ color: [167, 157, 132], grain: 0.28, rim: 0.32, ao: 1.0 }),

  // ------------------------------------------------------------------ wood
  woodDeep: M({ color: [116, 84, 54], grain: 0.6, rim: 0.25, ao: 1.0 }),
  wood: M({ color: [175, 130, 80], grain: 0.62, specular: 0.1, rim: 0.3, ao: 1.0 }),
  woodLit: M({ color: [219, 170, 113], grain: 0.6, rim: 0.35, ao: 0.95 }),

  // ------------------------------------------------------------------ leaf / organic
  leafDeep: M({ color: [53, 109, 64], grain: 0.35, rim: 0.3, ao: 1.0 }),
  leaf: M({ color: [94, 175, 97], grain: 0.35, specular: 0.12, rim: 0.35, ao: 1.0 }),
  leafLit: M({ color: [142, 231, 127], grain: 0.3, specular: 0.15, rim: 0.4, ao: 0.9 }),

  // ------------------------------------------------------------------ eyes / glow
  eyeTeam: M({ color: [255, 248, 200], teamTint: 0.55, emissive: 1.0, rim: 0.4, ao: 0.2 }),
  eyeDark: M({ color: [30, 22, 28], rim: 0.2, ao: 1.0 }),
  shadow: M({ color: [26, 22, 34], alpha: 0.9, rim: 0.1, ao: 0.5 }),
} as const;

export type MatName = keyof typeof PAL;
