// Per-difficulty behavioral profiles. Balance.json still owns interval / eco / army size;
// these flags decide *how* the opponent plays so Easy, Normal, and Hard feel distinct.
import type { AiParams } from '../data/defs';

export type AiDifficultyId = 'easy' | 'normal' | 'hard';

export type AiIntelMode = 'probe' | 'memory' | 'omniscient';

export interface AiDifficultyProfile {
  id: AiDifficultyId;
  /** Skip optional actions (army produce, extra towers, spells) this often. */
  missChance: number;
  /** Mana Weavers to train and park on conjure. */
  weaverTarget: number;
  /** Flying harassers to keep in the field. */
  airTarget: number;
  /** Max items queued at a production building. */
  maxQueue: number;
  /** Fraction of idle army sent on a push (low = dribbled attacks). */
  waveFraction: number;
  /** Scales strategy minPushFactor. Lower = attacks with a smaller clump. */
  minPushScale: number;
  /** Independent attack axes (1 = a single blob, 3 = left/center/right). */
  attackAxes: number;
  /** Extra Summoning Circles beyond the first. */
  extraFactories: number;
  /** Waystone Camps to plant away from the main HQ (0 = turtle). */
  expandCamps: number;
  /** Idle troops parked on each expansion. */
  holdCount: number;
  /** Scales strategy defendRadius. */
  defendRadiusScale: number;
  /** Scales strategy defendFraction. */
  defendFractionScale: number;
  /** Pull a damaged field army home when average HP is at or below this (0 = never). */
  retreatHp: number;
  /** How the AI picks attack destinations. */
  intel: AiIntelMode;
  scout: boolean;
  harass: boolean;
  expandNodes: boolean;
  repair: boolean;
  /** Repair every damaged structure, not just HQ / production. */
  repairAll: boolean;
  workerFlee: boolean;
  workerDefense: boolean;
  /** Redirect busy units when the base is raided (Easy only uses idle troops). */
  redirectDefense: boolean;
  focusFire: boolean;
  utilitySpells: boolean;
  blinkSiege: boolean;
  meteorMinEnemies: number;
  aegisMinArmy: number;
}

export const AI_DIFFICULTY_HINTS: Record<AiDifficultyId, string> = {
  easy: 'Slow and sloppy — dribbled attacks, no spells or raids. Good for learning the ropes.',
  normal: 'Masses real waves, cracks defenses, expands with a Waystone, and builds the Astral Spire.',
  hard: 'Relentless — multi-pronged armies, expansions, superweapons, and the full spellbook.',
};

const PROFILES: Record<AiDifficultyId, AiDifficultyProfile> = {
  easy: {
    id: 'easy',
    missChance: 0.32,
    weaverTarget: 0,
    airTarget: 0,
    maxQueue: 1,
    waveFraction: 0.4,
    minPushScale: 0.7,
    attackAxes: 1,
    extraFactories: 0,
    expandCamps: 0,
    holdCount: 0,
    defendRadiusScale: 0.65,
    defendFractionScale: 0.45,
    retreatHp: 0,
    intel: 'probe',
    scout: false,
    harass: false,
    expandNodes: false,
    repair: false,
    repairAll: false,
    workerFlee: false,
    workerDefense: false,
    redirectDefense: false,
    focusFire: false,
    utilitySpells: false,
    blinkSiege: false,
    meteorMinEnemies: 99,
    aegisMinArmy: 99,
  },
  normal: {
    id: 'normal',
    missChance: 0.05,
    weaverTarget: 1,
    airTarget: 1,
    maxQueue: 2,
    waveFraction: 0.85,
    minPushScale: 1,
    attackAxes: 2,
    extraFactories: 1,
    expandCamps: 1,
    holdCount: 2,
    defendRadiusScale: 1,
    defendFractionScale: 1,
    retreatHp: 0.28,
    intel: 'memory',
    scout: true,
    harass: true,
    expandNodes: true,
    repair: true,
    repairAll: false,
    workerFlee: true,
    workerDefense: true,
    redirectDefense: true,
    focusFire: true,
    utilitySpells: true,
    blinkSiege: false,
    meteorMinEnemies: 5,
    aegisMinArmy: 8,
  },
  hard: {
    id: 'hard',
    missChance: 0,
    weaverTarget: 2,
    airTarget: 2,
    maxQueue: 3,
    waveFraction: 1,
    minPushScale: 0.85,
    attackAxes: 3,
    extraFactories: 2,
    expandCamps: 2,
    holdCount: 3,
    defendRadiusScale: 1.3,
    defendFractionScale: 1.15,
    retreatHp: 0.34,
    intel: 'omniscient',
    scout: true,
    harass: true,
    expandNodes: true,
    repair: true,
    repairAll: true,
    workerFlee: true,
    workerDefense: true,
    redirectDefense: true,
    focusFire: true,
    utilitySpells: true,
    blinkSiege: true,
    meteorMinEnemies: 4,
    aegisMinArmy: 6,
  },
};

export function difficultyProfile(id: AiDifficultyId | undefined): AiDifficultyProfile {
  return PROFILES[id ?? 'normal'];
}

/** After this tick, every difficulty commits to a finish (no more wandering or wounded holds). */
export const LATE_GAME_TICK = 20 * 60 * 10;

export function resolveDifficulty(
  params: Record<AiDifficultyId, AiParams>,
  id: AiDifficultyId | undefined,
): { params: AiParams; profile: AiDifficultyProfile } {
  const key = id ?? 'normal';
  return { params: params[key], profile: PROFILES[key] };
}
