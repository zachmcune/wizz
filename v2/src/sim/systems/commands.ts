// Command handling: the ONLY path by which gameplay state changes.
//
// Every command is validated here — ownership, tech, mana, placement, timing — and either applied or
// rejected with a `commandRejected` event (never silently). That single funnel is what makes the sim
// auditable: if the state changed, one of these handlers did it.

import { TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { Command, GameState, EntityId, Stance } from '../types';
import {
  KIND_BUILDING,
  KIND_PROJECTILE,
  KIND_RESOURCE_NODE,
  KIND_UNIT,
  STATE_ATTACKING,
  STATE_CHANNELING,
  STATE_HARVESTING,
  STATE_IDLE,
  STATE_MOVING,
  STANCE_AGGRESSIVE,
  STANCE_HOLD,
  STANCE_STANDGROUND,
} from '../entity-store';
import {
  clearGarrisonedIn,
  ensureChanneler,
  ensureGarrisonHost,
  ensureMorph,
  ensureProduction,
  getGarrisonHost,
  garrisonedIds,
  getChanneler,
  getHarvester,
  getProductionQueue,
  getResearchQueue,
  hasMorph,
  isChanneling,
} from '../capabilities';
import { getPlayer } from '../queries';
import { canBuildNearBase, BUILD_ZONE_TILES } from '../build-zone';
import { footprintOverlapsNode } from '../resource-nodes';
import { buildingCanGarrison, garrisonFreeCapacity } from '../garrison';
import { secondsToTicks } from '../../core/constants';
import { resolveUnitStat } from '../modifiers';
import {
  applyBuildingNav,
  buildTicksFor,
  clearBuildingNav,
  findSpawnPosition,
  spawnBuildingAt,
  spawnUnitAt,
  unlockTech,
} from './production';
import { recomputePower } from '../power';
import { normalize } from '../../core/math';

// ------------------------------------------------------------------------------ helpers

function ownerOf(state: GameState, slot: number): string {
  return state.entities.ownerId(state.entities.ownerIndex[slot]!);
}

/** Slots of live units owned by `playerId` among `ids`, in ascending id order. */
function ownedUnitSlots(state: GameState, playerId: string, ids: EntityId[]): number[] {
  const out: number[] = [];
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  for (const id of unique) {
    const slot = state.entities.slotOf(id);
    if (slot < 0) continue;
    const store = state.entities;
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    if (ownerOf(state, slot) !== playerId) continue;
    out.push(slot);
  }
  return out;
}

function requirementsMet(state: GameState, playerId: string, requires: string[]): boolean {
  const player = getPlayer(state, playerId);
  if (!player) return false;
  return requires.every((r) => player.unlockedTech.includes(r) || player.completedResearch.includes(r));
}

function reject(ctx: StepContext, playerId: string, reason: string): void {
  ctx.events.push({ type: 'commandRejected', playerId, reason });
}

/** Clear a unit's garrison reservation on every host. */
function clearReservations(state: GameState, unitId: EntityId): void {
  const store = state.entities;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.kind[slot] !== KIND_BUILDING) continue;
    const host = getGarrisonHost(store.extras[slot]!);
    if (!host?.garrisonReservedIds.length) continue;
    host.garrisonReservedIds = host.garrisonReservedIds.filter((id) => id !== unitId);
  }
}

function endChanneling(state: GameState, slot: number): void {
  const ch = getChanneler(state.entities.extras[slot]!);
  if (!ch) return;
  ch.channeling = false;
  ch.channelTicks = 0;
  if (state.entities.state[slot] === STATE_CHANNELING) state.entities.state[slot] = STATE_IDLE;
}

/** Reset a unit to receive a new order: clears garrison/channel and any stale target. */
function prepareForOrder(state: GameState, slot: number): void {
  clearReservations(state, state.entities.id[slot]!);
  endChanneling(state, slot);
  state.entities.extras[slot]!.orders.length = 0;
}

function groupMoveSpeed(state: GameState, ctx: StepContext, slots: number[]): number {
  let slowest = Infinity;
  for (const slot of slots) {
    const store = state.entities;
    const ex = store.extras[slot]!;
    const udef = ctx.services.registry.units.get(ex.defId);
    const player = getPlayer(state, ownerOf(state, slot));
    if (!udef || !player) continue;
    const speed = resolveUnitStat(state, ctx.services.registry, player, udef, 'speed', slot);
    if (speed < slowest) slowest = speed;
  }
  return Number.isFinite(slowest) ? slowest : 0;
}

// --------------------------------------------------------------------------- unit orders

