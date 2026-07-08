import type { StepContext } from '../../context';
import type { GameState, Command } from '../../types';
import { isAlive } from '../../queries';
import { ownedAliveUnits } from './shared';

function clearGarrisonReservation(state: GameState, unitId: number): void {
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || !e.garrisonReservedIds?.length) continue;
    e.garrisonReservedIds = e.garrisonReservedIds.filter((id) => id !== unitId);
  }
}

export function handleMove(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'move' }>): void {
  for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
    clearGarrisonReservation(state, e.id);
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
    clearGarrisonReservation(state, e.id);
    e.channeling = false;
    e.channelTicks = undefined;
    e.orders = [{ type: 'attackMove', x: cmd.x, y: cmd.y }];
    e.targetId = undefined;
    e.state = 'moving';
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'attackMove', x: cmd.x, y: cmd.y });
}

export function handleAttack(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'attack' }>): void {
  const target = state.entities.get(cmd.targetId);
  if (!isAlive(target)) return;
  for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
    clearGarrisonReservation(state, e.id);
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
    clearGarrisonReservation(state, e.id);
    if (e.carryMax === undefined) continue;
    e.orders = [{ type: 'harvest', nodeId: cmd.nodeId }];
    e.state = 'harvesting';
  }
  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'harvest', x: node.pos.x, y: node.pos.y });
}

export function handleStop(state: GameState, _ctx: StepContext, cmd: Extract<Command, { type: 'stop' }>): void {
  for (const e of ownedAliveUnits(state, cmd.playerId, cmd.entityIds)) {
    if (e.morphProgress !== undefined) continue;
    clearGarrisonReservation(state, e.id);
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
