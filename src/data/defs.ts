// Pure TypeScript types for data-driven definitions. Loaded from /data JSON and validated by Zod.
// Both the sim and the renderer read these (renderer only touches the `art` block).

export type ArmorClass = 'light' | 'heavy' | 'building';
export type ShapeKind = 'triangle' | 'circle' | 'square' | 'diamond' | 'hexagon' | 'pentagon' | 'building';

export type BuildMenuCategory = 'buildings' | 'defenses' | 'advanced';
export type TrainMenuCategory = 'workers' | 'small_troops' | 'large_troops' | 'wizards';
export type MenuCategory = BuildMenuCategory | TrainMenuCategory;

export interface ArtDef {
  shape: ShapeKind;
  size: number; // draw size in world units
  accent: string; // hex accent color layered over the team color
  /** Procedural design key; defaults to entity id when omitted. */
  sprite?: string;
  /** Phase 3: sprite atlas path (when set, AtlasSpriteProvider uses this instead of shape). */
  atlas?: string;
  frameWidth?: number;
  frameHeight?: number;
  directions?: number;
  anchor?: { x: number; y: number };
}

export interface SfxDef {
  select?: string;
  move?: string;
  attack?: string;
  die?: string;
  ready?: string;
}

export type BeamKind = 'flame' | 'frost';

/** Smooth-tracking turret — eases toward targets and may fire within a forward arc while still turning. */
export interface TurretWeaponDef {
  rotationSpeed: number; // radians per second for eased aim
  fireArcRadians: number; // half-angle from barrel within which firing is allowed
}

/** Continuous beam weapon — towers track a target and damage/slow all enemies in the beam volume. */
export interface BeamWeaponDef {
  kind: BeamKind;
  startWidth: number; // mouth width at tower (world units)
  endWidth: number; // width at max range
  damageIntervalTicks: number; // effect cadence (~0.1s = 2 ticks at 20 Hz)
  rotationSpeed: number; // radians per second for smooth aim
  lingerTicks?: number; // flame: short burn after leaving the beam
  lingerDamageFactor?: number; // flame: fraction of weapon.damage per linger tick
  maxFrostExposure?: number; // frost: ticks to reach full slow buildup
}

export interface WeaponDef {
  damage: number;
  range: number; // world units
  cooldownTicks: number;
  projectile: string | null; // projectile defId, or null for instant/melee
  turret?: TurretWeaponDef; // smooth tracking + fire-while-turning (Arcane Sentry)
  beam?: BeamWeaponDef; // continuous beam (replaces projectile for beam towers)
  splashRadius?: number;
  impactRadius?: number;
  minRange?: number;
  chargeTicks?: number;
  preferSwarms?: boolean;
  onHitStatus?: { kind: 'slow'; durationTicks: number; moveFactor: number; attackCooldownFactor: number };
  chain?: { jumps: number; range: number; falloff: number };
  vs: Record<ArmorClass, number>; // damage multiplier by target armor class
  targetsAir?: boolean;
}

export interface GarrisonDef {
  capacity: number;
  allowedUnitIds?: string[];
  allowedRoles?: string[];
  requireWeapon?: boolean;
  rangeBonus?: number;
  unloadRadius: number;
  damageOnHostDestroyedFraction: number;
}

export interface AuraDef {
  kind: 'heal';
  radius: number;
  hpPerTick: number;
  affects: 'units' | 'buildings' | 'allies';
}

export interface UnitDef {
  id: string;
  name: string;
  kind: 'unit';
  role: string;
  cost: number;
  buildTime: number; // seconds
  hp: number;
  armor: ArmorClass;
  speed: number; // world units per second
  sight: number; // world units
  radius: number;
  weapon: WeaponDef | null;
  producedBy: string; // building defId
  menuCategory: TrainMenuCategory;
  requires: string[]; // building defIds required to unlock
  carry?: number; // Wisp harvest capacity
  isHarvester?: boolean;
  canGarrison?: boolean;
  deploysAs?: string; // building defId when deployed (mobile HQ)
  deployTime?: number; // seconds to deploy
  canConjureMana?: boolean;
  art: ArtDef;
  sfx?: SfxDef;
}

