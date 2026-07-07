// Advances building construction, unit production queues, spell cooldowns, buff expiry.
import { TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { BuildingEntity } from '../entity-types';
import type { GameState } from '../types';
import { entitiesSorted, isAlive } from '../queries';
import { productionRate } from '../power';
import { spawnEntity, recomputePower, unlockTech } from '../factory';

const SPAWN_DIRECTIONS = 16;
const SPAWN_RINGS = 8;

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
        if (bdef.isSuperweapon && bdef.unlocksSpells) {
          for (const spellId of bdef.unlocksSpells) {
            const sdef = ctx.services.registry.spells.get(spellId);
            if (sdef && (player.spellCooldowns[spellId] ?? 0) <= 0) {
              player.spellCooldowns[spellId] = sdef.cooldownTicks;
            }
          }
        }
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
      const cost = hpGain * balance.repairManaPerHp;
      if (cost > 0 && player.mana >= cost) {
        player.mana -= cost;
        e.hp = Math.min(e.maxHp, e.hp + hpGain);
      } else if (player.mana < balance.repairHpPerTick * balance.repairManaPerHp) {
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

function spawnFreeUnit(state: GameState, ctx: StepContext, building: BuildingEntity, unitDefId: string): void {
  const udef = ctx.services.registry.unit(unitDefId);
  const spawn = findSpawnPosition(state, ctx, building, udef.radius);
  const spawnX = spawn.x;
  const spawnY = spawn.y;
  const u = spawnEntity(state, ctx.services, ctx, unitDefId, building.owner, spawnX, spawnY);
  if (u.kind !== 'unit') return;
  if (building.rally) {
    u.orders = [{ type: 'move', x: building.rally.x, y: building.rally.y }];
    u.state = 'moving';
  }
}

function findSpawnPosition(
  state: GameState,
  ctx: StepContext,
  building: BuildingEntity,
  unitRadius: number,
): { x: number; y: number } {
  const dir = spawnDirection(building);
  const baseDistance = building.radius + unitRadius + 4;
  const baseX = building.pos.x + dir.x * baseDistance;
  const baseY = building.pos.y + dir.y * baseDistance;
  const step = unitRadius * 2 + 6;

  if (canSpawnAt(state, ctx, building, baseX, baseY, unitRadius)) return { x: baseX, y: baseY };

  for (let ring = 1; ring <= SPAWN_RINGS; ring++) {
    const r = step * ring;
    for (let i = 0; i < SPAWN_DIRECTIONS; i++) {
      const angle = Math.atan2(dir.y, dir.x) + (Math.PI * 2 * i) / SPAWN_DIRECTIONS;
      const x = baseX + Math.cos(angle) * r;
      const y = baseY + Math.sin(angle) * r;
      if (canSpawnAt(state, ctx, building, x, y, unitRadius)) return { x, y };
    }
  }

  const nearest = ctx.services.nav.nearestPassableFor(
    baseX,
    baseY,
    unitRadius,
    TILE * 6,
    building.owner,
    state.relations,
  );
  return nearest ?? { x: baseX, y: baseY };
}

function spawnDirection(building: BuildingEntity): { x: number; y: number } {
  if (!building.rally) return { x: 0, y: 1 };
  const dx = building.rally.x - building.pos.x;
  const dy = building.rally.y - building.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return { x: 0, y: 1 };
  return { x: dx / d, y: dy / d };
}

function canSpawnAt(
  state: GameState,
  ctx: StepContext,
  building: BuildingEntity,
  x: number,
  y: number,
  unitRadius: number,
): boolean {
  if (ctx.services.nav.isBlockedDiscFor(x, y, unitRadius, building.owner, state.relations)) return false;
  for (const other of state.entities.values()) {
    if (other.kind === 'projectile' || !isAlive(other)) continue;
    const minDist = unitRadius + other.radius;
    const dx = x - other.pos.x;
    const dy = y - other.pos.y;
    if (dx * dx + dy * dy < minDist * minDist) return false;
  }
  return true;
}
