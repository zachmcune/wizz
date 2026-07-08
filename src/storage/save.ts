// Save/load: serialize GameState to JSON (IndexedDB via idb-keyval) and restore a full sim.
// Because the sim is pure data + deterministic, a snapshot restore reproduces exactly.
import { get, set, del } from 'idb-keyval';
import type { GameState, Entity, Player } from '../sim/types';
import type { Registry } from '../data/registry';
import type { ProjectionMode } from '../core/projection';
import { NavGrid } from '../sim/nav-grid';
import { createServices, type SimServices, type StepContext } from '../sim/context';
import { recomputePower } from '../sim/factory';
import { visibilitySystem } from '../sim/systems/visibility';
import { createFogTiles } from '../sim/fog';
import { placeBuildingNav } from '../sim/building-nav';

const SAVE_VERSION = 4;
const SAVE_KEY = 'arcane:save';

export interface SaveMeta {
  projectionMode: ProjectionMode;
  paused: boolean;
  localPlayerId: string;
  /** Solo skirmish saves only — online matches use arcane:online-session. */
  isOnline: false;
}

export interface SavedGame {
  version: number;
  state: Omit<GameState, 'entities'> & { entities: Entity[] };
  meta?: SaveMeta;
}

export interface LoadedGame {
  state: GameState;
  services: SimServices;
  meta: SaveMeta;
}

function ensureFogFields(state: GameState, registry: Registry): void {
  const map = registry.map(state.mapId);
  const tileCount = map.tileW * map.tileH;
  for (const p of state.players) {
    const legacy = p as Player & { explored?: number[]; visible?: number[] };
    if (!legacy.explored || legacy.explored.length !== tileCount) legacy.explored = createFogTiles(tileCount);
    if (!legacy.visible || legacy.visible.length !== tileCount) legacy.visible = createFogTiles(tileCount);
    if (!legacy.knownBuildings) legacy.knownBuildings = {};
  }
}

export function defaultSaveMeta(localPlayerId: string, projectionMode: ProjectionMode = 'ortho'): SaveMeta {
  return { projectionMode, paused: false, localPlayerId, isOnline: false };
}

function resolveMeta(saved: SavedGame, state: GameState): SaveMeta {
  if (saved.meta && saved.meta.isOnline === false) return saved.meta;
  const human = state.players.find((p) => p.controller === 'human');
  return defaultSaveMeta(human?.id ?? state.players[0]!.id, 'ortho');
}

export function serializeState(state: GameState, meta: SaveMeta): SavedGame {
  return {
    version: SAVE_VERSION,
    state: { ...state, entities: [...state.entities.values()] },
    meta,
  };
}

export function deserializeState(saved: SavedGame, registry: Registry): LoadedGame {
  if (saved.version !== SAVE_VERSION && saved.version !== 1 && saved.version !== 2) {
    throw new Error(`Unsupported save version ${saved.version}`);
  }
  const entities = new Map<number, Entity>();
  for (const e of saved.state.entities) entities.set(e.id, e);
  const state: GameState = { ...saved.state, entities };
  if (!state.beams) state.beams = [];
  if (state.oneSuperweaponPerPlayer === undefined) state.oneSuperweaponPerPlayer = true;

  const map = registry.map(state.mapId);
  const nav = new NavGrid(map);
  for (const e of entities.values()) {
    if (e.kind === 'building' && e.state !== 'dead') {
      const b = registry.buildings.get(e.defId);
      if (b) placeBuildingNav(nav, b, e.pos.x, e.pos.y, e.owner);
    }
  }
  const services = createServices(registry, nav);
  ensureFogFields(state, registry);
  recomputePower(state, services);
  const visCtx: StepContext = { services, events: [] };
  visibilitySystem(state, visCtx);
  return { state, services, meta: resolveMeta(saved, state) };
}

export async function saveGame(state: GameState, meta: SaveMeta): Promise<void> {
  await set(SAVE_KEY, serializeState(state, meta));
}

export async function loadGame(registry: Registry): Promise<LoadedGame | null> {
  const saved = (await get(SAVE_KEY)) as SavedGame | undefined;
  if (!saved) return null;
  return deserializeState(saved, registry);
}

/** True when a solo in-progress save exists (not ended, not an online session). */
export async function hasContinuableSave(): Promise<boolean> {
  const saved = (await get(SAVE_KEY)) as SavedGame | undefined;
  if (!saved) return false;
  if (saved.meta?.isOnline) return false;
  if (saved.state.ended) return false;
  return true;
}

export async function hasSave(): Promise<boolean> {
  return hasContinuableSave();
}

export async function clearSave(): Promise<void> {
  await del(SAVE_KEY);
}
