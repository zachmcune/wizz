import { TILE } from '../../../core/constants';
import { buildingPlacementSpacing } from '../../../core/placement-spacing';
import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { getPlayer, isAlive } from '../../queries';
import { spawnEntity, unlockTech } from '../../factory';
import { canBuildNearBase } from '../../build-zone';
import { footprintOverlapsNode } from '../../resource-nodes';
import { requirementsMet, removeBuildingFromWorld } from './shared';
import { ensureProduction, getProductionQueue, garrisonedIds, garrisonReservedIds, hasMorph, ensureMorph } from '../../capabilities';
import { sandboxIgnorePlacement, sandboxIgnoreTech, sandboxNoCosts, sandboxInstantBuild } from '../../sandbox-flags';

export function handleBuild(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'build' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const def = ctx.services.registry.buildings.get(cmd.defId);
  if (!def) return;
  const ignoreTech = sandboxIgnoreTech(state);
  if (!ignoreTech && !requirementsMet(player, def.requires)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'requires' });
    return;
  }
  if (def.isSuperweapon && state.oneSuperweaponPerPlayer && !state.sandbox?.enabled) {
    const already = [...state.entities.values()].some(
      (e) => e.owner === cmd.playerId && e.kind === 'building' && e.defId === def.id && e.state !== 'dead',
    );
    if (already) {
      ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'limit' });
      return;
    }
  }
  if (!sandboxNoCosts(state) && player.mana < def.cost) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'mana' });
    return;
  }
  const tx = Math.floor((cmd.x - (def.footprint * TILE) / 2) / TILE);
  const ty = Math.floor((cmd.y - (def.footprint * TILE) / 2) / TILE);
  const ignorePlace = sandboxIgnorePlacement(state);
  if (!ignorePlace && !ctx.services.nav.canPlace(tx, ty, def.footprint, buildingPlacementSpacing(def))) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'blocked' });
    return;
  }
  if (!ignorePlace && footprintOverlapsNode(state, tx, ty, def.footprint)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'blocked' });
    return;
  }
  if (!ignorePlace && !canBuildNearBase(state, ctx.services, cmd.playerId, tx, ty, def.footprint)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'range' });
    return;
  }
  if (!sandboxNoCosts(state)) player.mana -= def.cost;
  const cx = (tx + def.footprint / 2) * TILE;
  const cy = (ty + def.footprint / 2) * TILE;
  const e = spawnEntity(state, ctx.services, ctx, def.id, cmd.playerId, cx, cy);
  if (e.kind !== 'building') return;
  if (sandboxInstantBuild(state)) {
    e.buildProgress = undefined;
    e.hp = e.maxHp;
    unlockTech(state, e.owner, e.defId);
  } else {
    e.buildProgress = 0;
    e.hp = Math.max(1, Math.floor(def.hp * 0.1));
  }
  ctx.events.push({ type: 'buildingPlaced', id: e.id, defId: def.id, owner: cmd.playerId });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

export function handleDeploy(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'deploy' }>): void {
  const unit = state.entities.get(cmd.entityId);
  if (!unit || unit.owner !== cmd.playerId || unit.kind !== 'unit' || !isAlive(unit)) return;
  if (hasMorph(unit) || unit.orders.length > 0 || unit.state !== 'idle') {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'busy' });
    return;
  }
  const udef = ctx.services.registry.units.get(unit.defId);
  if (!udef?.deploysAs) return;
  const bdef = ctx.services.registry.buildings.get(udef.deploysAs);
  if (!bdef) return;

  const tx = Math.floor((cmd.x - (bdef.footprint * TILE) / 2) / TILE);
  const ty = Math.floor((cmd.y - (bdef.footprint * TILE) / 2) / TILE);
  if (!ctx.services.nav.canPlace(tx, ty, bdef.footprint, buildingPlacementSpacing(bdef))) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'blocked' });
    return;
  }
  if (footprintOverlapsNode(state, tx, ty, bdef.footprint)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'blocked' });
    return;
  }

  const cx = (tx + bdef.footprint / 2) * TILE;
  const cy = (ty + bdef.footprint / 2) * TILE;
  const morph = ensureMorph(unit);
  morph.progress = 0;
  morph.action = 'deploy';
  morph.targetPos = { x: cx, y: cy };
  morph.targetDefId = udef.deploysAs;
  unit.state = 'building';
  unit.orders = [];
  unit.vel = { x: 0, y: 0 };
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'deploy', x: cx, y: cy });
}

export function handlePack(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'pack' }>): void {
  const b = state.entities.get(cmd.buildingId);
  if (!b || b.owner !== cmd.playerId || b.kind !== 'building' || !isAlive(b)) return;
  if (b.buildProgress !== undefined || hasMorph(b)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'busy' });
    return;
  }
  const bdef = ctx.services.registry.buildings.get(b.defId);
  if (!bdef?.packsInto) return;
  const productionQueue = getProductionQueue(b);
  if (productionQueue && productionQueue.length > 0) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'busy' });
    return;
  }

  const morph = ensureMorph(b);
  morph.progress = 0;
  morph.action = 'pack';
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'pack', x: b.pos.x, y: b.pos.y });
}

export function handleSetRally(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'setRally' }>): void {
  const b = state.entities.get(cmd.buildingId);
  if (!b || b.owner !== cmd.playerId || b.kind !== 'building' || !isAlive(b)) return;
  if (b.buildProgress !== undefined || hasMorph(b)) return;
  const bdef = ctx.services.registry.buildings.get(b.defId);
  if (!bdef?.producesUnits?.length) return;
  ensureProduction(b).rally = { x: cmd.x, y: cmd.y };
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'rally', x: cmd.x, y: cmd.y });
}

export function handleSellBuilding(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'sellBuilding' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const b = state.entities.get(cmd.buildingId);
  if (!b || b.owner !== cmd.playerId || b.kind !== 'building' || !isAlive(b)) return;
  const bdef = ctx.services.registry.buildings.get(b.defId);
  if (!bdef || bdef.isConstructionYard) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'cannot_sell' });
    return;
  }
  if (b.buildProgress !== undefined || hasMorph(b)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'busy' });
    return;
  }
  const productionQueue = getProductionQueue(b);
  if (productionQueue && productionQueue.length > 0) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'busy' });
    return;
  }
  if (garrisonedIds(b).length > 0 || garrisonReservedIds(b).length > 0) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'busy' });
    return;
  }
  const refund = Math.floor(bdef.cost * ctx.services.registry.balance.sellRefundRatio);
  removeBuildingFromWorld(state, ctx, b);
  player.mana += refund;
  ctx.events.push({ type: 'buildingSold', id: b.id, defId: b.defId, owner: cmd.playerId, refund });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

export function handleSetRepair(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'setRepair' }>): void {
  const b = state.entities.get(cmd.buildingId);
  if (!b || b.owner !== cmd.playerId || b.kind !== 'building' || !isAlive(b)) return;
  if (b.buildProgress !== undefined || hasMorph(b)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'busy' });
    return;
  }
  if (!cmd.enabled) {
    b.repairing = false;
    return;
  }
  if (b.hp >= b.maxHp) return;
  b.repairing = true;
}
