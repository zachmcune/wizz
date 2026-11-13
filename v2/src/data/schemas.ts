// Zod schemas. Every data file is validated at load time and failures are reported with the
// offending file path AND the field path, so a content typo never becomes a runtime mystery.
//
// v2 strictness over v1:
//  - `heights` is REQUIRED on maps (v1 treated it as optional and had a deprecated
//    `visualHeights` fallback). The 2.5D height system is a core rule, so a map without
//    elevation is a content bug, not a valid file.
//  - `art.sprite` is REQUIRED (v2 draws from an illustrated atlas, not a procedural shape).
//  - Numeric fields that must be positive are positive; no silent zeroes.
//  - Cross-file reference checks live in `validate-registry.ts` and run after loading.

import { z } from 'zod';

const armorClass = z.enum(['light', 'heavy', 'building']);
const shapeKind = z.enum(['triangle', 'circle', 'square', 'diamond', 'hexagon', 'pentagon', 'building']);
const attackFxKind = z.enum(['lunge_slash', 'bolt', 'slam']);

const artSchema = z.object({
  sprite: z.string().min(1),
  shape: shapeKind.optional(),
  size: z.number().positive(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'accent must be a #rrggbb hex colour'),
  directions: z.number().int().min(1).max(8).optional(),
  anchor: z.object({ x: z.number(), y: z.number() }).optional(),
  attackFx: attackFxKind.optional(),
  trail: z.boolean().optional(),
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

const vsSchema = z.object({ light: z.number().nonnegative(), heavy: z.number().nonnegative(), building: z.number().nonnegative() });

const turretWeaponSchema = z.object({
  rotationSpeed: z.number().positive(),
  fireArcRadians: z.number().positive().max(Math.PI),
});

const beamWeaponSchema = z.object({
  kind: z.enum(['flame', 'frost']),
  startWidth: z.number().positive(),
  endWidth: z.number().positive(),
  damageIntervalTicks: z.number().int().positive(),
  rotationSpeed: z.number().positive(),
  lingerTicks: z.number().int().nonnegative().optional(),
  lingerDamageFactor: z.number().nonnegative().optional(),
  maxFrostExposure: z.number().int().positive().optional(),
});

const weaponSchema = z.object({
  damage: z.number().nonnegative(),
  range: z.number().nonnegative(),
  cooldownTicks: z.number().int().positive(),
  projectile: z.string().nullable(),
  turret: turretWeaponSchema.optional(),
  beam: beamWeaponSchema.optional(),
  splashRadius: z.number().nonnegative().optional(),
  impactRadius: z.number().nonnegative().optional(),
  minRange: z.number().nonnegative().optional(),
  chargeTicks: z.number().int().nonnegative().optional(),
  preferSwarms: z.boolean().optional(),
  onHitStatus: z
    .object({
      kind: z.literal('slow'),
      durationTicks: z.number().int().positive(),
      moveFactor: z.number().positive(),
      attackCooldownFactor: z.number().positive(),
    })
    .optional(),
  chain: z
    .object({
      jumps: z.number().int().nonnegative(),
      range: z.number().nonnegative(),
      falloff: z.number().nonnegative(),
    })
    .optional(),
  vs: vsSchema,
  targetsAir: z.boolean().optional(),
  targetsGround: z.boolean().optional(),
});

const garrisonSchema = z.object({
  capacity: z.number().int().positive(),
  allowedUnitIds: z.array(z.string()).optional(),
  allowedRoles: z.array(z.string()).optional(),
  requireWeapon: z.boolean().optional(),
  rangeBonus: z.number().nonnegative().optional(),
  unloadRadius: z.number().nonnegative(),
  damageOnHostDestroyedFraction: z.number().min(0).max(1),
});

const auraSchema = z.object({
  kind: z.literal('heal'),
  radius: z.number().positive(),
  hpPerTick: z.number().positive(),
  affects: z.enum(['units', 'buildings', 'allies']),
});

const factionsField = z.array(z.string().min(1)).min(1).optional();

export const unitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.literal('unit'),
  role: z.string().min(1),
  cost: z.number().nonnegative(),
  buildTime: z.number().positive(),
  hp: z.number().positive(),
  armor: armorClass,
  speed: z.number().nonnegative(),
  sight: z.number().nonnegative(),
  radius: z.number().positive(),
  weapon: weaponSchema.nullable(),
  producedBy: z.string().min(1),
  menuCategory: z.enum(['workers', 'small_troops', 'large_troops', 'wizards']),
  requires: z.array(z.string()),
  factions: factionsField,
  carry: z.number().positive().optional(),
  isHarvester: z.boolean().optional(),
  canGarrison: z.boolean().optional(),
  deploysAs: z.string().optional(),
  deployTime: z.number().positive().optional(),
  canConjureMana: z.boolean().optional(),
  mobility: z.enum(['ground', 'air']).optional(),
  art: artSchema,
  sfx: sfxSchema,
});

