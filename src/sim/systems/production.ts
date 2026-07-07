// Advances building construction, unit production queues, spell cooldowns, buff expiry.
import { TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, Entity } from '../types';
import { entitiesSorted } from '../queries';
import { productionRate } from '../power';
import { spawnEntity, recomputePower, unlockTech } from '../factory';

export function productionSystem(state: GameState, ctx: StepContext): void {
  // Decrement spell cooldowns + expire buffs handled here (deterministic, per tick).
  for (const p of state.players) {
    for (const key of Object.keys(p.spellCooldowns)) {
      if ((p.spellCooldowns[key] ?? 0) > 0) p.spellCooldowns[key]!--;
    }
  }

  let powerDirty = false;
  for (const e of entitiesSorted(state)) {
    if (e.kind !== 'building' || e.state === 'dead') continue;
    if (e.morphProgress !== undefined) continue;
    const player = state.players.find((p) => p.id === e.owner);
    if (!player) continue;
    const bdef = ctx.services.registry.building(e.defId);
    const rate = productionRate(state, ctx.services.registry, e);

    // Construction of the building itself.
    if (e.buildProgress !== undefined) {
      const perTick = 1 / Math.max(1, bdef.buildTime * 20);
      e.buildProgress += perTick * rate;
      e.hp = Math.min(e.maxHp, Math.max(1, e.maxHp * e.buildProgress));
      if (e.buildProgress >= 1) {
        e.buildProgress = undefined;
        e.hp = e.maxHp;
        unlockTech(state, e.owner, e.defId); // tech becomes available only when complete
        ctx.events.push({ type: 'buildingComplete', id: e.id, defId: e.defId, owner: e.owner });
        if (bdef.spawnsFreeWisp) spawnFreeUnit(state, ctx, e, 'wisp');
        powerDirty = true;
      }
      continue;
    }

    // Slow paid repair for completed buildings.
    if (e.repairing && e.buildProgress === undefined && e.hp < e.maxHp) {
      const balance = ctx.services.registry.balance;
      const hpNeeded = e.maxHp - e.hp;
      const hpGain = Math.min(hpNeeded, balance.repairHpPerTick * rate);
      const cost = Math.ceil(hpGain * balance.repairManaPerHp);
      if (cost > 0 && player.mana >= cost) {
        player.mana -= cost;
        e.hp = Math.min(e.maxHp, e.hp + hpGain);
        ctx.events.push({ type: 'manaChanged', playerId: player.id, mana: player.mana });
      } else if (player.mana < balance.repairManaPerHp) {
        e.repairing = false;
      }
      if (e.hp >= e.maxHp) e.repairing = false;
      continue;
    }

    // Unit production queue.
    if (e.productionQueue && e.productionQueue.length) {
      const item = e.productionQueue[0]!;
      item.progress += rate;
      if (item.progress >= item.required) {
        e.productionQueue.shift();
        spawnFreeUnit(state, ctx, e, item.defId);
      }
    }
  }
  if (powerDirty) recomputePower(state, ctx.services);
}

function spawnFreeUnit(state: GameState, ctx: StepContext, building: Entity, unitDefId: string): void {
  // spawn just below the building, nudge to rally if present
  const spawnX = building.pos.x;
  const spawnY = building.pos.y + building.radius + TILE;
  const u = spawnEntity(state, ctx.services, ctx, unitDefId, building.owner, spawnX, spawnY);
  if (building.rally) {
    u.orders = [{ type: 'move', x: building.rally.x, y: building.rally.y }];
    u.state = 'moving';
  }
}
