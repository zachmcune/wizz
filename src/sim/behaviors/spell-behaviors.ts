// Built-in spell behavior handlers. Register at module load.
import { registerSpellBehavior } from './registry';
import type { SpellBehaviorContext } from './registry';
import { entitiesSorted, isAlive } from '../queries';
import { applyDamage } from '../combat-util';

function damageSpell({ state, ctx, cmd, spell }: SpellBehaviorContext): void {
  const eff = spell.effect;
  if (eff.kind !== 'damage') return;
  for (const e of entitiesSorted(state)) {
    if (e.kind === 'resource_node' || e.kind === 'projectile' || e.state === 'dead') continue;
    const dx = e.pos.x - cmd.x;
    const dy = e.pos.y - cmd.y;
    if (dx * dx + dy * dy <= eff.radius * eff.radius) applyDamage(state, ctx, e, eff.damage, eff.vs);
  }
  ctx.events.push({ type: 'spellCast', playerId: cmd.playerId, spellId: cmd.spellId, x: cmd.x, y: cmd.y });
}

function buffSpell({ state, ctx, cmd, spell }: SpellBehaviorContext): void {
  const eff = spell.effect;
  if (eff.kind !== 'buff') return;
  const ids = cmd.entityIds ?? [];
  for (const id of ids) {
    const e = state.entities.get(id);
      if (e && e.owner === cmd.playerId && isAlive(e) && e.kind === 'unit') {
      e.buffs.push({ kind: eff.buff, expiresTick: state.tick + eff.durationTicks });
    }
  }
  ctx.events.push({ type: 'spellCast', playerId: cmd.playerId, spellId: cmd.spellId, x: cmd.x, y: cmd.y });
}

function blinkSpell({ state, ctx, cmd, spell }: SpellBehaviorContext): void {
  const eff = spell.effect;
  if (eff.kind !== 'blink') return;
  const ids = cmd.entityIds ?? [];
  for (const id of ids) {
    const e = state.entities.get(id);
    if (e && e.owner === cmd.playerId && isAlive(e) && e.kind === 'unit') {
      e.pos = { x: cmd.x, y: cmd.y };
      e.orders = [];
      e.state = 'idle';
    }
  }
  ctx.events.push({ type: 'spellCast', playerId: cmd.playerId, spellId: cmd.spellId, x: cmd.x, y: cmd.y });
}

function beamSpell({ state, ctx, cmd, spell }: SpellBehaviorContext): void {
  const eff = spell.effect;
  if (eff.kind !== 'beam') return;
  state.beams.push({
    id: state.nextEntityId++,
    owner: cmd.playerId,
    spellId: cmd.spellId,
    pos: { x: cmd.x, y: cmd.y },
    dir: { x: 0, y: 0 },
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

registerSpellBehavior('damage', damageSpell);
registerSpellBehavior('buff', buffSpell);
registerSpellBehavior('blink', blinkSpell);
registerSpellBehavior('beam', beamSpell);