function handleMove(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'move' }>): void {
  const store = state.entities;
  for (const slot of ownedUnitSlots(state, cmd.playerId, cmd.entityIds)) {
    prepareForOrder(state, slot);
    store.extras[slot]!.orders = [{ type: 'move', x: cmd.x, y: cmd.y }];
    store.state[slot] = STATE_MOVING;
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'move', x: cmd.x, y: cmd.y });
}

function handleAttackMove(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'attackMove' }>): void {
  const store = state.entities;
  for (const slot of ownedUnitSlots(state, cmd.playerId, cmd.entityIds)) {
    prepareForOrder(state, slot);
    store.extras[slot]!.orders = [{ type: 'attackMove', x: cmd.x, y: cmd.y }];
    store.state[slot] = STATE_MOVING;
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'attackMove', x: cmd.x, y: cmd.y });
}

function handleMoveInOrder(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'moveInOrder' }>): void {
  const store = state.entities;
  const slots = ownedUnitSlots(state, cmd.playerId, cmd.entityIds);
  const groupSpeed = groupMoveSpeed(state, ctx, slots);
  for (const slot of slots) {
    prepareForOrder(state, slot);
    store.extras[slot]!.orders = [{ type: 'moveInOrder', x: cmd.x, y: cmd.y, groupSpeed }];
    store.state[slot] = STATE_MOVING;
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'moveInOrder', x: cmd.x, y: cmd.y });
}

function handleAttack(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'attack' }>): void {
  const store = state.entities;
  const targetSlot = store.slotOf(cmd.targetId);
  if (targetSlot < 0 || store.dead[targetSlot]) return;
  if (state.relations[cmd.playerId]?.[ownerOf(state, targetSlot)] !== 'enemy') return;
  for (const slot of ownedUnitSlots(state, cmd.playerId, cmd.entityIds)) {
    prepareForOrder(state, slot);
    store.extras[slot]!.orders = [{ type: 'attack', targetId: cmd.targetId }];
    store.state[slot] = STATE_ATTACKING;
  }
  ctx.events.push({
    type: 'orderIssued',
    playerId: cmd.playerId,
    kind: 'attack',
    x: store.posX[targetSlot]!,
    y: store.posY[targetSlot]!,
  });
}

function handleHarvest(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'harvest' }>): void {
  const store = state.entities;
  const nodeSlot = store.slotOf(cmd.nodeId);
  if (nodeSlot < 0 || store.dead[nodeSlot] || store.kind[nodeSlot] !== KIND_RESOURCE_NODE) return;
  for (const slot of ownedUnitSlots(state, cmd.playerId, cmd.entityIds)) {
    if (!getHarvester(store.extras[slot]!)) continue;
    prepareForOrder(state, slot);
    store.extras[slot]!.orders = [{ type: 'harvest', nodeId: cmd.nodeId }];
    store.state[slot] = STATE_HARVESTING;
  }
  ctx.events.push({
    type: 'orderIssued',
    playerId: cmd.playerId,
    kind: 'harvest',
    x: store.posX[nodeSlot]!,
    y: store.posY[nodeSlot]!,
  });
}

function handleStop(state: GameState, _ctx: StepContext, cmd: Extract<Command, { type: 'stop' }>): void {
  const store = state.entities;
  for (const slot of ownedUnitSlots(state, cmd.playerId, cmd.entityIds)) {
    if (hasMorph(store.extras[slot]!)) continue;
    prepareForOrder(state, slot);
    store.velX[slot] = 0;
    store.velY[slot] = 0;
    store.state[slot] = STATE_IDLE;
  }
}

function handleSetStance(state: GameState, _ctx: StepContext, cmd: Extract<Command, { type: 'setStance' }>): void {
  const code: number =
    cmd.stance === 'hold' ? STANCE_HOLD : cmd.stance === 'standground' ? STANCE_STANDGROUND : STANCE_AGGRESSIVE;
  const store = state.entities;
  for (const slot of ownedUnitSlots(state, cmd.playerId, cmd.entityIds)) store.stance[slot] = code;
  void (null as Stance | null);
}

// ------------------------------------------------------------------------------ buildings

