import type { StepContext } from '../context';
import type { Entity } from '../entity-types';
import type { GameState } from '../types';
import { garrisonedInId, hasMorph } from '../capabilities';
import { buildingHasPower } from '../power';
import { distSq } from '../math';
import { entitiesSorted, isAlive, isAlly } from '../queries';

function canHealTarget(source: Entity, target: Entity, affects: 'units' | 'buildings' | 'allies'): boolean {
  if (target.kind === 'resource_node' || target.kind === 'projectile') return false;
  if (target.hp >= target.maxHp) return false;
  if (target.kind === 'unit' && garrisonedInId(target) !== undefined) return false;
  if (affects === 'units') return target.kind === 'unit';
  if (affects === 'buildings') return target.kind === 'building';
  void source;
  return target.kind === 'unit' || target.kind === 'building';
}

export function auraSystem(state: GameState, ctx: StepContext): void {
  for (const source of entitiesSorted(state)) {
    if (source.kind !== 'building' || !isAlive(source)) continue;
    if (source.buildProgress !== undefined || hasMorph(source)) continue;
    if (!buildingHasPower(state, ctx.services.registry, source)) continue;
    const aura = ctx.services.registry.buildings.get(source.defId)?.aura;
    if (!aura || aura.kind !== 'heal') continue;
    const radiusSq = aura.radius * aura.radius;
    for (const target of entitiesSorted(state)) {
      if (!isAlive(target)) continue;
      if (!isAlly(state, source.owner, target.owner)) continue;
      if (!canHealTarget(source, target, aura.affects)) continue;
      if (distSq(source.pos.x, source.pos.y, target.pos.x, target.pos.y) > radiusSq) continue;
      const amount = Math.min(aura.hpPerTick, target.maxHp - target.hp);
      if (amount <= 0) continue;
      target.hp += amount;
      ctx.events.push({ type: 'healApplied', targetId: target.id, amount, x: target.pos.x, y: target.pos.y });
    }
  }
}