export const buildingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
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
  factions: factionsField,
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
  isSuperweapon: z.boolean().optional(),
  isRadar: z.boolean().optional(),
  isWall: z.boolean().optional(),
  isGate: z.boolean().optional(),
  weapon: weaponSchema.nullable().optional(),
  garrison: garrisonSchema.optional(),
  aura: auraSchema.optional(),
  art: artSchema,
  sfx: sfxSchema,
});

const statOperation = z.enum(['add', 'multiply']);

const researchEffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unitStatModifier'),
    unitIds: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    stat: z.enum(['hp', 'speed', 'damage', 'range', 'cooldownTicks']),
    operation: statOperation,
    value: z.number(),
  }),
  z.object({
    kind: z.literal('buildingStatModifier'),
    buildingIds: z.array(z.string()).optional(),
    stat: z.enum(['hp', 'sight', 'powerUsed', 'powerProduced']),
    operation: statOperation,
    value: z.number(),
  }),
  z.object({
    kind: z.literal('economyModifier'),
    stat: z.enum(['siphonPerSecond', 'repairHpPerTick', 'repairManaPerHp']),
    operation: statOperation,
    value: z.number(),
  }),
]);

export const researchSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    kind: z.literal('research'),
    cost: z.number().nonnegative(),
    researchTime: z.number().positive(),
    requires: z.array(z.string()),
    researchedAt: z.string().min(1),
    factions: factionsField,
    effects: z.array(researchEffectSchema).min(1),
  })
  .refine((r) => r.effects.some((e) => e.kind !== 'unitStatModifier' || e.unitIds !== undefined || e.roles !== undefined), {
    // A unitStatModifier with neither unitIds nor roles silently applies to nothing; that is a
    // content bug that would look like "research does not work".
    message: 'a unitStatModifier must target unitIds or roles',
    path: ['effects'],
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
  z.object({
    kind: z.literal('beam'),
    radius: z.number().positive(),
    damagePerTick: z.number().positive(),
    vs: vsSchema,
    chargeTicks: z.number().int().nonnegative(),
    durationTicks: z.number().int().positive(),
    speed: z.number().nonnegative(),
  }),
]);

export const spellSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.literal('spell'),
  cooldownTicks: z.number().int().positive(),
  requiresConfirm: z.boolean(),
  targeting: z.enum(['ground', 'group']),
  aoeRadius: z.number().nonnegative(),
  effect: spellEffectSchema,
  requires: z.array(z.string()),
  factions: factionsField,
});

export const projectileSchema = z.object({
  id: z.string().min(1),
  speed: z.number().positive(),
  art: artSchema,
});

export const factionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  playstyle: z.string().optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'accent must be a #rrggbb hex colour')
    .optional(),
});

export const mapSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    maxPlayers: z.number().int().positive(),
    tileW: z.number().int().positive(),
    tileH: z.number().int().positive(),
    tiles: z.array(z.number().int().min(0).max(2)),
    heights: z.array(z.number().int().nonnegative()),
    startLocations: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
    manaNodes: z.array(z.object({ x: z.number(), y: z.number(), amount: z.number().positive() })).min(1),
  })
  .refine((m) => m.tiles.length === m.tileW * m.tileH, {
    message: 'tiles length must equal tileW * tileH',
    path: ['tiles'],
  })
  .refine((m) => m.heights.length === m.tiles.length, {
    message: 'heights length must equal tiles length',
    path: ['heights'],
  })
  .refine((m) => m.startLocations.length <= m.maxPlayers, {
    message: 'startLocations cannot exceed maxPlayers',
    path: ['startLocations'],
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
  vaultSiphonMultiplier: z.number().positive(),
  sellRefundRatio: z.number().min(0).max(1),
  repairManaPerHp: z.number().positive(),
  repairHpPerTick: z.number().positive(),
  conjureManaAmount: z.number().positive(),
  conjureManaIntervalSeconds: z.number().positive(),
  ai: z.object({ easy: aiParamsSchema, normal: aiParamsSchema, hard: aiParamsSchema }),
});

export const matchConfigSchema = z.object({
  id: z.string().min(1),
  mapId: z.string().min(1),
  seed: z.number().int(),
  players: z
    .array(
      z.object({
        id: z.string().min(1),
        controller: z.enum(['human', 'ai']),
        team: z.number().int().nonnegative(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #rrggbb hex colour'),
        startIndex: z.number().int().nonnegative(),
        factionId: z.string().optional(),
        aiStrategyId: z.string().optional(),
        aiDifficulty: z.enum(['easy', 'normal', 'hard']).optional(),
      }),
    )
    .min(2),
});