function handleBuild(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'build' }>): void {
  const player = getPlayer(state, cmd.playerId);
  if (!player) return;
  const def = ctx.services.registry.buildings.get(cmd.defId);
  if (!def) return;
  if (!requirementsMet(state, cmd.playerId, def.requires)) return reject(ctx, cmd.playerId, 'requires');
  if (def.factions && player.factionId && !def.factions.includes(player.factionId)) {
    return reject(ctx, cmd.playerId, 'faction');
  }
  // One superweapon per player (v1 rule, kept).
  if (def.isSuperweapon && state.oneSuperweaponPerPlayer) {
    const store = state.entities;
    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
      if (ownerOf(state, slot) !== cmd.playerId) continue;
      if (store.extras[slot]!.defId !== def.id) continue;
      return reject(ctx, cmd.playerId, 'limit');
    }
  }
  if (player.mana < def.cost) return reject(ctx, cmd.playerId, 'mana');

  const tx = Math.floor((cmd.x - (def.footprint * TILE) / 2) / TILE);
  const ty = Math.floor((cmd.y - (def.footprint * TILE) / 2) / TILE);
  if (!ctx.services.nav.canPlace(tx, ty, def.footprint)) return reject(ctx, cmd.playerId, 'blocked');
  if (footprintOverlapsNode(state, tx, ty, def.footprint)) return reject(ctx, cmd.playerId, 'blocked');
  if (!canBuildNearBase(state, ctx.services, cmd.playerId, tx, ty, def.footprint, BUILD_ZONE_TILES)) {
    return reject(ctx, cmd.playerId, 'range');
  }

  player.mana -= def.cost;
  const cx = (tx + def.footprint / 2) * TILE;
  const cy = (ty + def.footprint / 2) * TILE;
  const slot = spawnBuildingAt(state, ctx.services, def.id, cmd.playerId, cx, cy, {}, ctx);
  if (slot < 0) return;
  applyBuildingNav(state, ctx.services, slot);
  ctx.events.push({ type: 'buildingPlaced', id: state.entities.id[slot]!, defId: def.id, owner: cmd.playerId });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

function handleDeploy(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'deploy' }>): void {
  const store = state.entities;
  const slot = store.slotOf(cmd.entityId);
  if (slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_UNIT) return;
  if (ownerOf(state, slot) !== cmd.playerId) return;
  const ex = store.extras[slot]!;
  if (hasMorph(ex) || ex.orders.length > 0 || store.state[slot] !== STATE_IDLE) {
    return reject(ctx, cmd.playerId, 'busy');
  }
  const udef = ctx.services.registry.units.get(ex.defId);
  if (!udef?.deploysAs) return;
  const bdef = ctx.services.registry.buildings.get(udef.deploysAs);
  if (!bdef) return;

  const tx = Math.floor((cmd.x - (bdef.footprint * TILE) / 2) / TILE);
  const ty = Math.floor((cmd.y - (bdef.footprint * TILE) / 2) / TILE);
  if (!ctx.services.nav.canPlace(tx, ty, bdef.footprint)) return reject(ctx, cmd.playerId, 'blocked');
  if (footprintOverlapsNode(state, tx, ty, bdef.footprint)) return reject(ctx, cmd.playerId, 'blocked');

  const morph = ensureMorph(ex, 'deploy');
  morph.progress = 0;
  morph.targetX = (tx + bdef.footprint / 2) * TILE;
  morph.targetY = (ty + bdef.footprint / 2) * TILE;
  store.state[slot] = 7; // building
  ex.orders.length = 0;
  store.velX[slot] = 0;
  store.velY[slot] = 0;
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'deploy', x: morph.targetX, y: morph.targetY });
}

function handlePack(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'pack' }>): void {
  const store = state.entities;
  const slot = store.slotOf(cmd.buildingId);
  if (slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_BUILDING) return;
  if (ownerOf(state, slot) !== cmd.playerId) return;
  const ex = store.extras[slot]!;
  const bcap = ex.caps.building as { buildProgress?: number } | undefined;
  if (bcap?.buildProgress !== undefined || hasMorph(ex)) return reject(ctx, cmd.playerId, 'busy');
  const bdef = ctx.services.registry.buildings.get(ex.defId);
  if (!bdef?.packsInto) return;
  const queue = getProductionQueue(ex);
  if (queue && queue.length > 0) return reject(ctx, cmd.playerId, 'busy');
  const morph = ensureMorph(ex, 'pack');
  morph.progress = 0;
  ctx.events.push({
    type: 'orderIssued',
    playerId: cmd.playerId,
    kind: 'pack',
    x: store.posX[slot]!,
    y: store.posY[slot]!,
  });
}

function handleSetRally(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'setRally' }>): void {
  const store = state.entities;
  const slot = store.slotOf(cmd.buildingId);
  if (slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_BUILDING) return;
  if (ownerOf(state, slot) !== cmd.playerId) return;
  const ex = store.extras[slot]!;
  const bcap = ex.caps.building as { buildProgress?: number } | undefined;
  if (bcap?.buildProgress !== undefined || hasMorph(ex)) return;
  const bdef = ctx.services.registry.buildings.get(ex.defId);
  if (!bdef?.producesUnits?.length) return;
  ensureProduction(ex).rally = { x: cmd.x, y: cmd.y };
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'rally', x: cmd.x, y: cmd.y });
}

