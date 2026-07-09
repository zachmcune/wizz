import type { StepContext } from '../../context';
import type { Command, GameState } from '../../types';
import { canUnitGarrison, garrisonFreeCapacity } from '../../garrison';
import {
  ensureGarrisonHost,
  getGarrisonHost,
  garrisonedIds,
  garrisonedInId,
  clearGarrisonedIn,
  getChanneler,
} from '../../capabilities';
import { isAlive } from '../../queries';
import { findSpawnPosition } from '../production';

function clearExistingReservations(state: GameState, unitId: number): void {
  for (const e of state.entities.values()) {
    if (e.kind !== 'building') continue;
    const host = getGarrisonHost(e);
    if (!host?.garrisonReservedIds?.length) continue;
    host.garrisonReservedIds = host.garrisonReservedIds.filter((id) => id !== unitId);
  }
}

function clearChanneling(unit: import('../../entity-types').UnitEntity): void {
  const ch = getChanneler(unit);
  if (ch) {
    ch.channeling = false;
    ch.channelTicks = undefined;
  }
}

export function handleGarrison(state: GameState, ctx: StepContext, cmd: Extract<Command, { type: 'garrison' }>): void {
  const building = state.entities.get(cmd.buildingId);
  if (!building || building.owner !== cmd.playerId || building.kind !== 'building' || !isAlive(building)) return;
  const bdef = ctx.services.registry.buildings.get(building.defId);
  if (!bdef?.garrison) return;

  let free = garrisonFreeCapacity(ctx.services.registry, building);
  if (free <= 0) {
    ctx.events.push({ type: 'commandRejected', playerId: cmd.playerId, reason: 'capacity' });
    return;
  }

  const host = ensureGarrisonHost(building);
  const accepted = [...cmd.unitIds].sort((a, b) => a - b);
  for (const id of accepted) {
    if (free <= 0) break;
    const unit = state.entities.get(id);
    if (!unit || unit.owner !== cmd.playerId || unit.kind !== 'unit' || !isAlive(unit)) continue;
    if (!canUnitGarrison(ctx.services.registry, unit, building)) continue;
    if (host.garrisonReservedIds.includes(unit.id) || host.garrisonedIds.includes(unit.id)) continue;
    clearExistingReservations(state, unit.id);
    host.garrisonReservedIds.push(unit.id);
    unit.orders = [{ type: 'garrison', buildingId: building.id }];
    unit.state = 'moving';
    unit.targetId = undefined;
    clearChanneling(unit);
    free--;
  }

  ctx.events.push({ type: 'orderIssued', playerId: cmd.playerId, kind: 'garrison', x: building.pos.x, y: building.pos.y });
}

export function handleUnloadGarrison(
  state: GameState,
  ctx: StepContext,
  cmd: Extract<Command, { type: 'unloadGarrison' }>,
): void {
  const building = state.entities.get(cmd.buildingId);
  if (!building || building.owner !== cmd.playerId || building.kind !== 'building' || !isAlive(building)) return;
  const ids = (cmd.unitIds ?? garrisonedIds(building)).slice().sort((a, b) => a - b);
  if (!ids.length) return;

  const host = ensureGarrisonHost(building);
  for (const id of ids) {
    const unit = state.entities.get(id);
    if (!unit || unit.kind !== 'unit' || garrisonedInId(unit) !== building.id || !host.garrisonedIds.includes(id)) continue;
    const spawn = findSpawnPosition(state, ctx, building, unit.radius);
    clearGarrisonedIn(unit);
    unit.pos = { x: spawn.x, y: spawn.y };
    unit.vel = { x: 0, y: 0 };
    unit.orders = [];
    unit.state = 'idle';
    unit.targetId = undefined;
    host.garrisonedIds = host.garrisonedIds.filter((gid) => gid !== id);
  }
}
