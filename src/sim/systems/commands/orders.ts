import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { hasBuff, isAlive } from '../../queries';
import { ownedAliveUnits } from './shared';

function groupMoveSpeed(state: GameState, ctx: StepContext, units: ReturnType<typeof ownedAliveUnits>): number {
  let groupSpeed = Infinity;
  for (const e of units) {
    const udef = ctx.services.registry.unit(e.defId);
    let speed = udef.speed;
    if (hasBuff(e, 'haste', state.tick)) speed *= 1.5;
    if (speed < groupSpeed) groupSpeed = speed;
  }
  return Number.isFinite(groupSpeed) ? groupSpeed : 0;
}

export function handleMove(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'move' }>): void {
  for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
    e.channeling = false;
    e.channelTicks = undefined;
    e.orders = [{ type: 'move', x: cmd.x, y: cmd.y }];
    e.targetId = undefined;
    e.state = 'moving';
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'move', x: cmd.x, y: cmd.y });
}

export function handleAttackMove(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'attackMove' }>): void {
  for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
    e.channeling = false;
    e.channelTicks = undefined;
    e.orders = [{ type: 'attackMove', x: cmd.x, y: cmd.y }];
    e.targetId = undefined;
    e.state = 'moving';
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'attackMove', x: cmd.x, y: cmd.y });
}

export function handleMoveInOrder(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'moveInOrder' }>): void {
  const units = ownedAliveUnits(state, cmd.playerId, cmd.entityIds);
  const groupSpeed = groupMoveSpeed(state, ctx, units);
  for (const e of units) {
    e.channeling = false;
    e.channelTicks = undefined;
    e.orders = [{ type: 'moveInOrder', x: cmd.x, y: cmd.y, groupSpeed }];
    e.targetId = undefined;
    e.state = 'moving';
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'moveInOrder', x: cmd.x, y: cmd.y });
}

export function handleAttack(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'attack' }>): void {
  const target = state.entities.get(cmd.targetId);
  if (!isAlive(target)) return;
  for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
    e.channeling = false;
    e.channelTicks = undefined;
    e.orders = [{ type: 'attack', targetId: cmd.targetId }];
    e.targetId = cmd.targetId;
    e.state = 'attacking';
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'attack', x: target.pos.x, y: target.pos.y });
}

export function handleHarvest(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'harvest' }>): void {
  const node = state.entities.get(cmd.nodeId);
  if (!isAlive(node) || node.kind !== 'resource_node') return;
  for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
    if (e.carryMax === undefined) continue;
    e.orders = [{ type: 'harvest', nodeId: cmd.nodeId }];
    e.state = 'harvesting';
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'harvest', x: node.pos.x, y: node.pos.y });
}

export function handleStop(state: GameState, _ctx: StepContext, cmd: Extract<Command, { type: 'stop' }>): void {
  for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
    if (e.morphProgress !== undefined) continue;
    e.channeling = false;
    e.channelTicks = undefined;
    e.orders = [];
    e.targetId = undefined;
    e.vel = { x: 0, y: 0 };
    e.state = 'idle';
  }
}

export function handleSetStance(state: GameState, _ctx: StepContext, cmd: Extract<Command, { type: 'setStance' }>): void {
  for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) e.stance = cmd.stance;
}
