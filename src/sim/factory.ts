// Spawns entities from data definitions and initializes a match. Deterministic.
import { TILE, secondsToTicks } from '../core/constants';
import type { UnitDef, BuildingDef } from '../data/defs';
import type { Registry } from '../data/registry';
import { NavGrid } from './nav-grid';
import { createServices, type SimServices, type StepContext } from './context';
import type { GameState, Entity, PlayerId, Player, MatchConfig, Relation } from './types';

export function makeEntity(id: number, owner: PlayerId, def: UnitDef | BuildingDef, x: number, y: number): Entity {
  const isBuilding = def.kind === 'building';
  const e: Entity = {
    id,
    owner,
    defId: def.id,
    kind: isBuilding ? 'building' : 'unit',
    pos: { x, y },
    vel: { x: 0, y: 0 },
    facing: 0,
    hp: def.hp,
    maxHp: def.hp,
    radius: isBuilding ? ((def as BuildingDef).footprint * TILE) / 2 : (def as UnitDef).radius,
    orders: [],
    state: 'idle',
    stance: 'aggressive',
    cooldowns: {},
    buffs: [],
  };
  if (!isBuilding) {
    const u = def as UnitDef;
    if (u.isHarvester) {
      e.carry = 0;
      e.carryMax = u.carry ?? 100;
    }
  } else {
    const b = def as BuildingDef;
    if (b.producesUnits && b.producesUnits.length) e.productionQueue = [];
  }
  return e;
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
    const tx = Math.floor((x - (b.footprint * TILE) / 2) / TILE);
    const ty = Math.floor((y - (b.footprint * TILE) / 2) / TILE);
    services.nav.setBuildingBlock(tx, ty, b.footprint, true);
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

function makePlayer(cfg: MatchConfig['players'][number], startingMana: number): Player {
  return {
    id: cfg.id,
    controller: cfg.controller,
    aiDifficulty: cfg.aiDifficulty,
    team: cfg.team,
    color: cfg.color,
    mana: startingMana,
    power: 0,
    powerUsed: 0,
    unlockedTech: [],
    spellCooldowns: {},
    defeated: false,
  };
}

export interface InitializedMatch {
  state: GameState;
  services: SimServices;
}

export function initMatch(registry: Registry, config: MatchConfig): InitializedMatch {
  const map = registry.map(config.mapId);
  const nav = new NavGrid(map);
  const services = createServices(registry, nav);

  const players = config.players.map((c) => makePlayer(c, registry.balance.startingMana));
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
  };

  // Mana nodes (neutral resource entities).
  const nodeCap = registry.balance.manaNodeCapacity;
  for (const node of map.manaNodes) {
    const id = state.nextEntityId++;
    const amount = Math.min(node.amount, nodeCap);
    const e: Entity = {
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
      orders: [],
      state: 'idle',
      stance: 'hold',
      cooldowns: {},
      buffs: [],
      amount,
      amountMax: amount,
    };
    state.entities.set(id, e);
  }

  // Starting base per player: Sanctum + 2 Wisps at their start location.
  for (const cfg of config.players) {
    const start = map.startLocations[cfg.startIndex] ?? map.startLocations[0]!;
    spawnEntity(state, services, null, 'sanctum', cfg.id, start.x, start.y);
    unlockTech(state, cfg.id, 'sanctum'); // starting building is complete -> tech available
    spawnEntity(state, services, null, 'wisp', cfg.id, start.x - TILE * 2, start.y + TILE * 2);
    spawnEntity(state, services, null, 'wisp', cfg.id, start.x + TILE * 2, start.y + TILE * 2);
  }

  // recompute power for each player from initial buildings
  recomputePower(state, services);
  void secondsToTicks; // referenced by systems; keep import path stable
  return { state, services };
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