function removeBuilding(state: GameState, ctx: StepContext, slot: number): void {
  clearBuildingNav(state, ctx.services, slot);
  state.entities.kill(slot);
  recomputePower(state, ctx.services.registry);
}

function handleSellBuilding(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'sellBuilding' }>): void {
  const store = state.entities;
  const player = getPlayer(state, cmd.playerId);
  const slot = store.slotOf(cmd.buildingId);
  if (!player || slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_BUILDING) return;
  if (ownerOf(state, slot) !== cmd.playerId) return;
  const ex = store.extras[slot]!;
  const bdef = ctx.services.registry.buildings.get(ex.defId);
  if (!bdef || bdef.isConstructionYard) return reject(ctx, cmd.playerId, 'cannot_sell');
  const bcap = ex.caps.building as { buildProgress?: number } | undefined;
  if (bcap?.buildProgress !== undefined || hasMorph(ex)) return reject(ctx, cmd.playerId, 'busy');
  const queue = getProductionQueue(ex);
  if (queue && queue.length > 0) return reject(ctx, cmd.playerId, 'busy');
  const host = getGarrisonHost(ex);
  if (host && (host.garrisonedIds.length > 0 || host.garrisonReservedIds.length > 0)) {
    return reject(ctx, cmd.playerId, 'busy');
  }
  const refund = Math.floor(bdef.cost * ctx.services.registry.balance.sellRefundRatio);
  const id = store.id[slot]!;
  const defId = ex.defId;
  removeBuilding(state, ctx, slot);
  player.mana += refund;
  ctx.events.push({ type: 'buildingSold', id, defId, owner: cmd.playerId, refund });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

function handleSetRepair(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'setRepair' }>): void {
  const store = state.entities;
  const slot = store.slotOf(cmd.buildingId);
  if (slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_BUILDING) return;
  if (ownerOf(state, slot) !== cmd.playerId) return;
  const ex = store.extras[slot]!;
  const bcap = (ex.caps.building ?? {}) as { buildProgress?: number; repairing?: boolean };
  if (bcap.buildProgress !== undefined || hasMorph(ex)) return reject(ctx, cmd.playerId, 'busy');
  if (!cmd.enabled) {
    bcap.repairing = false;
    ex.caps.building = bcap;
    return;
  }
  if (store.hp[slot]! >= store.maxHp[slot]!) return;
  bcap.repairing = true;
  ex.caps.building = bcap;
}

// ----------------------------------------------------------------------------- production

function handleProduce(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'produce' }>): void {
  const store = state.entities;
  const player = getPlayer(state, cmd.playerId);
  const slot = store.slotOf(cmd.buildingId);
  if (!player || slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_BUILDING) return;
  if (ownerOf(state, slot) !== cmd.playerId) return;
  const ex = store.extras[slot]!;
  const bcap = ex.caps.building as { buildProgress?: number } | undefined;
  if (bcap?.buildProgress !== undefined || hasMorph(ex)) return;
  const bdef = ctx.services.registry.buildings.get(ex.defId);
  const udef = ctx.services.registry.units.get(cmd.defId);
  if (!bdef || !udef || !bdef.producesUnits?.includes(cmd.defId)) return;
  if (udef.factions && player.factionId && !udef.factions.includes(player.factionId)) {
    return reject(ctx, cmd.playerId, 'faction');
  }
  if (!requirementsMet(state, cmd.playerId, udef.requires)) return reject(ctx, cmd.playerId, 'requires');
  if (player.mana < udef.cost) return reject(ctx, cmd.playerId, 'mana');

  player.mana -= udef.cost;
  const production = ensureProduction(ex);
  production.productionQueue ??= [];
  production.productionQueue.push({ defId: cmd.defId, progress: 0, required: buildTicksFor(udef.buildTime) });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

function handleCancelProduce(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'cancelProduce' }>): void {
  const store = state.entities;
  const player = getPlayer(state, cmd.playerId);
  const slot = store.slotOf(cmd.buildingId);
  if (!player || slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_BUILDING) return;
  if (ownerOf(state, slot) !== cmd.playerId) return;
  const queue = getProductionQueue(store.extras[slot]!);
  if (!queue) return;
  const item = queue[cmd.index];
  if (!item) return;
  const udef = ctx.services.registry.units.get(item.defId);
  if (udef) {
    player.mana += udef.cost;
    ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
  }
  queue.splice(cmd.index, 1);
}

