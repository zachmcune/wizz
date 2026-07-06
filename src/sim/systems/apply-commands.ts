// Translates the tick's command list into state changes. Commands are the ONLY entry point
// for mutating gameplay state (from human input, UI, AI, or the network).
import { TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, Command, Entity, EntityId, PlayerId } from '../types';
import { getPlayer, isAlive, relationBetween } from '../queries';
import { buildingHasPower } from '../power';
import { spawnEntity, recomputePower } from '../factory';
import { canBuildNearBase } from '../build-zone';
import { applyDamage } from '../combat-util';
import type { BuildingDef } from '../../data/defs';

function ownedAliveUnits(state: GameState, playerId: PlayerId, ids: EntityId[]): Entity[] {
  const out: Entity[] = [];
  for (const id of ids) {
    const e = state.entities.get(id);
    if (e && e.owner === playerId && isAlive(e) && e.kind === 'unit') out.push(e);
  }
  return out;
}

export function applyCommands(state: GameState, ctx: StepContext, cmds: Command[]): void {
  for (const cmd of cmds) {
    const player = getPlayer(state, cmd.playerId);
    if (!player || player.defeated) continue;
    switch (cmd.type) {
      case 'move':
        for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
          e.orders = [{ type: 'move', x: cmd.x, y: cmd.y }];
          e.targetId = undefined;
          e.state = 'moving';
        }
        ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'move', x: cmd.x, y: cmd.y });
        break;
      case 'attackMove':
        for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
          e.orders = [{ type: 'attackMove', x: cmd.x, y: cmd.y }];
          e.targetId = undefined;
          e.state = 'moving';
        }
        ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'attackMove', x: cmd.x, y: cmd.y });
        break;
      case 'attack': {
        const target = state.entities.get(cmd.targetId);
        if (!isAlive(target)) break;
        for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
          e.orders = [{ type: 'attack', targetId: cmd.targetId }];
          e.targetId = cmd.targetId;
          e.state = 'attacking';
        }
        ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'attack', x: target.pos.x, y: target.pos.y });
        break;
      }
      case 'harvest': {
        const node = state.entities.get(cmd.nodeId);
        if (!isAlive(node) || node.kind !== 'resource_node') break;
        for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
          if (e.carryMax === undefined) continue; // only harvesters
          e.orders = [{ type: 'harvest', nodeId: cmd.nodeId }];
          e.state = 'harvesting';
        }
        ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'harvest', x: node.pos.x, y: node.pos.y });
        break;
      }
      case 'stop':
        for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
          e.orders = [];
          e.targetId = undefined;
          e.vel = { x: 0, y: 0 };
          e.state = 'idle';
        }
        break;
      case 'setStance':
        for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) e.stance = cmd.stance;
        break;
      case 'build':
        handleBuild(state, ctx, cmd);
        break;
      case 'produce':
        handleProduce(state, ctx, cmd);
        break;
      case 'cancelProduce':
        handleCancel(state, ctx, cmd);
        break;
      case 'setRally': {
        const b = state.entities.get(cmd.buildingId);
        if (b && b.owner === cmd.playerId && b.kind === 'building') b.rally = { x: cmd.x, y: cmd.y };
        break;
      }
      case 'castSpell':
        handleSpell(state, ctx, cmd);
        break;
      case 'surrender':
        player.defeated = true;
        ctx.events.push({ type: 'playerDefeated', playerId: player.id });
        break;
    }
  }
}

function requirementsMet(player: { unlockedTech: string[] }, requires: string[]): boolean {
  return requires.every((r) => player.unlockedTech.includes(r));
}

