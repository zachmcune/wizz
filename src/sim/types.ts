// Core simulation contracts. These are the single source of truth for sim state shape.
// Extend these; do not restructure. The sim only ever mutates GameState via commands.
import type { Vec2 } from '../core/coords';
import type { ArmorClass } from '../data/defs';
import type { Entity } from './entity-types';

export type PlayerId = string; // e.g. "player0"
export type EntityId = number; // stable integer, monotonically assigned
export type TeamId = number;
export type Relation = 'ally' | 'enemy' | 'neutral';

export type Stance = 'aggressive' | 'hold' | 'standground';

export interface Player {
  id: PlayerId;
  controller: 'human' | 'ai';
  aiDifficulty?: 'easy' | 'normal' | 'hard';
  team: TeamId;
  color: string; // hex, rendering only
  factionId?: string;
  aiStrategyId?: string;
  mana: number;
  power: number; // produced power
  powerUsed: number; // consumed power
  unlockedTech: string[]; // building defIds this player has built (enables tech gating)
  completedResearch: string[]; // permanent upgrades completed by this player
  spellCooldowns: Record<string, number>; // spellId -> ticks remaining
  defeated: boolean;
  /** Tiles seen at least once (tracked for fog; terrain always renders). */
  explored: number[];
  /** Recomputed each tick: 1 = currently in sight. */
  visible: number[];
  /** Last-seen enemy buildings shown as gray ghosts when out of sight (Generals-style). */
  knownBuildings: Record<EntityId, KnownBuilding>;
}

/** Frozen snapshot of an enemy building the player has scouted. */
export interface KnownBuilding {
  id: EntityId;
  owner: PlayerId;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  buildProgress?: number;
}

export type UnitState =
  | 'idle'
  | 'moving'
  | 'attacking'
  | 'harvesting'
  | 'returning'
  | 'channeling'
  | 'producing'
  | 'building'
  | 'garrisoned'
  | 'dead';

export type Order =
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; targetId: EntityId }
  | { type: 'attackMove'; x: number; y: number }
  | { type: 'moveInOrder'; x: number; y: number; groupSpeed: number }
  | { type: 'harvest'; nodeId: EntityId }
  | { type: 'garrison'; buildingId: EntityId }
  | { type: 'hold' };

export interface ProductionItem {
  defId: string;
  progress: number; // ticks accumulated
  required: number; // ticks needed
}

export interface Buff {
  kind: 'aegis' | 'haste';
  expiresTick: number;
}

export interface SlowBuff {
  kind: 'slow';
  expiresTick: number;
  moveFactor: number;
  attackCooldownFactor: number;
}

export type GameplayBuff = Buff | SlowBuff;

export interface SuperweaponBeam {
  id: EntityId;
  owner: PlayerId;
  spellId: string;
  pos: Vec2;
  dir: Vec2; // normalized heading; {0,0} = stationary
  speed: number; // world units / second
  radius: number;
  damagePerTick: number;
  durationTicks: number;
  vs: Record<ArmorClass, number>;
  state: 'charging' | 'firing';
  fireTick: number; // tick charging -> firing
  expiresTick: number; // tick firing -> removed (0 until firing starts)
}

export type { Entity, UnitEntity, BuildingEntity, ProjectileEntity, ResourceNodeEntity } from './entity-types';
export { isUnit, isBuilding, isProjectile, isResourceNode, isHarvester, isCombatUnit } from './entity-types';

export type DevCommand =
  | { type: 'devSetMana'; playerId: PlayerId; amount: number; mode: 'set' | 'add' | 'remove' }
  | { type: 'devSpawnUnit'; playerId: PlayerId; defId: string; x: number; y: number; count?: number }
  | { type: 'devSpawnBuilding'; playerId: PlayerId; defId: string; x: number; y: number; complete?: boolean }
  | { type: 'devDestroyEntity'; playerId: PlayerId; entityIds: EntityId[] }
  | { type: 'devSetEntityHp'; playerId: PlayerId; entityId: EntityId; hp: number | 'max' | 'kill' }
  | { type: 'devUnlockTech'; playerId: PlayerId; defId: string | 'all' }
  | { type: 'devClearUnits'; playerId: PlayerId; targetPlayerId?: PlayerId }
  | { type: 'devCastSpell'; playerId: PlayerId; spellId: string; x: number; y: number; entityIds?: EntityId[] }
  | { type: 'devCompleteResearch'; playerId: PlayerId; defId?: string }
  | {
      type: 'devAddPlayer';
      playerId: PlayerId;
      newPlayerId: PlayerId;
      controller: 'human' | 'ai';
      team: TeamId;
      color: string;
      startIndex: number;
      aiDifficulty?: 'easy' | 'normal' | 'hard';
    }
  | { type: 'devRemovePlayer'; playerId: PlayerId; targetPlayerId: PlayerId }
  | {
      type: 'devConfigurePlayer';
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      team?: TeamId;
      aiDifficulty?: 'easy' | 'normal' | 'hard';
      controller?: 'human' | 'ai';
    };