function handleResearch(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'research' }>): void {
  const store = state.entities;
  const player = getPlayer(state, cmd.playerId);
  const slot = store.slotOf(cmd.buildingId);
  if (!player || slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_BUILDING) return;
  if (ownerOf(state, slot) !== cmd.playerId) return;
  const ex = store.extras[slot]!;
  const bcap = ex.caps.building as { buildProgress?: number } | undefined;
  if (bcap?.buildProgress !== undefined || hasMorph(ex)) return reject(ctx, cmd.playerId, 'busy');
  const research = ctx.services.registry.research.get(cmd.defId);
  if (!research || research.researchedAt !== ex.defId) return;
  if (!requirementsMet(state, cmd.playerId, research.requires)) return reject(ctx, cmd.playerId, 'requires');
  if (research.factions && player.factionId && !research.factions.includes(player.factionId)) {
    return reject(ctx, cmd.playerId, 'faction');
  }
  if (player.completedResearch.includes(research.id)) return reject(ctx, cmd.playerId, 'duplicate');
  const queue = getResearchQueue(ex);
  if (queue?.some((item) => item.defId === research.id)) return reject(ctx, cmd.playerId, 'duplicate');
  if (player.mana < research.cost) return reject(ctx, cmd.playerId, 'mana');

  player.mana -= research.cost;
  const production = ensureProduction(ex);
  production.researchQueue ??= [];
  production.researchQueue.push({
    defId: research.id,
    progress: 0,
    required: secondsToTicks(research.researchTime),
  });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

function handleCancelResearch(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'cancelResearch' }>): void {
  const store = state.entities;
  const player = getPlayer(state, cmd.playerId);
  const slot = store.slotOf(cmd.buildingId);
  if (!player || slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_BUILDING) return;
  if (ownerOf(state, slot) !== cmd.playerId) return;
  const queue = getResearchQueue(store.extras[slot]!);
  if (!queue || cmd.index < 0 || cmd.index >= queue.length) return;
  const [item] = queue.splice(cmd.index, 1);
  if (!item) return;
  const research = ctx.services.registry.research.get(item.defId);
  if (research) {
    player.mana += research.cost;
    ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
  }
}

// ------------------------------------------------------------------------------ garrison

function handleGarrison(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'garrison' }>): void {
  const store = state.entities;
  const hostSlot = store.slotOf(cmd.buildingId);
  if (hostSlot < 0 || store.dead[hostSlot] || store.kind[hostSlot] !== KIND_BUILDING) return;
  if (ownerOf(state, hostSlot) !== cmd.playerId) return;
  const hostEx = store.extras[hostSlot]!;
  const bdef = ctx.services.registry.buildings.get(hostEx.defId);
  if (!bdef?.garrison) return;

  let free = garrisonFreeCapacity(ctx.services.registry, state, hostSlot);
  if (free <= 0) return reject(ctx, cmd.playerId, 'capacity');

  const host = ensureGarrisonHost(hostEx);
  const accepted = [...cmd.unitIds].sort((a, b) => a - b);
  for (const id of accepted) {
    if (free <= 0) break;
    const unitSlot = store.slotOf(id);
    if (unitSlot < 0 || store.dead[unitSlot] || store.kind[unitSlot] !== KIND_UNIT) continue;
    if (ownerOf(state, unitSlot) !== cmd.playerId) continue;
    if (!buildingCanGarrison(ctx.services.registry, state, unitSlot, hostSlot)) continue;
    if (host.garrisonReservedIds.includes(id) || host.garrisonedIds.includes(id)) continue;
    clearReservations(state, id);
    host.garrisonReservedIds.push(id);
    store.extras[unitSlot]!.orders = [{ type: 'garrison', buildingId: cmd.buildingId }];
    store.state[unitSlot] = STATE_MOVING;
    endChanneling(state, unitSlot);
    free--;
  }
  ctx.events.push({
    type: 'orderIssued',
    playerId: cmd.playerId,
    kind: 'garrison',
    x: store.posX[hostSlot]!,
    y: store.posY[hostSlot]!,
  });
}

