// Message protocol between the main thread and the simulation Web Worker.
// Snapshots carry only the fields the renderer/UI need (positions, hp, etc.).
import type { Command, GameEvent, PlayerId, TeamId, EntityId } from '../types';

export interface EntitySnapshot {
  id: EntityId;
  defId: string;
  owner: PlayerId;
  kind: 'unit' | 'building' | 'resource_node' | 'projectile';
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  radius: number;
  state: string;
  carry?: number;
  buildProgress?: number;
  amount?: number;
  productionQueueLength?: number;
}

export interface PlayerSnapshot {
  id: PlayerId;
  team: TeamId;
  color: string;
  mana: number;
  power: number;
  powerUsed: number;
  unlockedTech: string[];
  spellCooldowns: Record<string, number>;
  defeated: boolean;
}

export interface StateSnapshot {
  tick: number;
  mapId: string;
  ended: boolean;
  winnerTeam: TeamId | null;
  players: PlayerSnapshot[];
  entities: EntitySnapshot[];
}

export type ToWorker =
  | { type: 'initMatch'; matchId: string }
  | { type: 'command'; cmds: Command[] }
  | { type: 'setAi'; enabled: boolean };

export type FromWorker =
  | { type: 'ready'; snapshot: StateSnapshot }
  | { type: 'tick'; snapshot: StateSnapshot; events: GameEvent[] };
