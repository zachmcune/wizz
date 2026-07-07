// Core simulation contracts. These are the single source of truth for sim state shape.
// Extend these; do not restructure. The sim only ever mutates GameState via commands.
import type { Vec2 } from '../core/coords';

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
  mana: number;
  power: number; // produced power
  powerUsed: number; // consumed power
  unlockedTech: string[]; // building defIds this player has built (enables tech gating)
  spellCooldowns: Record<string, number>; // spellId -> ticks remaining
  defeated: boolean;
  /** Tiles seen at least once (tracked for fog; terrain always renders). */
  explored: number[];
  /** Recomputed each tick: 1 = currently in sight. */
  visible: number[];
}

export type UnitState =
  | 'idle'
  | 'moving'
  | 'attacking'
  | 'harvesting'
  | 'returning'
  | 'producing'
  | 'building'
  | 'dead';

export type Order =
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; targetId: EntityId }
  | { type: 'attackMove'; x: number; y: number }
  | { type: 'harvest'; nodeId: EntityId }
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

export interface Entity {
  id: EntityId;
  owner: PlayerId;
  defId: string;
  kind: 'unit' | 'building' | 'resource_node' | 'projectile';
  pos: Vec2;
  vel: Vec2;
  facing: number; // radians, for rendering
  hp: number;
  maxHp: number;
  radius: number;
  orders: Order[];
  state: UnitState;
  stance: Stance;
  targetId?: EntityId;
  cooldowns: Record<string, number>; // e.g. { attack: 3 } in ticks
  buffs: Buff[];

  // economy (Wisp)
  carry?: number;
  carryMax?: number;
  homeSpireId?: EntityId;

  // buildings
  buildProgress?: number; // 0..1 while under construction; undefined when complete
  productionQueue?: ProductionItem[];
  rally?: Vec2;

  // deploy / pack (mobile HQ)
  morphProgress?: number; // 0..1 while deploying or packing
  morphAction?: 'deploy' | 'pack';
  morphTargetPos?: Vec2;
  morphTargetDefId?: string;

  // projectile
  projTargetId?: EntityId;
  projDamage?: number;
  projArmorVs?: Record<string, number>;
  projSpeed?: number;
  projSourceOwner?: PlayerId;

  // resource node
  amount?: number;
  amountMax?: number;
}

export type Command =
  | { type: 'move'; playerId: PlayerId; entityIds: EntityId[]; x: number; y: number }
  | { type: 'attack'; playerId: PlayerId; entityIds: EntityId[]; targetId: EntityId }
  | { type: 'attackMove'; playerId: PlayerId; entityIds: EntityId[]; x: number; y: number }
  | { type: 'harvest'; playerId: PlayerId; entityIds: EntityId[]; nodeId: EntityId }
  | { type: 'stop'; playerId: PlayerId; entityIds: EntityId[] }
  | { type: 'setStance'; playerId: PlayerId; entityIds: EntityId[]; stance: Stance }
  | { type: 'build'; playerId: PlayerId; defId: string; x: number; y: number }
  | { type: 'deploy'; playerId: PlayerId; entityId: EntityId; x: number; y: number }
  | { type: 'pack'; playerId: PlayerId; buildingId: EntityId }
  | { type: 'produce'; playerId: PlayerId; buildingId: EntityId; defId: string }
  | { type: 'cancelProduce'; playerId: PlayerId; buildingId: EntityId; index: number }
  | { type: 'setRally'; playerId: PlayerId; buildingId: EntityId; x: number; y: number }
  | { type: 'castSpell'; playerId: PlayerId; spellId: string; x: number; y: number; entityIds?: EntityId[] }
  | { type: 'surrender'; playerId: PlayerId };

export type GameEvent =
  | { type: 'entitySpawned'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'entityDied'; id: EntityId; defId: string; owner: PlayerId; x: number; y: number; killerId?: EntityId }
  | { type: 'buildingComplete'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'mobileHQDeployed'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'mobileHQPacked'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'buildingPlaced'; id: EntityId; defId: string; owner: PlayerId }
  | { type: 'damageDealt'; targetId: EntityId; amount: number; x: number; y: number }
  | { type: 'attackFired'; sourceId: EntityId; x: number; y: number }
  | { type: 'manaChanged'; playerId: PlayerId; mana: number }
  | { type: 'manaDeposited'; playerId: PlayerId; amount: number; x: number; y: number }
  | { type: 'underAttack'; playerId: PlayerId; x: number; y: number }
  | { type: 'spellCast'; playerId: PlayerId; spellId: string; x: number; y: number }
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
}

export interface MatchPlayerConfig {
  id: PlayerId;
  controller: 'human' | 'ai';
  team: TeamId;
  color: string;
  startIndex: number;
  aiDifficulty?: 'easy' | 'normal' | 'hard';
}

export interface MatchConfig {
  mapId: string;
  seed: number;
  players: MatchPlayerConfig[];
}