function handleUnloadGarrison(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'unloadGarrison' }>): void {
  const store = state.entities;
  const hostSlot = store.slotOf(cmd.buildingId);
  if (hostSlot < 0 || store.dead[hostSlot] || store.kind[hostSlot] !== KIND_BUILDING) return;
  if (ownerOf(state, hostSlot) !== cmd.playerId) return;
  const hostEx = store.extras[hostSlot]!;
  const all = garrisonedIds(hostEx);
  const ids = (cmd.unitIds ?? [...all]).slice().sort((a, b) => a - b);
  if (!ids.length) return;
  const host = ensureGarrisonHost(hostEx);
  for (const id of ids) {
    const unitSlot = store.slotOf(id);
    if (unitSlot < 0 || store.kind[unitSlot] !== KIND_UNIT) continue;
    if (!host.garrisonedIds.includes(id)) continue;
    const spawn = findSpawnPosition(state, ctx, hostSlot, store.radius[unitSlot]!);
    clearGarrisonedIn(store.extras[unitSlot]!);
    store.posX[unitSlot] = spawn.x;
    store.posY[unitSlot] = spawn.y;
    store.velX[unitSlot] = 0;
    store.velY[unitSlot] = 0;
    store.extras[unitSlot]!.orders.length = 0;
    store.state[unitSlot] = STATE_IDLE;
    host.garrisonedIds = host.garrisonedIds.filter((gid) => gid !== id);
  }
}

// ------------------------------------------------------------------------------- channel

