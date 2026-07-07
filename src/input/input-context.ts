// Shared dependencies passed to input mode handlers.
import type { Vec2 } from '../core/coords';
import type { Camera } from '../render/camera';
import type { Registry } from '../data/registry';
import type { NavGrid } from '../sim/nav-grid';
import type { Command, EntityId, GameState } from '../sim/types';
import type { SessionState } from './session';

export interface InputContext {
  session: SessionState;
  playerId: string;
  getState: () => GameState;
  registry: Registry;
  nav: NavGrid;
  camera: Camera;
  toWorld: (p: Vec2) => Vec2;
  emit: (cmd: Command) => void;
  onOrderFeedback: (kind: string, world: Vec2) => void;
  canPlace: (tx: number, ty: number, footprint: number, spacing?: number) => boolean;
  canBuildNear: (tx: number, ty: number, footprint: number) => boolean;
  onNode: (tx: number, ty: number, footprint: number) => boolean;
  setSelection: (ids: EntityId[]) => void;
  setMode: (mode: SessionState['mode']) => void;
  ownCombatSelected: () => EntityId[];
  ownWispsSelected: () => EntityId[];
  allOwnWisps: () => EntityId[];
  selectionEntities: () => import('../sim/types').Entity[];
  issueHarvest: (node: import('../sim/types').Entity, wispIds: EntityId[]) => void;
}

export interface ModeTapHandler {
  onTap(ctx: InputContext, screen: Vec2, world: Vec2): void;
}