export type Command =
  | { type: 'move'; playerId: PlayerId; entityIds: EntityId[]; x: number; y: number }
  | { type: 'attack'; playerId: PlayerId; entityIds: EntityId[]; targetId: EntityId }
  | { type: 'attackMove'; playerId: PlayerId; entityIds: EntityId[]; x: number; y: number }
  | { type: 'moveInOrder'; playerId: PlayerId; entityIds: EntityId[]; x: number; y: number }
  | { type: 'harvest'; playerId: PlayerId; entityIds: EntityId[]; nodeId: EntityId }
  | { type: 'stop'; playerId: PlayerId; entityIds: EntityId[] }
  | { type: 'setStance'; playerId: PlayerId; entityIds: EntityId[]; stance: Stance }
  | { type: 'build'; playerId: PlayerId; defId: string; x: number; y: number }
  | { type: 'deploy'; playerId: PlayerId; entityId: EntityId; x: number; y: number }
  | { type: 'pack'; playerId: PlayerId; buildingId: EntityId }
  | { type: 'produce'; playerId: PlayerId; buildingId: EntityId; defId: string }
  | { type: 'cancelProduce'; playerId: PlayerId; buildingId: EntityId; index: number }
  | { type: 'research'; playerId: PlayerId; buildingId: EntityId; defId: string }
  | { type: 'cancelResearch'; playerId: PlayerId; buildingId: EntityId; index: number }
  | { type: 'setRally'; playerId: PlayerId; buildingId: EntityId; x: number; y: number }
  | { type: 'sellBuilding'; playerId: PlayerId; buildingId: EntityId }
  | { type: 'setRepair'; playerId: PlayerId; buildingId: EntityId; enabled: boolean }
  | { type: 'garrison'; playerId: PlayerId; unitIds: EntityId[]; buildingId: EntityId }
  | { type: 'unloadGarrison'; playerId: PlayerId; buildingId: EntityId; unitIds?: EntityId[] }
  | { type: 'channel'; playerId: PlayerId; entityIds: EntityId[]; enabled: boolean }
  | { type: 'castSpell'; playerId: PlayerId; spellId: string; x: number; y: number; entityIds?: EntityId[] }
  | { type: 'steerSuperweapon'; playerId: PlayerId; x: number; y: number }
  | { type: 'surrender'; playerId: PlayerId }
  | DevCommand;

export type GameEvent =
  | { type: 'entitySpawned'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'entityDied'; id: EntityId; defId: string; owner: PlayerId; x: number; y: number; killerId?: EntityId }
  | { type: 'buildingComplete'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'mobileHQDeployed'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'mobileHQPacked'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'buildingSold'; id: EntityId; defId: string; owner: PlayerId; refund: number }
  | { type: 'buildingPlaced'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'damageDealt'; targetId: EntityId; amount: number; x: number; y: number }
  | { type: 'healApplied'; targetId: EntityId; amount: number; x: number; y: number }
  | { type: 'attackFired'; sourceId: EntityId; x: number; y: number; crystalIndex?: number }
  | { type: 'attackCharging'; sourceId: EntityId; x: number; y: number }
  | {
      type: 'chainLightningFired';
      sourceId: EntityId;
      x: number;
      y: number;
      hits: { targetId: EntityId; x: number; y: number }[];
    }
  | { type: 'artilleryImpact'; x: number; y: number; radius: number; sourceId?: EntityId }
  | { type: 'beamStarted'; sourceId: EntityId; x: number; y: number }
  | { type: 'beamStopped'; sourceId: EntityId; x: number; y: number }
  | { type: 'manaChanged'; playerId: PlayerId; mana: number }
  | { type: 'manaDeposited'; playerId: PlayerId; amount: number; x: number; y: number }
  | { type: 'manaConjured'; playerId: PlayerId; amount: number; x: number; y: number }
  | { type: 'underAttack'; playerId: PlayerId; x: number; y: number }
  | { type: 'spellCast'; playerId: PlayerId; spellId: string; x: number; y: number }
  | { type: 'superweaponLaunched'; playerId: PlayerId; x: number; y: number }
  | { type: 'superweaponFired'; playerId: PlayerId; x: number; y: number }
  | { type: 'superweaponEnded'; playerId: PlayerId; x: number; y: number }
  | { type: 'orderIssued'; playerId: PlayerId; kind: string; x: number; y: number }
  | { type: 'commandRejected'; playerId: PlayerId; reason: string }
  | { type: 'playerDefeated'; playerId: PlayerId }
  | { type: 'matchEnded'; winnerTeam: TeamId };

export interface GameState {
  tick: number;
  rngState: number;
  players: Player[];
  relations: Record<PlayerId, Record<PlayerId, Relation>>;
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
  mapId: string;
  winnerTeam: TeamId | null;
  ended: boolean;
  beams: SuperweaponBeam[];
  oneSuperweaponPerPlayer: boolean;
  sandbox?: import('./sandbox-types').SandboxRuntime;
}

export interface MatchPlayerConfig {
  id: PlayerId;
  controller: 'human' | 'ai';
  team: TeamId;
  color: string;
  startIndex: number;
  factionId?: string;
  aiStrategyId?: string;
  aiDifficulty?: 'easy' | 'normal' | 'hard';
}

export interface MatchConfig {
  /** Stable lookup key in data/match/*.json; optional for runtime-built configs. */
  id?: string;
  mapId: string;
  seed: number;
  players: MatchPlayerConfig[];
  /** When true, eliminated human players see the live full map (no fog) while spectating. */
  deadSpectatorReveal?: boolean;
  /** When true (default), each player may build only one superweapon building. */
  oneSuperweaponPerPlayer?: boolean;
  /** Economy pacing preset for this match. */
  economyPacing?: 'standard' | 'tight';
  /** Sandbox dev matches bypass retail autosave and enable dev commands. */
  mode?: 'standard' | 'sandbox';
  sandboxDefaults?: Partial<import('./sandbox-types').SandboxSettings>;
}