export interface BuildingDef {
  id: string;
  name: string;
  shortLabel: string; // 2–4 char map label
  description: string; // shown in HUD when selected / building
  kind: 'building';
  cost: number;
  buildTime: number; // seconds
  hp: number;
  armor: ArmorClass;
  sight: number;
  footprint: number; // tiles (square)
  menuCategory?: BuildMenuCategory;
  requires: string[];
  producesUnits?: string[]; // unit defIds this building can produce
  isConstructionYard?: boolean; // Sanctum / mobile camp
  isMobileHQ?: boolean; // deployed Waystone Camp (packable)
  packsInto?: string; // unit defId when packed
  packTime?: number; // seconds to pack up
  isRefinery?: boolean; // Attunement Spire (drop-off)
  spawnsFreeWisp?: boolean;
  powerProduced?: number;
  powerUsed?: number;
  unlocksSpells?: string[];
  isSuperweapon?: boolean;
  isRadar?: boolean; // reveals entire map on minimap (RA2 radar)
  isWall?: boolean;
  isGate?: boolean; // allies pass; enemies blocked
  weapon?: WeaponDef | null; // Arcane Sentry
  garrison?: GarrisonDef;
  aura?: AuraDef;
  art: ArtDef;
  sfx?: SfxDef;
}

export type ResearchEffect =
  | {
      kind: 'unitStatModifier';
      unitIds?: string[];
      roles?: string[];
      stat: 'hp' | 'speed' | 'damage' | 'range' | 'cooldownTicks';
      operation: 'add' | 'multiply';
      value: number;
    }
  | {
      kind: 'buildingStatModifier';
      buildingIds?: string[];
      stat: 'hp' | 'sight' | 'powerUsed' | 'powerProduced';
      operation: 'add' | 'multiply';
      value: number;
    }
  | {
      kind: 'economyModifier';
      stat: 'siphonPerSecond' | 'repairHpPerTick' | 'repairManaPerHp';
      operation: 'add' | 'multiply';
      value: number;
    };

export interface ResearchDef {
  id: string;
  name: string;
  description: string;
  kind: 'research';
  cost: number;
  researchTime: number; // seconds
  requires: string[];
  researchedAt: string; // building defId
  effects: ResearchEffect[];
}

export type SpellEffect =
  | { kind: 'damage'; radius: number; damage: number; vs: Record<ArmorClass, number> }
  | { kind: 'buff'; buff: 'aegis' | 'haste'; radius: number; durationTicks: number }
  | { kind: 'blink' }
  | {
      kind: 'beam';
      radius: number;
      damagePerTick: number;
      vs: Record<ArmorClass, number>;
      chargeTicks: number;
      durationTicks: number;
      speed: number;
    };

export interface SpellDef {
  id: string;
  name: string;
  kind: 'spell';
  cooldownTicks: number;
  requiresConfirm: boolean;
  targeting: 'ground' | 'group';
  aoeRadius: number; // for the targeting indicator
  effect: SpellEffect;
  requires: string[]; // building defIds required to unlock
}

export interface ProjectileDef {
  id: string;
  speed: number; // world units per second
  art: ArtDef;
}

export interface AiParams {
  interval: number; // ticks between decision passes
  wispTarget: number; // desired harvester count
  armyThreshold: number; // army size before attacking
}

export interface BalanceData {
  startingMana: number;
  siphonPerSecond: number;
  manaNodeCapacity: number;
  vaultSiphonMultiplier: number;
  sellRefundRatio: number;
  repairManaPerHp: number;
  repairHpPerTick: number;
  conjureManaAmount: number;
  conjureManaIntervalSeconds: number;
  ai: Record<'easy' | 'normal' | 'hard', AiParams>;
}

export interface FactionDef {
  id: string;
  name: string;
  description: string;
}

export interface MapData {
  id: string;
  name: string;
  maxPlayers: number;
  tileW: number;
  tileH: number;
  // Row-major tile codes. 0 = passable ground, 1 = blocked (impassable).
  tiles: number[];
  /** Render-only height levels (row-major, same length as tiles). Sim ignores this in Phase 1. */
  visualHeights?: number[];
  startLocations: { x: number; y: number }[]; // world coords
  manaNodes: { x: number; y: number; amount: number }[];
}
