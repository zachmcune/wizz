// Pure TypeScript types for data-driven definitions. Loaded from /data JSON and validated by Zod.
// Both the sim and the renderer read these (renderer only touches the `art` block).

export type ArmorClass = 'light' | 'heavy' | 'building';
export type ShapeKind = 'triangle' | 'circle' | 'square' | 'diamond' | 'hexagon' | 'pentagon' | 'building';

export interface ArtDef {
  shape: ShapeKind;
  size: number; // draw size in world units
  accent: string; // hex accent color layered over the team color
}

export interface SfxDef {
  select?: string;
  move?: string;
  attack?: string;
  die?: string;
  ready?: string;
}

export interface WeaponDef {
  damage: number;
  range: number; // world units
  cooldownTicks: number;
  projectile: string | null; // projectile defId, or null for instant/melee
  splashRadius?: number;
  vs: Record<ArmorClass, number>; // damage multiplier by target armor class
  targetsAir?: boolean;
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
  requires: string[]; // building defIds required to unlock
  carry?: number; // Wisp harvest capacity
  isHarvester?: boolean;
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
  requires: string[];
  producesUnits?: string[]; // unit defIds this building can produce
  isConstructionYard?: boolean; // Sanctum
  isRefinery?: boolean; // Attunement Spire (drop-off)
  spawnsFreeWisp?: boolean;
  powerProduced?: number;
  powerUsed?: number;
  unlocksSpells?: string[];
  weapon?: WeaponDef | null; // Ward Turret
  art: ArtDef;
  sfx?: SfxDef;
}

export type SpellEffect =
  | { kind: 'damage'; radius: number; damage: number; vs: Record<ArmorClass, number> }
  | { kind: 'buff'; buff: 'aegis' | 'haste'; radius: number; durationTicks: number }
  | { kind: 'blink' };

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
  ai: Record<'easy' | 'normal' | 'hard', AiParams>;
}

export interface MapData {
  id: string;
  name: string;
  maxPlayers: number;
  tileW: number;
  tileH: number;
  // Row-major tile codes. 0 = passable ground, 1 = blocked (impassable).
  tiles: number[];
  startLocations: { x: number; y: number }[]; // world coords
  manaNodes: { x: number; y: number; amount: number }[];
}
