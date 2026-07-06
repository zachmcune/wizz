// Shared damage application. Respects armor-class multipliers and the Aegis buff.
import type { StepContext } from './context';
import type { GameState, Entity, EntityId } from './types';
import type { ArmorClass } from '../data/defs';
import { hasBuff } from './queries';

export function armorClassOf(ctx: StepContext, e: Entity): ArmorClass {
  if (e.kind === 'building') return 'building';
  const u = ctx.services.registry.units.get(e.defId);
  return u?.armor ?? 'light';
}

export function applyDamage(
  state: GameState,
  ctx: StepContext,
  target: Entity,
  baseAmount: number,
  vs: Record<ArmorClass, number>,
  killerId?: EntityId,
): void {
  if (target.state === 'dead') return;
  if (hasBuff(target, 'aegis', state.tick)) return; // Aegis = temporary invulnerability
  const cls = armorClassOf(ctx, target);
  const mult = vs[cls] ?? 1;
  const amount = baseAmount * mult;
  target.hp -= amount;
  ctx.events.push({ type: 'damageDealt', targetId: target.id, amount, x: target.pos.x, y: target.pos.y });

  // Notify the owner they're under attack (for alerts), throttled by cooldown key.
  const owner = state.players.find((p) => p.id === target.owner);
  if (owner && !owner.defeated) {
    ctx.events.push({ type: 'underAttack', playerId: target.owner, x: target.pos.x, y: target.pos.y });
  }

  if (target.hp <= 0) {
    target.hp = 0;
    target.state = 'dead';
    ctx.events.push({
      type: 'entityDied',
      id: target.id,
      defId: target.defId,
      owner: target.owner,
      x: target.pos.x,
      y: target.pos.y,
      killerId,
    });
  }
}