function handleChannel(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'channel' }>): void {
  const store = state.entities;
  for (const id of cmd.entityIds) {
    const slot = store.slotOf(id);
    if (slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    if (ownerOf(state, slot) !== cmd.playerId) continue;
    if (hasMorph(store.extras[slot]!)) continue;
    const udef = ctx.services.registry.units.get(store.extras[slot]!.defId);
    if (!udef?.canConjureMana) continue;
    if (!cmd.enabled) {
      endChanneling(state, slot);
      continue;
    }
    const channeler = ensureChanneler(store.extras[slot]!);
    channeler.channeling = true;
    channeler.channelTicks = 0;
    store.state[slot] = STATE_CHANNELING;
    store.extras[slot]!.orders.length = 0;
    store.velX[slot] = 0;
    store.velY[slot] = 0;
  }
  void isChanneling;
  void ctx;
}

// --------------------------------------------------------------------------------- spell

function handleSpell(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'castSpell' }>): void {
  const store = state.entities;
  const player = getPlayer(state, cmd.playerId);
  const spell = ctx.services.registry.spells.get(cmd.spellId);
  if (!player || !spell) return;
  if (!requirementsMet(state, cmd.playerId, spell.requires)) return reject(ctx, cmd.playerId, 'requires');
  if ((player.spellCooldowns[cmd.spellId] ?? 0) > 0) return reject(ctx, cmd.playerId, 'cooldown');
  player.spellCooldowns[cmd.spellId] = spell.cooldownTicks;

  const eff = spell.effect;
  if (eff.kind === 'damage') {
    for (let slot = 0; slot < store.count; slot++) {
      if (!store.isAliveSlot(slot)) continue;
      const kind = store.kind[slot]!;
      if (kind === KIND_RESOURCE_NODE || kind === KIND_PROJECTILE) continue;
      const dx = store.posX[slot]! - cmd.x;
      const dy = store.posY[slot]! - cmd.y;
      if (dx * dx + dy * dy > eff.radius * eff.radius) continue;
      // Damage spells hit enemies only; friendly fire on a global power would be a griefing tool.
      if (state.relations[cmd.playerId]?.[ownerOf(state, slot)] !== 'enemy') continue;
      // Imported lazily to avoid a cycle between commands and combat-util.
      applySpellDamage(state, ctx, slot, eff.damage, eff.vs);
    }
  } else if (eff.kind === 'buff') {
    for (const id of cmd.entityIds ?? []) {
      const slot = store.slotOf(id);
      if (slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
      if (ownerOf(state, slot) !== cmd.playerId) continue;
      store.extras[slot]!.buffs.push({ kind: eff.buff, expiresTick: state.tick + eff.durationTicks });
    }
  } else if (eff.kind === 'blink') {
    for (const id of cmd.entityIds ?? []) {
      const slot = store.slotOf(id);
      if (slot < 0 || store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
      if (ownerOf(state, slot) !== cmd.playerId) continue;
      store.posX[slot] = cmd.x;
      store.posY[slot] = cmd.y;
      store.extras[slot]!.orders.length = 0;
      store.state[slot] = STATE_IDLE;
    }
  } else if (eff.kind === 'beam') {
    state.beams.push({
      id: state.nextEntityId++,
      owner: cmd.playerId,
      spellId: cmd.spellId,
      x: cmd.x,
      y: cmd.y,
      dirX: 0,
      dirY: 0,
      speed: eff.speed,
      radius: eff.radius,
      damagePerTick: eff.damagePerTick,
      durationTicks: eff.durationTicks,
      vs: eff.vs,
      state: 'charging',
      fireTick: state.tick + eff.chargeTicks,
      expiresTick: 0,
    });
    ctx.events.push({ type: 'superweaponLaunched', playerId: cmd.playerId, x: cmd.x, y: cmd.y });
  }
  ctx.events.push({ type: 'spellCast', playerId: cmd.playerId, spellId: cmd.spellId, x: cmd.x, y: cmd.y });
}

function applySpellDamage(
  state: GameState,
  ctx: StepContext,
  slot: number,
  damage: number,
  vs: Record<'light' | 'heavy' | 'building', number>,
): void {
  applyDamageImpl(state, ctx, slot, damage, vs);
}

// Indirection so the import stays at the top of the file but the cycle is broken by the bundler.
import { applyDamage as applyDamageImpl } from '../combat-util';

function handleSteerSuperweapon(
  state: GameState,
  _ctx: StepContext,
  cmd: Extract<Command, { type: 'steerSuperweapon' }>,
): void {
  const beam = state.beams.find((b) => b.owner === cmd.playerId);
  if (!beam) return;
  const n = normalize(cmd.x - beam.x, cmd.y - beam.y);
  beam.dirX = n.x;
  beam.dirY = n.y;
}

function handleSurrender(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'surrender' }>): void {
  const player = getPlayer(state, cmd.playerId);
  if (!player || player.defeated) return;
  player.defeated = true;
  ctx.events.push({ type: 'playerDefeated', playerId: player.id });
}

// ----------------------------------------------------------------------------------- dev

function handleDev(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: `dev${string}` }>): void {
  const store = state.entities;
  switch (cmd.type) {
    case 'devSetMana': {
      const player = getPlayer(state, cmd.playerId);
      if (!player) return;
      if (cmd.mode === 'set') player.mana = Math.max(0, cmd.amount);
      else if (cmd.mode === 'add') player.mana = Math.max(0, player.mana + cmd.amount);
      else player.mana = Math.max(0, player.mana - cmd.amount);
      ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
      return;
    }
    case 'devSpawnUnit': {
      const count = Math.max(1, cmd.count ?? 1);
      for (let i = 0; i < count; i++) {
        const col = i % 5;
        const row = Math.floor(i / 5);
        spawnUnitAt(state, ctx.services, cmd.defId, cmd.playerId, cmd.x + col * TILE * 1.5, cmd.y + row * TILE * 1.5, ctx);
      }
      return;
    }
    case 'devSpawnBuilding': {
      const slot = spawnBuildingAt(state, ctx.services, cmd.defId, cmd.playerId, cmd.x, cmd.y, { complete: cmd.complete ?? true }, ctx);
      if (slot < 0) return;
      applyBuildingNav(state, ctx.services, slot);
      if (cmd.complete) {
        unlockTech(state, cmd.playerId, cmd.defId);
        ctx.events.push({ type: 'buildingComplete', id: store.id[slot]!, defId: cmd.defId, owner: cmd.playerId });
      }
      recomputePower(state, ctx.services.registry);
      return;
    }
    case 'devDestroyEntity': {
      for (const id of cmd.entityIds) {
        const slot = store.slotOf(id);
        if (slot < 0 || store.dead[slot] || store.kind[slot] === KIND_RESOURCE_NODE) continue;
        if (store.kind[slot] === KIND_BUILDING) clearBuildingNav(state, ctx.services, slot);
        ctx.events.push({
          type: 'entityDied',
          id,
          defId: store.extras[slot]!.defId,
          owner: ownerOf(state, slot),
          x: store.posX[slot]!,
          y: store.posY[slot]!,
        });
        store.kill(slot);
      }
      recomputePower(state, ctx.services.registry);
      return;
    }
    case 'devSetEntityHp': {
      const slot = store.slotOf(cmd.entityId);
      if (slot < 0 || store.dead[slot]) return;
      if (cmd.hp === 'kill') {
        handleDev(state, ctx, { type: 'devDestroyEntity', playerId: cmd.playerId, entityIds: [cmd.entityId] });
        return;
      }
      const next = cmd.hp === 'max' ? store.maxHp[slot]! : Math.max(0, Math.min(store.maxHp[slot]!, cmd.hp));
      const delta = next - store.hp[slot]!;
      store.hp[slot] = next;
      if (delta > 0) ctx.events.push({ type: 'healApplied', targetId: cmd.entityId, amount: delta, x: store.posX[slot]!, y: store.posY[slot]! });
      else if (delta < 0) ctx.events.push({ type: 'damageDealt', targetId: cmd.entityId, amount: -delta, x: store.posX[slot]!, y: store.posY[slot]! });
      if (store.hp[slot]! <= 0) {
        handleDev(state, ctx, { type: 'devDestroyEntity', playerId: cmd.playerId, entityIds: [cmd.entityId] });
      }
      return;
    }
    case 'devUnlockTech': {
      if (cmd.defId === 'all') {
        for (const id of ctx.services.registry.buildings.keys()) unlockTech(state, cmd.playerId, id);
        return;
      }
      unlockTech(state, cmd.playerId, cmd.defId);
      return;
    }
    case 'devClearUnits': {
      const ids: EntityId[] = [];
      for (let slot = 0; slot < store.count; slot++) {
        if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
        if (cmd.targetPlayerId && ownerOf(state, slot) !== cmd.targetPlayerId) continue;
        ids.push(store.id[slot]!);
      }
      if (ids.length) handleDev(state, ctx, { type: 'devDestroyEntity', playerId: cmd.playerId, entityIds: ids });
      return;
    }
    case 'devCastSpell': {
      handleSpell(state, ctx, {
        type: 'castSpell',
        playerId: cmd.playerId,
        spellId: cmd.spellId,
        x: cmd.x,
        y: cmd.y,
        ...(cmd.entityIds ? { entityIds: cmd.entityIds } : {}),
      });
      return;
    }
    case 'devCompleteResearch': {
      const player = getPlayer(state, cmd.playerId);
      if (!player) return;
      if (cmd.defId) {
        if (!player.completedResearch.includes(cmd.defId)) player.completedResearch.push(cmd.defId);
        return;
      }
      for (let slot = 0; slot < store.count; slot++) {
        if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
        if (ownerOf(state, slot) !== cmd.playerId) continue;
        const queue = getResearchQueue(store.extras[slot]!);
        if (!queue?.length) continue;
        for (const item of queue) {
          if (!player.completedResearch.includes(item.defId)) player.completedResearch.push(item.defId);
        }
        ensureProduction(store.extras[slot]!).researchQueue = [];
      }
      return;
    }
    case 'devAddPlayer':
    case 'devRemovePlayer':
    case 'devConfigurePlayer':
      // Multi-player editing is sandbox-only and lands in Phase 4 with the sandbox UI.
      return;
  }
}