function handleBuild(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'build' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const def = ctx.services.registry.buildings.get(cmd.defId);
  if (!def) return;
  if (!requirementsMet(player, def.requires)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'requires' });
    return;
  }
  if (player.mana < def.cost) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'mana' });
    return;
  }
  const tx = Math.floor((cmd.x - (def.footprint * TILE) / 2) / TILE);
  const ty = Math.floor((cmd.y - (def.footprint * TILE) / 2) / TILE);
  if (!ctx.services.nav.canPlace(tx, ty, def.footprint)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'blocked' });
    return;
  }
  if (!canBuildNearBase(state, ctx.services, cmd.playerId, tx, ty, def.footprint)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'range' });
    return;
  }
  player.mana -= def.cost;
  const cx = (tx + def.footprint / 2) * TILE;
  const cy = (ty + def.footprint / 2) * TILE;
  const e = spawnEntity(state, ctx.services, ctx, def.id, cmd.playerId, cx, cy);
  e.buildProgress = 0; // under construction; ProductionSystem completes it
  e.hp = Math.max(1, Math.floor(def.hp * 0.1));
  ctx.events.push({ type: 'buildingPlaced', id: e.id, defId: def.id, owner: cmd.playerId });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

function handleProduce(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'produce' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const b = state.entities.get(cmd.buildingId);
  if (!b || b.owner !== cmd.playerId || b.kind !== 'building' || b.buildProgress !== undefined) return;
  const bdef = ctx.services.registry.buildings.get(b.defId) as BuildingDef | undefined;
  const udef = ctx.services.registry.units.get(cmd.defId);
  if (!bdef || !udef || !bdef.producesUnits?.includes(cmd.defId)) return;
  if (!buildingHasPower(state, ctx.services.registry, b)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'power' });
    return;
  }
  if (!requirementsMet(player, udef.requires)) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'requires' });
    return;
  }
  if (player.mana < udef.cost) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'mana' });
    return;
  }
  player.mana -= udef.cost;
  b.productionQueue ??= [];
  b.productionQueue.push({ defId: cmd.defId, progress: 0, required: Math.round(udef.buildTime * 20) });
  ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
}

function handleCancel(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'cancelProduce' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const b = state.entities.get(cmd.buildingId);
  if (!b || b.owner !== cmd.playerId || !b.productionQueue) return;
  const item = b.productionQueue[cmd.index];
  if (!item) return;
  const udef = ctx.services.registry.units.get(item.defId);
  if (udef) {
    player.mana += udef.cost; // full refund
    ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
  }
  b.productionQueue.splice(cmd.index, 1);
}

function handleSpell(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'castSpell' }>): void {
  const player = getPlayer(state, cmd.playerId)!;
  const spell = ctx.services.registry.spells.get(cmd.spellId);
  if (!spell) return;
  if (!requirementsMet(player, spell.requires)) return;
  if ((player.spellCooldowns[cmd.spellId] ?? 0) > 0) return;
  player.spellCooldowns[cmd.spellId] = spell.cooldownTicks;

  const eff = spell.effect;
  if (eff.kind === 'damage') {
    for (const e of state.entities.values()) {
      if (e.kind === 'resource_node' || e.state === 'dead') continue;
      const dx = e.pos.x - cmd.x;
      const dy = e.pos.y - cmd.y;
      if (dx * dx + dy * dy <= eff.radius * eff.radius) applyDamage(state, ctx, e, eff.damage, eff.vs);
    }
  } else if (eff.kind === 'buff') {
    const ids = cmd.entityIds ?? [];
    for (const id of ids) {
      const e = state.entities.get(id);
      if (e && e.owner === cmd.playerId && isAlive(e)) e.buffs.push({ kind: eff.buff, expiresTick: state.tick + eff.durationTicks });
    }
  } else if (eff.kind === 'blink') {
    const ids = cmd.entityIds ?? [];
    for (const id of ids) {
      const e = state.entities.get(id);
      if (e && e.owner === cmd.playerId && isAlive(e) && e.kind === 'unit') {
        e.pos = { x: cmd.x, y: cmd.y };
        e.orders = [];
        e.state = 'idle';
      }
    }
  }
  recomputePower(state, ctx.services);
  void relationBetween;
  ctx.events.push({ type: 'spellCast', playerId: cmd.playerId, spellId: cmd.spellId, x: cmd.x, y: cmd.y });
}
