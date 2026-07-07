// Save/load: serialize GameState to JSON (IndexedDB via idb-keyval) and restore a full sim.
// Because the sim is pure data + deterministic, a snapshot restore reproduces exactly.
import { get, set, del } from 'idb-keyval';
import type { GameState, Entity, Player } from '../sim/types';
import type { Registry } from '../data/registry';
import { NavGrid } from '../sim/nav-grid';
import { createServices, type SimServices, type StepContext } from '../sim/context';
import { recomputePower } from '../sim/factory';
import { visibilitySystem } from '../sim/systems/visibility';
import { createFogTiles, syncRadarFromTech } from '../sim/fog';
import { TILE } from '../core/constants';

const SAVE_VERSION = 2;
const SAVE_KEY = 'arcane:save';

export interface SavedGame {
  version: number;
  state: Omit<GameState, 'entities'> & { entities: Entity[] };
}

function ensureFogFields(state: GameState, registry: Registry): void {
  const map = registry.map(state.mapId);
  const tileCount = map.tileW * map.tileH;
  for (const p of state.players) {
    const legacy = p as Player & { explored?: number[]; visible?: number[]; hasRadar?: boolean };
    if (!legacy.explored || legacy.explored.length !== tileCount) legacy.explored = createFogTiles(tileCount);
    if (!legacy.visible || legacy.visible.length !== tileCount) legacy.visible = createFogTiles(tileCount);
    if (legacy.hasRadar === undefined) legacy.hasRadar = false;
  }
  syncRadarFromTech(state, registry);
}

export function serializeState(state: GameState): SavedGame {
  return {
    version: SAVE_VERSION,
    state: { ...state, entities: [...state.entities.values()] },
  };
}

export function deserializeState(saved: SavedGame, registry: Registry): { state: GameState; services: SimServices } {
  if (saved.version !== SAVE_VERSION && saved.version !== 1) {
    throw new Error(`Unsupported save version ${saved.version}`);
  }
  const entities = new Map<number, Entity>();
  for (const e of saved.state.entities) entities.set(e.id, e);
  const state: GameState = { ...saved.state, entities };

  const map = registry.map(state.mapId);
  const nav = new NavGrid(map);
  for (const e of entities.values()) {
    if (e.kind === 'building' && e.state !== 'dead') {
      const b = registry.buildings.get(e.defId);
      if (b) {
        const tx = Math.floor((e.pos.x - (b.footprint * TILE) / 2) / TILE);
        const ty = Math.floor((e.pos.y - (b.footprint * TILE) / 2) / TILE);
        nav.setBuildingBlock(tx, ty, b.footprint, true);
      }
    }
  }
  const services = createServices(registry, nav);
  ensureFogFields(state, registry);
  recomputePower(state, services);
  const visCtx: StepContext = { services, events: [] };
  visibilitySystem(state, visCtx);
  return { state, services };
}

export async function saveGame(state: GameState): Promise<void> {
  await set(SAVE_KEY, serializeState(state));
}

export async function loadGame(registry: Registry): Promise<{ state: GameState; services: SimServices } | null> {
  const saved = (await get(SAVE_KEY)) as SavedGame | undefined;
  if (!saved) return null;
  return deserializeState(saved, registry);
}

export async function hasSave(): Promise<boolean> {
  return (await get(SAVE_KEY)) !== undefined;
}

export async function clearSave(): Promise<void> {
  await del(SAVE_KEY);
}
