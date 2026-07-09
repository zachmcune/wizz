import { TILE } from '../../../core/constants';
import type { StepContext } from '../../context';
import type { GameState, DevCommand, PlayerId, EntityId, Player, Relation } from '../../types';
import { getPlayer, isAlive } from '../../queries';
import { spawnEntity, unlockTech, recomputePower } from '../../factory';
import { removeBuildingFromWorld } from './shared';
import { handleSpell } from './spell';
import { createFogTiles } from '../../fog';
import type { BuildingEntity } from '../../entity-types';
import { sandboxInstantBuild } from '../../sandbox-flags';
import { getResearchQueue, ensureProduction } from '../../capabilities';

type DevHandler = (state: GameState, ctx: StepContext, cmd: DevCommand) => void;

function completeBuilding(state: GameState, ctx: StepContext, building: BuildingEntity): void {
  building.buildProgress = undefined;
  building.hp = building.maxHp;
  unlockTech(state, building.owner, building.defId);
  ctx.events.push({ type: 'buildingComplete', id: building.id, defId: building.defId, owner: building.owner });
  recomputePower(state, ctx.services);
}

function handleSetMana(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devSetMana' }>): void {
  const player = getPlayer(state, cmd.playerId);
  if (!player) return;
  if (cmd.mode === 'set') player.mana = Math.max(0, cmd.amount);
  else if (cmd.mode === 'add') player.mana = Math.max(0, player.mana + cmd.amount);
  else player.mana = Math.max(0, player.mana - cmd.amount);
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

function handleSpawnUnit(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devSpawnUnit' }>): void {
  if (!ctx.services.registry.units.has(cmd.defId)) return;
  const count = Math.max(1, cmd.count ?? 1);
  const spawned: EntityId[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = cmd.x + col * (TILE * 1.5);
    const y = cmd.y + row * (TILE * 1.5);
    const e = spawnEntity(state, ctx.services, ctx, cmd.defId, cmd.playerId, x, y);
    spawned.push(e.id);
  }
  void spawned;
}

function handleSpawnBuilding(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devSpawnBuilding' }>): void {
  const def = ctx.services.registry.buildings.get(cmd.defId);
  if (!def) return;
  const e = spawnEntity(state, ctx.services, ctx, cmd.defId, cmd.playerId, cmd.x, cmd.y);
  if (e.kind !== 'building') return;
  if (cmd.complete || sandboxInstantBuild(state)) {
    completeBuilding(state, ctx, e);
  } else {
    e.buildProgress = 0;
    e.hp = Math.max(1, Math.floor(def.hp * 0.1));
    ctx.events.push({ type: 'buildingPlaced', id: e.id, defId: def.id, owner: cmd.playerId });
  }
}

function handleDestroyEntity(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devDestroyEntity' }>): void {
  for (const id of cmd.entityIds) {
    const e = state.entities.get(id);
    if (!e || e.kind === 'resource_node') continue;
    if (e.kind === 'building') {
      removeBuildingFromWorld(state, ctx, e);
      ctx.events.push({ type: 'entityDied', id: e.id, defId: e.defId, owner: e.owner, x: e.pos.x, y: e.pos.y });
    } else if (e.kind === 'projectile') {
      state.entities.delete(id);
      ctx.events.push({ type: 'entityDied', id: e.id, defId: e.defId, owner: e.owner, x: e.pos.x, y: e.pos.y });
    } else {
      e.state = 'dead';
      e.hp = 0;
      ctx.events.push({ type: 'entityDied', id: e.id, defId: e.defId, owner: e.owner, x: e.pos.x, y: e.pos.y });
    }
  }
}

function handleSetEntityHp(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devSetEntityHp' }>): void {
  const e = state.entities.get(cmd.entityId);
  if (!e || !isAlive(e) || e.kind === 'resource_node' || e.kind === 'projectile') return;
  if (cmd.hp === 'kill') {
    handleDestroyEntity(state, ctx, { type: 'devDestroyEntity', playerId: cmd.playerId, entityIds: [cmd.entityId] });
    return;
  }
  const next = cmd.hp === 'max' ? e.maxHp : Math.max(0, Math.min(e.maxHp, cmd.hp));
  const delta = next - e.hp;
  e.hp = next;
  if (delta > 0) ctx.events.push({ type: 'healApplied', targetId: e.id, amount: delta, x: e.pos.x, y: e.pos.y });
  else if (delta < 0) ctx.events.push({ type: 'damageDealt', targetId: e.id, amount: -delta, x: e.pos.x, y: e.pos.y });
  if (e.hp <= 0) handleDestroyEntity(state, ctx, { type: 'devDestroyEntity', playerId: cmd.playerId, entityIds: [cmd.entityId] });
}

function handleUnlockTech(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devUnlockTech' }>): void {
  const player = getPlayer(state, cmd.playerId);
  if (!player) return;
  if (cmd.defId === 'all') {
    for (const id of ctx.services.registry.buildings.keys()) unlockTech(state, cmd.playerId, id);
    return;
  }
  unlockTech(state, cmd.playerId, cmd.defId);
}

function handleClearUnits(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devClearUnits' }>): void {
  const target = cmd.targetPlayerId;
  const ids: EntityId[] = [];
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || !isAlive(e)) continue;
    if (target && e.owner !== target) continue;
    ids.push(e.id);
  }
  if (ids.length) handleDestroyEntity(state, ctx, { type: 'devDestroyEntity', playerId: cmd.playerId, entityIds: ids });
}