// --------------------------------------------------------------------------------- dispatch

export function applyCommands(state: GameState, ctx: StepContext, cmds: Command[]): void {
  for (const cmd of cmds) {
    if (cmd.type.startsWith('dev')) {
      handleDev(state, ctx, cmd as Extract<Command, { type: `dev${string}` }>);
      continue;
    }
    const player = getPlayer(state, cmd.playerId);
    if (!player || player.defeated) continue;
    switch (cmd.type) {
      case 'move':
        handleMove(state, ctx, cmd);
        break;
      case 'attackMove':
        handleAttackMove(state, ctx, cmd);
        break;
      case 'moveInOrder':
        handleMoveInOrder(state, ctx, cmd);
        break;
      case 'attack':
        handleAttack(state, ctx, cmd);
        break;
      case 'harvest':
        handleHarvest(state, ctx, cmd);
        break;
      case 'stop':
        handleStop(state, ctx, cmd);
        break;
      case 'setStance':
        handleSetStance(state, ctx, cmd);
        break;
      case 'build':
        handleBuild(state, ctx, cmd);
        break;
      case 'deploy':
        handleDeploy(state, ctx, cmd);
        break;
      case 'pack':
        handlePack(state, ctx, cmd);
        break;
      case 'produce':
        handleProduce(state, ctx, cmd);
        break;
      case 'cancelProduce':
        handleCancelProduce(state, ctx, cmd);
        break;
      case 'research':
        handleResearch(state, ctx, cmd);
        break;
      case 'cancelResearch':
        handleCancelResearch(state, ctx, cmd);
        break;
      case 'setRally':
        handleSetRally(state, ctx, cmd);
        break;
      case 'sellBuilding':
        handleSellBuilding(state, ctx, cmd);
        break;
      case 'setRepair':
        handleSetRepair(state, ctx, cmd);
        break;
      case 'garrison':
        handleGarrison(state, ctx, cmd);
        break;
      case 'unloadGarrison':
        handleUnloadGarrison(state, ctx, cmd);
        break;
      case 'channel':
        handleChannel(state, ctx, cmd);
        break;
      case 'castSpell':
        handleSpell(state, ctx, cmd);
        break;
      case 'steerSuperweapon':
        handleSteerSuperweapon(state, ctx, cmd);
        break;
      case 'surrender':
        handleSurrender(state, ctx, cmd);
        break;
    }
  }
}
