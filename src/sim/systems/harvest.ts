// Wisp harvest cycle: travel to Mana Node -> siphon -> return to Attunement Spire -> deposit.
import { TICK_HZ } from '../../core/constants';
import type { StepContext } from '../context';
import type { BuildingEntity, ResourceNodeEntity, UnitEntity } from '../entity-types';
import type { GameState } from '../types';
import { entitiesSorted, isAlive } from '../queries';
import { buildingHasPower } from '../power';
import { len } from '../math';
import { moveTowardGoal, makePathContext } from '../pathing';

function moveToward(e: UnitEntity, tx: number, ty: number, speed: number, ctx: StepContext, state: GameState): number {
  const pathCtx = makePathContext(ctx.services.nav, ctx.services.flow, state.relations, e.owner);
  return moveTowardGoal(pathCtx, e, { x: tx, y: ty }, speed, 1 / TICK_HZ);
}

function nearestSpire(state: GameState, ctx: StepContext, e: UnitEntity): BuildingEntity | null {
  let best: BuildingEntity | null = null;
  let bestD = Infinity;
  for (const b of entitiesSorted(state)) {
    if (b.owner !== e.owner || b.kind !== 'building' || b.state === 'dead' || b.buildProgress !== undefined) continue;
    const bdef = ctx.services.registry.buildings.get(b.defId);
    if (!bdef?.isRefinery) continue;
    const d = len(b.pos.x - e.pos.x, b.pos.y - e.pos.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function nearestNode(state: GameState, e: UnitEntity): ResourceNodeEntity | null {
  let best: ResourceNodeEntity | null = null;
  let bestD = Infinity;
  for (const n of entitiesSorted(state)) {
    if (n.kind !== 'resource_node' || n.amount <= 0) continue;
    const d = len(n.pos.x - e.pos.x, n.pos.y - e.pos.y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

export function harvestSystem(state: GameState, ctx: StepContext): void {
  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'unit' || !isAlive(e) || e.carryMax === undefined) continue;
    const order = e.orders[0];
    if (!order || order.type !== 'harvest') continue;
    const udef = ctx.services.registry.unit(e.defId);
    const carry = e.carry ?? 0;

    if (e.state === 'returning') {
      const spire = nearestSpire(state, ctx, e);
      if (!spire) {
        e.state = 'harvesting';
        continue;
      }
      const d = moveToward(e, spire.pos.x, spire.pos.y, udef.speed, ctx, state);
      if (d <= spire.radius + e.radius + 4) {
        if (!buildingHasPower(state, ctx.services.registry, spire)) continue;
        const player = state.players.find((p) => p.id === e.owner)!;
        player.mana += carry;
        ctx.events.push({ type: 'manaDeposited', playerId: player.id, amount: carry, x: spire.pos.x, y: spire.pos.y });
        ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
        e.carry = 0;
        e.state = 'harvesting';
      }
      continue;
    }

    // harvesting
    const rawNode = state.entities.get(order.nodeId);
    let node: ResourceNodeEntity | undefined =
      rawNode?.kind === 'resource_node' && rawNode.amount > 0 ? rawNode : undefined;
    if (!node) {
      const alt = nearestNode(state, e);
      if (!alt) {
        e.orders = [];
        e.state = 'idle';
        continue;
      }
      node = alt;
      e.orders = [{ type: 'harvest', nodeId: alt.id }];
    }
    const d = moveToward(e, node.pos.x, node.pos.y, udef.speed, ctx, state);
    if (d <= node.radius + e.radius + 4) {
      const room = e.carryMax - carry;
      const siphonPerSec = ctx.services.registry.balance.siphonPerSecond;
      const take = Math.min(siphonPerSec / TICK_HZ, room, node.amount);
      e.carry = carry + take;
      node.amount -= take;
      if ((e.carry ?? 0) >= e.carryMax) e.state = 'returning';
    }
  }
}