function handleCastSpell(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devCastSpell' }>): void {
  handleSpell(state, ctx, {
    type: 'castSpell',
    playerId: cmd.playerId,
    spellId: cmd.spellId,
    x: cmd.x,
    y: cmd.y,
    entityIds: cmd.entityIds,
  });
}

function handleCompleteResearch(state: GameState, _ctx: StepContext, cmd: Extract<DevCommand, { type: 'devCompleteResearch' }>): void {
  const player = getPlayer(state, cmd.playerId);
  if (!player) return;
  if (cmd.defId) {
    if (!player.completedResearch.includes(cmd.defId)) player.completedResearch.push(cmd.defId);
    return;
  }
  for (const e of state.entities.values()) {
    const queue = getResearchQueue(e);
    if (e.kind !== 'building' || e.owner !== cmd.playerId || !queue?.length) continue;
    for (const item of queue) {
      if (!player.completedResearch.includes(item.defId)) player.completedResearch.push(item.defId);
    }
    ensureProduction(e).researchQueue = [];
  }
}

function rebuildRelations(state: GameState): void {
  for (const a of state.players) {
    const row: Record<PlayerId, Relation> = {};
    for (const b of state.players) {
      row[b.id] = a.id === b.id ? 'ally' : a.team === b.team ? 'ally' : 'enemy';
    }
    state.relations[a.id] = row;
  }
}

function handleAddPlayer(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devAddPlayer' }>): void {
  if (state.players.some((p) => p.id === cmd.newPlayerId)) return;
  const map = ctx.services.registry.map(state.mapId);
  const tileCount = map.tileW * map.tileH;
  const player: Player = {
    id: cmd.newPlayerId,
    controller: cmd.controller,
    aiDifficulty: cmd.aiDifficulty,
    team: cmd.team,
    color: cmd.color,
    mana: ctx.services.registry.balance.startingMana,
    power: 0,
    powerUsed: 0,
    unlockedTech: [],
    completedResearch: [],
    spellCooldowns: {},
    defeated: false,
    explored: createFogTiles(tileCount),
    visible: createFogTiles(tileCount),
    knownBuildings: {},
  };
  state.players.push(player);
  rebuildRelations(state);
  const start = map.startLocations[cmd.startIndex] ?? map.startLocations[0]!;
  spawnEntity(state, ctx.services, ctx, 'sanctum', cmd.newPlayerId, start.x, start.y);
  unlockTech(state, cmd.newPlayerId, 'sanctum');
  spawnEntity(state, ctx.services, ctx, 'wisp', cmd.newPlayerId, start.x - TILE * 2, start.y + TILE * 2);
  spawnEntity(state, ctx.services, ctx, 'wisp', cmd.newPlayerId, start.x + TILE * 2, start.y + TILE * 2);
  recomputePower(state, ctx.services);
}

function handleRemovePlayer(state: GameState, ctx: StepContext, cmd: Extract<DevCommand, { type: 'devRemovePlayer' }>): void {
  if (cmd.targetPlayerId === cmd.playerId) return;
  const idx = state.players.findIndex((p) => p.id === cmd.targetPlayerId);
  if (idx < 0) return;
  const ids: EntityId[] = [];
  for (const e of state.entities.values()) {
    if (e.owner === cmd.targetPlayerId && e.kind !== 'resource_node') ids.push(e.id);
  }
  handleDestroyEntity(state, ctx, { type: 'devDestroyEntity', playerId: cmd.playerId, entityIds: ids });
  state.players.splice(idx, 1);
  delete state.relations[cmd.targetPlayerId];
  for (const row of Object.values(state.relations)) delete row[cmd.targetPlayerId];
  rebuildRelations(state);
}

function handleConfigurePlayer(state: GameState, _ctx: StepContext, cmd: Extract<DevCommand, { type: 'devConfigurePlayer' }>): void {
  const player = getPlayer(state, cmd.targetPlayerId);
  if (!player) return;
  if (cmd.team !== undefined) player.team = cmd.team;
  if (cmd.aiDifficulty !== undefined) player.aiDifficulty = cmd.aiDifficulty;
  if (cmd.controller !== undefined) player.controller = cmd.controller;
  rebuildRelations(state);
}

const DEV_HANDLERS: Record<DevCommand['type'], DevHandler> = {
  devSetMana: handleSetMana as DevHandler,
  devSpawnUnit: handleSpawnUnit as DevHandler,
  devSpawnBuilding: handleSpawnBuilding as DevHandler,
  devDestroyEntity: handleDestroyEntity as DevHandler,
  devSetEntityHp: handleSetEntityHp as DevHandler,
  devUnlockTech: handleUnlockTech as DevHandler,
  devClearUnits: handleClearUnits as DevHandler,
  devCastSpell: handleCastSpell as DevHandler,
  devCompleteResearch: handleCompleteResearch as DevHandler,
  devAddPlayer: handleAddPlayer as DevHandler,
  devRemovePlayer: handleRemovePlayer as DevHandler,
  devConfigurePlayer: handleConfigurePlayer as DevHandler,
};

export function applyDevCommand(state: GameState, ctx: StepContext, cmd: DevCommand): void {
  if (!state.sandbox?.enabled) return;
  DEV_HANDLERS[cmd.type](state, ctx, cmd);
}
