// MATERIAL PALETTE.
//
// Every material here was chosen so that the sprite reads at both 24 px (phone, zoomed out) and
// 200 px (gallery close-up). The rules I followed:
//   • Values are grouped into three bands — DARK (structure/shadow), MID (body), LIGHT (highlight) —
//     so even a tiny sprite has readable contrast between its planes.
//   • Hues stay inside the arcane palette: violet/indigo structure, cyan magic, warm brass/gold
//     accents, grey stone, and three muted greens/browns for Verdant.
//   • `teamTint` is only ever used on surfaces that should be *the player's colour*: banners, runes,
//     eyes, crystal cores. Never on stone or wood, so a blue player's golems are still grey.
//   • `emissive` marks magic. Emissive surfaces must never be the largest area of a sprite, or it
//     stops reading as a lit object.

import type { Material } from './mesh';

export const MAT = {
  // ---------------------------------------------------------------- structural stone & metal
  stoneDark: { color: [58, 56, 74], grain: 0.55, specular: 0.04, rim: 0.25 } as Material,
  stone: { color: [104, 102, 126], grain: 0.55, specular: 0.06, rim: 0.3 } as Material,
  stoneLight: { color: [146, 144, 168], grain: 0.5, specular: 0.08, rim: 0.3 } as Material,
  ironDark: { color: [46, 47, 60], specular: 0.35, rim: 0.3 } as Material,
  iron: { color: [92, 94, 116], specular: 0.45, rim: 0.35 } as Material,
  ironLight: { color: [140, 144, 168], specular: 0.55, rim: 0.4 } as Material,

  // ---------------------------------------------------------------- arcane structure (violet)
  voidDark: { color: [38, 30, 58], grain: 0.3, rim: 0.25 } as Material,
  void: { color: [62, 48, 96], grain: 0.3, specular: 0.12, rim: 0.3 } as Material,
  voidLight: { color: [110, 86, 162], specular: 0.2, rim: 0.35 } as Material,
  runeViolet: { color: [168, 130, 255], teamTint: 0.85, emissive: 0.55, rim: 0.2 } as Material,

  // ---------------------------------------------------------------- magic / crystal
  crystal: { color: [120, 196, 255], teamTint: 0.35, emissive: 0.5, specular: 0.85, rim: 0.5 } as Material,
  crystalHot: { color: [190, 240, 255], teamTint: 0.25, emissive: 0.85, specular: 0.9, rim: 0.6 } as Material,
  crystalDim: { color: [70, 116, 168], teamTint: 0.4, emissive: 0.22, specular: 0.5, rim: 0.4 } as Material,
  aether: { color: [190, 150, 255], teamTint: 0.5, emissive: 0.7, specular: 0.3, rim: 0.5 } as Material,
  flameCore: { color: [255, 176, 74], emissive: 0.95, rim: 0.4 } as Material,
  flameDeep: { color: [226, 88, 42], emissive: 0.7, rim: 0.3 } as Material,
  frostCore: { color: [176, 232, 255], emissive: 0.8, specular: 0.7, rim: 0.5 } as Material,

  // ---------------------------------------------------------------- brass / gold trim
  brassDark: { color: [122, 92, 44], specular: 0.5, rim: 0.3 } as Material,
  brass: { color: [178, 140, 66], specular: 0.7, rim: 0.4 } as Material,
  brassLight: { color: [226, 188, 106], specular: 0.8, rim: 0.45 } as Material,

  // ---------------------------------------------------------------- organic (Verdant)
  barkDark: { color: [58, 46, 34], grain: 0.7, rim: 0.25 } as Material,
  bark: { color: [102, 82, 56], grain: 0.7, rim: 0.3 } as Material,
  barkLight: { color: [136, 110, 74], grain: 0.65, rim: 0.3 } as Material,
  leafDark: { color: [38, 82, 52], grain: 0.4, rim: 0.3 } as Material,
  leaf: { color: [74, 140, 86], grain: 0.4, specular: 0.12, rim: 0.35 } as Material,
  leafLight: { color: [112, 190, 116], grain: 0.35, specular: 0.15, rim: 0.4 } as Material,
  sapGlow: { color: [140, 255, 170], teamTint: 0.4, emissive: 0.5, rim: 0.3 } as Material,

  // ---------------------------------------------------------------- obsidian (Pact)
  obsidianDark: { color: [26, 22, 30], specular: 0.75, rim: 0.4, grain: 0.2 } as Material,
  obsidian: { color: [46, 40, 52], specular: 0.85, rim: 0.45, grain: 0.2 } as Material,
  obsidianLight: { color: [90, 80, 102], specular: 0.9, rim: 0.5, grain: 0.15 } as Material,
  emberGlow: { color: [255, 132, 48], teamTint: 0.35, emissive: 0.75, rim: 0.3 } as Material,
  emberDim: { color: [168, 62, 26], emissive: 0.35, rim: 0.25 } as Material,

  // ---------------------------------------------------------------- cloth / flesh / misc
  clothDark: { color: [40, 36, 56], grain: 0.2, rim: 0.25 } as Material,
  cloth: { color: [78, 68, 106], grain: 0.2, rim: 0.3 } as Material,
  clothLight: { color: [114, 100, 152], grain: 0.2, rim: 0.3 } as Material,
  banner: { color: [220, 220, 240], teamTint: 0.95, rim: 0.3 } as Material,
  bannerDark: { color: [120, 120, 150], teamTint: 0.9, rim: 0.2 } as Material,
  flesh: { color: [156, 88, 74], grain: 0.25, rim: 0.3 } as Material,
  fleshDark: { color: [104, 56, 48], grain: 0.25, rim: 0.25 } as Material,
  bone: { color: [206, 198, 176], grain: 0.3, rim: 0.35 } as Material,
  boneDark: { color: [138, 130, 112], grain: 0.3, rim: 0.3 } as Material,
  wood: { color: [96, 72, 46], grain: 0.7, rim: 0.28 } as Material,
  woodDark: { color: [62, 46, 30], grain: 0.7, rim: 0.22 } as Material,
  eyeGlow: { color: [255, 236, 150], teamTint: 0.6, emissive: 0.95, rim: 0.3 } as Material,
  shadowBlack: { color: [18, 16, 26], alpha: 0.9, rim: 0.1 } as Material,
} as const;

export type MaterialName = keyof typeof MAT;

/** Team colours the atlas is baked for. Index matches the lobby's four default slot colours. */
export const TEAM_RAMP: { id: string; color: [number, number, number] }[] = [
  { id: 'blue', color: [79, 157, 255] },
  { id: 'red', color: [255, 93, 93] },
  { id: 'green', color: [92, 255, 138] },
  { id: 'gold', color: [255, 209, 102] },
];
