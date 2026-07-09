// Spawns entities from data definitions and initializes a match. Deterministic.
import { TILE, secondsToTicks } from '../core/constants';
import type { UnitDef, BuildingDef } from '../data/defs';
import type { Registry } from '../data/registry';
import { registryForPacing } from '../data/economy-pacing';
import { NavGrid } from './nav-grid';
import { createServices, type SimServices, type StepContext } from './context';
import { placeBuildingNav, clearBuildingNav } from './building-nav';
import { visibilitySystem } from './systems/visibility';
import type {
  BuildingEntity,
  Entity,
  ProjectileEntity,
  ResourceNodeEntity,
  UnitEntity,
} from './entity-types';
import { makeProjectileCapability, makeHarvesterCapability, ensureProduction } from './capabilities';
import type { GameState, PlayerId, Player, MatchConfig, Relation } from './types';
import { defaultSandboxSettings } from './sandbox-types';

export function makeUnit(id: number, owner: PlayerId, def: UnitDef, x: number, y: number): UnitEntity {
  const e: UnitEntity = {
    id,
    owner,
    defId: def.id,
    kind: 'unit',
    pos: { x, y },
    vel: { x: 0, y: 0 },
    facing: 0,
    hp: def.hp,
    maxHp: def.hp,
    radius: def.radius,
    orders: [],
    state: 'idle',
    stance: 'aggressive',
    cooldowns: {},
    buffs: [],
  };
  if (def.isHarvester) {
    e.caps = { harvester: makeHarvesterCapability(def.carry ?? 100) };
  }
  return e;
}

export function makeBuilding(id: number, owner: PlayerId, def: BuildingDef, x: number, y: number): BuildingEntity {
  const e: BuildingEntity = {
    id,
    owner,
    defId: def.id,
    kind: 'building',
    pos: { x, y },
    vel: { x: 0, y: 0 },
    facing: 0,
    hp: def.hp,
    maxHp: def.hp,
    radius: (def.footprint * TILE) / 2,
    orders: [],
    state: 'idle',
    stance: 'aggressive',
    cooldowns: {},
    buffs: [],
  };
  if (def.producesUnits && def.producesUnits.length) {
    ensureProduction(e).productionQueue = [];
  }
  return e;
}

export function makeProjectile(
  id: number,
  owner: PlayerId,
  defId: string,
  x: number,
  y: number,
  facing: number,
  payload: ReturnType<typeof makeProjectileCapability>,
): ProjectileEntity {
  return {
    id,
    owner,
    defId,
    kind: 'projectile',
    pos: { x, y },
    vel: { x: 0, y: 0 },
    facing,
    hp: 1,
    maxHp: 1,
    radius: 3,
    caps: { projectile: payload },
  };
}

/** @deprecated Prefer makeUnit / makeBuilding for typed spawning. */
export function makeEntity(id: number, owner: PlayerId, def: UnitDef | BuildingDef, x: number, y: number): Entity {
  return def.kind === 'building' ? makeBuilding(id, owner, def, x, y) : makeUnit(id, owner, def, x, y);
}

/** Spawn a completed entity into the world (buildings block the nav grid). */
export function spawnEntity(
  state: GameState,
  services: SimServices,
  ctx: StepContext | null,
  defId: string,
  owner: PlayerId,
  x: number,
  y: number,
): Entity {
  const def = services.registry.entityDef(defId);
  const id = state.nextEntityId++;
  const e = makeEntity(id, owner, def, x, y);
  state.entities.set(id, e);
  if (e.kind === 'building') {
    const b = def as BuildingDef;
    placeBuildingNav(services.nav, b, x, y, owner);
    services.flow.invalidate();
  }
  ctx?.events.push({ type: 'entitySpawned', id, defId, owner });
  return e;
}

/** Marks a completed building's def id as unlocked tech for its owner (idempotent). */
export function unlockTech(state: GameState, owner: PlayerId, defId: string): void {
  const player = state.players.find((p) => p.id === owner);
  if (player && !player.unlockedTech.includes(defId)) player.unlockedTech.push(defId);
}

function makePlayer(cfg: MatchConfig['players'][number], startingMana: number, tileCount: number): Player {
  return {
    id: cfg.id,
    controller: cfg.controller,
    aiDifficulty: cfg.aiDifficulty,
    team: cfg.team,
    color: cfg.color,
    factionId: cfg.factionId,
    aiStrategyId: cfg.aiStrategyId,
    mana: startingMana,
    power: 0,
    powerUsed: 0,
    unlockedTech: [],
    completedResearch: [],
    spellCooldowns: {},
    defeated: false,
    explored: new Array(tileCount).fill(0),
    visible: new Array(tileCount).fill(0),
    knownBuildings: {},
  };
}

