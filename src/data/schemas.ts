// Zod schemas validate every data file at load time and fail loudly with located errors.
import { z } from 'zod';

const armorClass = z.enum(['light', 'heavy', 'building']);
const shapeKind = z.enum(['triangle', 'circle', 'square', 'diamond', 'hexagon', 'pentagon', 'building']);

const artSchema = z.object({
  shape: shapeKind,
  size: z.number().positive(),
  accent: z.string(),
});

const sfxSchema = z
  .object({
    select: z.string().optional(),
    move: z.string().optional(),
    attack: z.string().optional(),
    die: z.string().optional(),
    ready: z.string().optional(),
  })
  .optional();

const vsSchema = z.object({ light: z.number(), heavy: z.number(), building: z.number() });

const weaponSchema = z.object({
  damage: z.number().nonnegative(),
  range: z.number().nonnegative(),
  cooldownTicks: z.number().int().positive(),
  projectile: z.string().nullable(),
  splashRadius: z.number().nonnegative().optional(),
  vs: vsSchema,
  targetsAir: z.boolean().optional(),
});

export const unitSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.literal('unit'),
  role: z.string(),
  cost: z.number().nonnegative(),
  buildTime: z.number().positive(),
  hp: z.number().positive(),
  armor: armorClass,
  speed: z.number().nonnegative(),
  sight: z.number().nonnegative(),
  radius: z.number().positive(),
  weapon: weaponSchema.nullable(),
  producedBy: z.string(),
  menuCategory: z.enum(['workers', 'small_troops', 'large_troops', 'wizards']),
  requires: z.array(z.string()),
  carry: z.number().positive().optional(),
  isHarvester: z.boolean().optional(),
  deploysAs: z.string().optional(),
  deployTime: z.number().positive().optional(),
  canConjureMana: z.boolean().optional(),
  art: artSchema,
  sfx: sfxSchema,
});

export const buildingSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortLabel: z.string().min(1).max(6),
  description: z.string().min(1),
  kind: z.literal('building'),
  cost: z.number().nonnegative(),
  buildTime: z.number().positive(),
  hp: z.number().positive(),
  armor: armorClass,
  sight: z.number().nonnegative(),
  footprint: z.number().int().positive(),
  menuCategory: z.enum(['buildings', 'defenses', 'advanced']).optional(),
  requires: z.array(z.string()),
  producesUnits: z.array(z.string()).optional(),
  isConstructionYard: z.boolean().optional(),
  isMobileHQ: z.boolean().optional(),
  packsInto: z.string().optional(),
  packTime: z.number().positive().optional(),
  isRefinery: z.boolean().optional(),
  spawnsFreeWisp: z.boolean().optional(),
  powerProduced: z.number().nonnegative().optional(),
  powerUsed: z.number().nonnegative().optional(),
  unlocksSpells: z.array(z.string()).optional(),
  isRadar: z.boolean().optional(),
  isWall: z.boolean().optional(),
  isGate: z.boolean().optional(),
  weapon: weaponSchema.nullable().optional(),
  art: artSchema,
  sfx: sfxSchema,
});

const spellEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('damage'), radius: z.number().positive(), damage: z.number().positive(), vs: vsSchema }),
  z.object({
    kind: z.literal('buff'),
    buff: z.enum(['aegis', 'haste']),
    radius: z.number().nonnegative(),
    durationTicks: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('blink') }),
]);

export const spellSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.literal('spell'),
  cooldownTicks: z.number().int().positive(),
  requiresConfirm: z.boolean(),
  targeting: z.enum(['ground', 'group']),
  aoeRadius: z.number().nonnegative(),
  effect: spellEffectSchema,
  requires: z.array(z.string()),
});

export const projectileSchema = z.object({
  id: z.string(),
  speed: z.number().positive(),
  art: artSchema,
});

export const factionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});

export const mapSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxPlayers: z.number().int().positive(),
  tileW: z.number().int().positive(),
  tileH: z.number().int().positive(),
  tiles: z.array(z.number().int()),
  startLocations: z.array(z.object({ x: z.number(), y: z.number() })),
  manaNodes: z.array(z.object({ x: z.number(), y: z.number(), amount: z.number().positive() })),
});

const aiParamsSchema = z.object({
  interval: z.number().int().positive(),
  wispTarget: z.number().int().nonnegative(),
  armyThreshold: z.number().int().positive(),
});

export const balanceSchema = z.object({
  startingMana: z.number().nonnegative(),
  siphonPerSecond: z.number().positive(),
  manaNodeCapacity: z.number().positive(),
  sellRefundRatio: z.number().min(0).max(1),
  repairManaPerHp: z.number().positive(),
  repairHpPerTick: z.number().positive(),
  conjureManaAmount: z.number().positive(),
  conjureManaIntervalSeconds: z.number().positive(),
  ai: z.object({ easy: aiParamsSchema, normal: aiParamsSchema, hard: aiParamsSchema }),
});

export const matchConfigSchema = z.object({
  mapId: z.string(),
  seed: z.number().int(),
  players: z.array(
    z.object({
      id: z.string(),
      controller: z.enum(['human', 'ai']),
      team: z.number().int(),
      color: z.string(),
      startIndex: z.number().int().nonnegative(),
      factionId: z.string().optional(),
      aiDifficulty: z.enum(['easy', 'normal', 'hard']).optional(),
    }),
  ),
});
