// Pure TypeScript types for data-driven definitions. Loaded from v2/data JSON and validated by Zod.
// The sim reads everything here; the renderer only touches the `art` block.

export type ArmorClass = 'light' | 'heavy' | 'building';

/** Placeholder-shape kinds, kept only for the procedural fallback provider (v2 art is an atlas). */
export type ShapeKind = 'triangle' | 'circle' | 'square' | 'diamond' | 'hexagon' | 'pentagon' | 'building';

export type BuildMenuCategory = 'buildings' | 'defenses' | 'advanced';
export type TrainMenuCategory = 'workers' | 'small_troops' | 'large_troops' | 'wizards';
export type MenuCategory = BuildMenuCategory | TrainMenuCategory;

/** Attack tell kind. Renderer/VFX only; never affects combat maths. */
export type AttackFxKind = 'lunge_slash' | 'bolt' | 'slam';

export interface ArtDef {
  /** Frame key in the illustrated atlas. Required in v2. */
  sprite: string;
  /** Fallback procedural shape for the `procedural` provider. */
  shape?: ShapeKind;
  /** Draw size in world units (the sprite's world footprint height). */
  size: number;
  /** Accent colour used by icons and fallback art. */
  accent: string;
  /** Directional frames available in the atlas (1 = single frame, 8 = full facing set). */
  directions?: number;
  /** World-space pivot as a fraction of the frame; omit to pin buildings to their foundation. */
  anchor?: { x: number; y: number };
  attackFx?: AttackFxKind;
  /** Short motion streak behind this projectile. */
  trail?: boolean;
}

export interface SfxDef {
  select?: string;
  move?: string;
  attack?: string;
  die?: string;
  ready?: string;
}

export type BeamKind = 'flame' | 'frost';

/** Smooth-tracking turret: eases toward targets and may fire within a forward arc while turning. */
export interface TurretWeaponDef {
  /** Radians per second of eased aim. */
  rotationSpeed: number;
  /** Half-angle from the barrel within which firing is allowed. */
  fireArcRadians: number;
}

/** Continuous beam weapon: the tower tracks a target and damages every enemy in the beam volume. */
export interface BeamWeaponDef {
  kind: BeamKind;
  /** Mouth width at the tower, in world units. */
  startWidth: number;
  /** Width at maximum range, in world units. */
  endWidth: number;
  /** Effect cadence in ticks (2 ticks = 0.1 s at 20 Hz). */
  damageIntervalTicks: number;
  /** Radians per second of smooth aim. */
  rotationSpeed: number;
  /** Flame: ticks of burn after leaving the beam. */
  lingerTicks?: number;
  /** Flame: fraction of weapon.damage applied per linger tick. */
  lingerDamageFactor?: number;
  /** Frost: exposure ticks required to reach the maximum slow. */
  maxFrostExposure?: number;
}

export interface WeaponDef {
  damage: number;
  /** Maximum range in world units. */
  range: number;
  cooldownTicks: number;
  /** Projectile defId, or null for instant/melee. */
  projectile: string | null;
  turret?: TurretWeaponDef;
  beam?: BeamWeaponDef;
  splashRadius?: number;
  impactRadius?: number;
  minRange?: number;
  chargeTicks?: number;
  preferSwarms?: boolean;
  onHitStatus?: { kind: 'slow'; durationTicks: number; moveFactor: number; attackCooldownFactor: number };
  chain?: { jumps: number; range: number; falloff: number };
  /** Damage multiplier by target armour class. This is the counter system. */
  vs: Record<ArmorClass, number>;
  /** When true the weapon can hit air-mobility units. Default false. */
  targetsAir?: boolean;
  /** When false the weapon cannot hit ground units/buildings. Default true. */
  targetsGround?: boolean;
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
  /** Mana cost. */
  cost: number;
  /** Seconds. */
  buildTime: number;
  hp: number;
  armor: ArmorClass;
  /** World units per second. */
  speed: number;
  /** Sight radius in world units. */
  sight: number;
  radius: number;
  weapon: WeaponDef | null;
  producedBy: string;
  menuCategory: TrainMenuCategory;
  /** Building defIds required to unlock this unit. */
  requires: string[];
  /** Only buildable by these factions. Omitted = every faction. */
  factions?: string[];
  /** Wisp harvest capacity. */
  carry?: number;
  isHarvester?: boolean;
  canGarrison?: boolean;
  /** Building defId produced by deploying (mobile HQ). */
  deploysAs?: string;
  /** Seconds to deploy. */
  deployTime?: number;
  canConjureMana?: boolean;
  /** Ground units use nav/ramps; air units ignore ground blockers. Default ground. */
  mobility?: 'ground' | 'air';
  art: ArtDef;
  sfx?: SfxDef;
}

export interface BuildingDef {
  id: string;
  name: string;
  /** 2–4 char map label. */
  shortLabel: string;
  description: string;
  kind: 'building';
  cost: number;
  /** Seconds. */
  buildTime: number;
  hp: number;
  armor: ArmorClass;
  sight: number;
  /** Square footprint in tiles. */
  footprint: number;
  menuCategory?: BuildMenuCategory;
  requires: string[];
  /** Only buildable by these factions. Omitted = every faction. */
  factions?: string[];
  producesUnits?: string[];
  /** Sanctum / mobile camp. */
  isConstructionYard?: boolean;
  /** Deployed Waystone Camp (packable). */
  isMobileHQ?: boolean;
  /** Unit defId produced when packed. */
  packsInto?: string;
  /** Seconds to pack up. */
  packTime?: number;
  /** Mana drop-off (Attunement Spire). */
  isRefinery?: boolean;
  spawnsFreeWisp?: boolean;
  powerProduced?: number;
  powerUsed?: number;
  unlocksSpells?: string[];
  isSuperweapon?: boolean;
  /** Enables the minimap (RA2 radar). */
  isRadar?: boolean;
  isWall?: boolean;
  /** Allies pass; enemies are blocked. */
  isGate?: boolean;
  weapon?: WeaponDef | null;
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
  /** Seconds. */
  researchTime: number;
  /** Building defIds or research ids that must be complete first. */
  requires: string[];
  /** Building defId where this research is performed. */
  researchedAt: string;
  /** Faction that may research this. Omitted = every faction. */
  factions?: string[];
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
  /** Radius of the targeting indicator. */
  aoeRadius: number;
  effect: SpellEffect;
  /** Building defIds required to unlock. */
  requires: string[];
  factions?: string[];
}

export interface ProjectileDef {
  id: string;
  /** World units per second. */
  speed: number;
  art: ArtDef;
}

export interface AiParams {
  /** Ticks between decision passes. */
  interval: number;
  /** Desired harvester count. */
  wispTarget: number;
  /** Army size before attacking. */
  armyThreshold: number;
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
  /** Playstyle blurb shown in the lobby; new in v2. */
  playstyle?: string;
  /** Accent colour used by menus and the tech tree; new in v2. */
  accent?: string;
}

export interface MapStart {
  x: number;
  y: number;
}

export interface MapManaNode {
  x: number;
  y: number;
  amount: number;
}

export interface MapData {
  id: string;
  name: string;
  /** Short character blurb shown in the lobby; new in v2. */
  description?: string;
  maxPlayers: number;
  tileW: number;
  tileH: number;
  /** Row-major tile codes: 0 = passable ground, 1 = blocked, 2 = ramp. */
  tiles: number[];
  /** Row-major elevation levels, same length as tiles. */
  heights: number[];
  startLocations: MapStart[];
  manaNodes: MapManaNode[];
}