export interface InitializedMatch {
  state: GameState;
  services: SimServices;
}

export function initMatch(registry: Registry, config: MatchConfig): InitializedMatch {
  const map = registry.map(config.mapId);
  const nav = new NavGrid(map);
  const pacedRegistry = registryForPacing(registry, config.economyPacing ?? 'standard');
  const services = createServices(pacedRegistry, nav);

  const players = config.players.map((c) => makePlayer(c, pacedRegistry.balance.startingMana, map.tileW * map.tileH));
  const relations: Record<PlayerId, Record<PlayerId, Relation>> = {};
  for (const a of players) {
    const row: Record<PlayerId, Relation> = {};
    for (const b of players) {
      row[b.id] = a.id === b.id ? 'ally' : a.team === b.team ? 'ally' : 'enemy';
    }
    relations[a.id] = row;
  }

  const state: GameState = {
    tick: 0,
    rngState: config.seed >>> 0,
    players,
    relations,
    entities: new Map(),
    nextEntityId: 1,
    mapId: config.mapId,
    winnerTeam: null,
    ended: false,
    beams: [],
    oneSuperweaponPerPlayer: config.oneSuperweaponPerPlayer ?? true,
  };

  if (config.mode === 'sandbox') {
    state.sandbox = { enabled: true, settings: defaultSandboxSettings(config.sandboxDefaults) };
  }

  const nodeCap = pacedRegistry.balance.manaNodeCapacity;
  for (const node of map.manaNodes) {
    const id = state.nextEntityId++;
    const amount = Math.min(node.amount, nodeCap);
    const e: ResourceNodeEntity = {
      id,
      owner: 'neutral',
      defId: 'mana_node',
      kind: 'resource_node',
      pos: { x: node.x, y: node.y },
      vel: { x: 0, y: 0 },
      facing: 0,
      hp: 1,
      maxHp: 1,
      radius: TILE * 0.9,
      amount,
      amountMax: amount,
    };
    state.entities.set(id, e);
  }

  for (const cfg of config.players) {
    const start = map.startLocations[cfg.startIndex] ?? map.startLocations[0]!;
    spawnEntity(state, services, null, 'sanctum', cfg.id, start.x, start.y);
    unlockTech(state, cfg.id, 'sanctum');
    spawnEntity(state, services, null, 'wisp', cfg.id, start.x - TILE * 2, start.y + TILE * 2);
    spawnEntity(state, services, null, 'wisp', cfg.id, start.x + TILE * 2, start.y + TILE * 2);
  }

  recomputePower(state, services);
  const visCtx: StepContext = { services, events: [] };
  visibilitySystem(state, visCtx);
  void secondsToTicks;
  return { state, services };
}

/** Remove all of a defeated player's units and buildings (not resource nodes). */
export function purgePlayer(state: GameState, services: SimServices, playerId: PlayerId): void {
  const toRemove: number[] = [];
  let buildingsRemoved = false;
  for (const [id, e] of state.entities) {
    if (e.owner !== playerId) continue;
    if (e.kind === 'resource_node') continue;
    if (e.kind === 'building') {
      const b = services.registry.buildings.get(e.defId);
      if (b) {
        clearBuildingNav(services.nav, b, e.pos.x, e.pos.y);
        buildingsRemoved = true;
      }
    }
    toRemove.push(id);
  }
  for (const id of toRemove.sort((a, b) => a - b)) state.entities.delete(id);
  state.beams = state.beams.filter((b) => b.owner !== playerId);
  if (buildingsRemoved) {
    services.flow.invalidate();
    recomputePower(state, services);
  }
}

export function recomputePower(state: GameState, services: SimServices): void {
  for (const p of state.players) {
    p.power = 0;
    p.powerUsed = 0;
  }
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.state === 'dead' || e.buildProgress !== undefined) continue;
    const b = services.registry.buildings.get(e.defId);
    if (!b) continue;
    const p = state.players.find((pl) => pl.id === e.owner);
    if (!p) continue;
    p.power += b.powerProduced ?? 0;
    p.powerUsed += b.powerUsed ?? 0;
  }
}
