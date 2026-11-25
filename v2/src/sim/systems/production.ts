// Production: construction progress, unit queues, research queues, repair, power recompute.
//
// Spawn placement is a deliberate search rather than a random offset: try straight out from the
// building's rally direction, then rings of increasing radius, then a nav-grid nudge. Getting a unit
// stuck inside a wall on spawn is a visible bug, so the search is generous.

import { TICK_HZ, TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, EntityId } from '../types';
import {
  KIND_BUILDING,
  KIND_UNIT,
  STATE_IDLE,
  STATE_MOVING,
} from '../entity-store';
import {
  ensureBuildingCap,
  ensureProduction,
  getProductionQueue,
  getRally,
  getResearchQueue,
  garrisonedInId,
  hasMorph,
} from '../capabilities';
import { productionRate, recomputePower } from '../power';
import { resolveUnitStat } from '../modifiers';
import { getPlayer, unitCountOf } from '../queries';
import { MAX_UNITS_PER_PLAYER } from '../../core/constants';

const SPAWN_DIRECTIONS = 16;
const SPAWN_RINGS = 8;

/** Spawn one unit into the world at (x, y). Returns the slot, or -1 if the cap is hit. */
export function spawnUnitAt(
  state: GameState,
  services: StepContext['services'],
  defId: string,
  owner: string,
  x: number,
  y: number,
  ctx: StepContext | null,
): number {
  const udef = services.registry.units.get(defId);
  if (!udef) return -1;
  // THE UNIT CAP. v1 declared MAX_UNITS_PER_PLAYER and never checked it; v2 enforces it here, which
  // is the single funnel every unit spawn goes through (production, dev spawn, free wisp).
  if (unitCountOf(state, owner, services.registry) >= MAX_UNITS_PER_PLAYER) {
    ctx?.events.push({ type: 'commandRejected', playerId: owner, reason: 'unit_cap' });
    return -1;
  }
  const store = state.entities;
  const id = state.nextEntityId++;
  const slot = store.spawnUnit(
    id,
    store.ownerIndexFor(owner),
    defId,
    -1,
    x,
    y,
    udef.hp,
    udef.radius,
  );
  const ex = store.extras[slot]!;
  if (udef.isHarvester) ex.caps.harvester = { carry: 0, carryMax: udef.carry ?? 100 };
  if (udef.canConjureMana) ex.caps.channeler = { channeling: false, channelTicks: 0 };
  if (udef.canGarrison) ex.caps.garrisonable = undefined;
  ctx?.events.push({ type: 'entitySpawned', id, defId, owner });
  return slot;
}

/** Spawn a building. Returns the slot, or -1 for an unknown def. */
export function spawnBuildingAt(
  state: GameState,
  services: StepContext['services'],
  defId: string,
  owner: string,
  x: number,
  y: number,
  opts: { complete?: boolean } = {},
  ctx: StepContext | null = null,
): number {
  const bdef = services.registry.buildings.get(defId);
  if (!bdef) return -1;
  const store = state.entities;
  const id = state.nextEntityId++;
  const slot = store.spawnBuilding(
    id,
    store.ownerIndexFor(owner),
    defId,
    -1,
    x,
    y,
    bdef.hp,
    (bdef.footprint * TILE) / 2,
  );
  const ex = store.extras[slot]!;
  if (bdef.producesUnits?.length) ensureProduction(ex);
  if (bdef.garrison) ex.caps.garrisonHost = { garrisonedIds: [], garrisonReservedIds: [] };
  if (!opts.complete) {
    const cap = ensureBuildingCap(ex);
    cap.buildProgress = 0;
    store.hp[slot] = Math.max(1, Math.floor(bdef.hp * 0.1));
  }
  // Building occupancy changes passability, so cached flow fields are stale.
  services.flow.invalidate();
  ctx?.events.push({ type: 'entitySpawned', id, defId, owner });
  return slot;
}

/** Reserve a tile footprint on the nav grid (walls block, gates are owner-passable). */
export function applyBuildingNav(
  state: GameState,
  services: StepContext['services'],
  slot: number,
): void {
  const store = state.entities;
  const bdef = services.registry.buildings.get(store.extras[slot]!.defId);
  if (!bdef) return;
  const { tx, ty } = buildingOrigin(store.posX[slot]!, store.posY[slot]!, bdef.footprint);
  const owner = store.ownerId(store.ownerIndex[slot]!);
  if (bdef.isGate) services.nav.setGate(tx, ty, bdef.footprint, owner);
  else services.nav.setBuildingBlock(tx, ty, bdef.footprint, true);
  services.flow.invalidate();
}

export function clearBuildingNav(
  state: GameState,
  services: StepContext['services'],
  slot: number,
): void {
  const store = state.entities;
  const bdef = services.registry.buildings.get(store.extras[slot]!.defId);
  if (!bdef) return;
  const { tx, ty } = buildingOrigin(store.posX[slot]!, store.posY[slot]!, bdef.footprint);
  if (bdef.isGate) services.nav.setGate(tx, ty, bdef.footprint, null);
  else services.nav.setBuildingBlock(tx, ty, bdef.footprint, false);
  services.flow.invalidate();
}

export function buildingOrigin(x: number, y: number, footprint: number): { tx: number; ty: number } {
  return {
    tx: Math.floor((x - (footprint * TILE) / 2) / TILE),
    ty: Math.floor((y - (footprint * TILE) / 2) / TILE),
  };
}

export function productionSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;
  let powerDirty = false;

  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    const ex = store.extras[slot]!;
    if (hasMorph(ex)) continue;
    const owner = store.ownerId(store.ownerIndex[slot]!);
    const player = getPlayer(state, owner);
    if (!player) continue;
    const bdef = registry.buildings.get(ex.defId);
    if (!bdef) continue;
    const rate = productionRate(state, registry, slot);
    const cap = ensureBuildingCap(ex);

    // ---- construction
    if (cap.buildProgress !== undefined) {
      const perTick = 1 / Math.max(1, bdef.buildTime * TICK_HZ);
      cap.buildProgress += perTick * rate;
      store.hp[slot] = Math.min(store.maxHp[slot]!, Math.max(1, store.maxHp[slot]! * cap.buildProgress));
      if (cap.buildProgress >= 1) {
        cap.buildProgress = undefined;
        store.hp[slot] = store.maxHp[slot]!;
        unlockTech(state, owner, ex.defId);
        ctx.events.push({ type: 'buildingComplete', id: store.id[slot]!, defId: ex.defId, owner });
        if (bdef.isSuperweapon && bdef.unlocksSpells) {
          for (const spellId of bdef.unlocksSpells) {
            const sdef = registry.spells.get(spellId);
            if (sdef && (player.spellCooldowns[spellId] ?? 0) <= 0) {
              player.spellCooldowns[spellId] = sdef.cooldownTicks;
            }
          }
        }
        if (bdef.spawnsFreeWisp) spawnFreeUnit(state, ctx, slot, 'wisp');
        powerDirty = true;
      }
      continue;
    }

    // ---- repair
    if (cap.repairing && store.hp[slot]! < store.maxHp[slot]!) {
      const balance = registry.balance;
      const hpNeeded = store.maxHp[slot]! - store.hp[slot]!;
      const hpGain = Math.min(hpNeeded, balance.repairHpPerTick * rate);
      const cost = hpGain * balance.repairManaPerHp;
      if (cost > 0 && player.mana >= cost) {
        player.mana -= cost;
        store.hp[slot] = Math.min(store.maxHp[slot]!, store.hp[slot]! + hpGain);
      } else if (player.mana < balance.repairHpPerTick * balance.repairManaPerHp) {
        cap.repairing = false;
      }
      if (store.hp[slot]! >= store.maxHp[slot]!) cap.repairing = false;
      continue;
    }

    // ---- unit queue
    const queue = getProductionQueue(ex);
    if (queue && queue.length) {
      const item = queue[0]!;
      item.progress += rate;
      if (item.progress >= item.required) {
        queue.shift();
        spawnFreeUnit(state, ctx, slot, item.defId);
      }
    }

    // ---- research queue
    const research = getResearchQueue(ex);
    if (research && research.length) {
      const item = research[0]!;
      item.progress += rate;
      if (item.progress >= item.required) {
        research.shift();
        if (!player.completedResearch.includes(item.defId)) player.completedResearch.push(item.defId);
      }
    }
  }

  if (powerDirty) recomputePower(state, registry);
}

function spawnFreeUnit(state: GameState, ctx: StepContext, buildingSlot: number, unitDefId: string): void {
  const store = state.entities;
  const udef = ctx.services.registry.units.get(unitDefId);
  if (!udef) return;
  const spawn = findSpawnPosition(state, ctx, buildingSlot, udef.radius);
  const slot = spawnUnitAt(
    state,
    ctx.services,
    unitDefId,
    store.ownerId(store.ownerIndex[buildingSlot]!),
    spawn.x,
    spawn.y,
    ctx,
  );
  if (slot < 0) return;
  const rally = getRally(store.extras[buildingSlot]!);
  if (rally) {
    store.extras[slot]!.orders = [{ type: 'move', x: rally.x, y: rally.y }];
    store.state[slot] = STATE_MOVING;
  } else {
    store.state[slot] = STATE_IDLE;
  }
}

export function findSpawnPosition(
  state: GameState,
  ctx: StepContext,
  buildingSlot: number,
  unitRadius: number,
): { x: number; y: number } {
  const store = state.entities;
  const dir = spawnDirection(state, buildingSlot);
  const baseDistance = store.radius[buildingSlot]! + unitRadius + 4;
  const baseX = store.posX[buildingSlot]! + dir.x * baseDistance;
  const baseY = store.posY[buildingSlot]! + dir.y * baseDistance;
  const step = unitRadius * 2 + 6;

  if (canSpawnAt(state, ctx, buildingSlot, baseX, baseY, unitRadius)) return { x: baseX, y: baseY };

  for (let ring = 1; ring <= SPAWN_RINGS; ring++) {
    const r = step * ring;
    for (let i = 0; i < SPAWN_DIRECTIONS; i++) {
      const angle = Math.atan2(dir.y, dir.x) + (Math.PI * 2 * i) / SPAWN_DIRECTIONS;
      const x = baseX + Math.cos(angle) * r;
      const y = baseY + Math.sin(angle) * r;
      if (canSpawnAt(state, ctx, buildingSlot, x, y, unitRadius)) return { x, y };
    }
  }

  const owner = store.ownerId(store.ownerIndex[buildingSlot]!);
  const nearest = ctx.services.nav.nearestPassableFor(
    baseX,
    baseY,
    unitRadius,
    TILE * 6,
    owner,
    state.relations,
  );
  return nearest ?? { x: baseX, y: baseY };
}

function spawnDirection(state: GameState, buildingSlot: number): { x: number; y: number } {
  const store = state.entities;
  const rally = getRally(store.extras[buildingSlot]!);
  if (!rally) return { x: 0, y: 1 };
  const dx = rally.x - store.posX[buildingSlot]!;
  const dy = rally.y - store.posY[buildingSlot]!;
  const d = Math.hypot(dx, dy);
  if (d < 1) return { x: 0, y: 1 };
  return { x: dx / d, y: dy / d };
}

function canSpawnAt(
  state: GameState,
  ctx: StepContext,
  buildingSlot: number,
  x: number,
  y: number,
  unitRadius: number,
): boolean {
  const store = state.entities;
  const owner = store.ownerId(store.ownerIndex[buildingSlot]!);
  if (ctx.services.nav.isBlockedDiscFor(x, y, unitRadius, owner, state.relations)) return false;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    const kind = store.kind[slot]!;
    if (kind !== KIND_UNIT && kind !== KIND_BUILDING) continue;
    if (kind === KIND_UNIT && garrisonedInId(store.extras[slot]!) !== undefined) continue;
    const minDist = unitRadius + store.radius[slot]!;
    const dx = x - store.posX[slot]!;
    const dy = y - store.posY[slot]!;
    if (dx * dx + dy * dy < minDist * minDist) return false;
  }
  return true;
}

/** Mark a building's def id as unlocked for its owner (idempotent). */
export function unlockTech(state: GameState, owner: string, defId: string): void {
  const player = getPlayer(state, owner);
  if (player && !player.unlockedTech.includes(defId)) player.unlockedTech.push(defId);
}

/** Production time in ticks for a unit def. */
export function buildTicksFor(seconds: number): number {
  return Math.round(seconds * TICK_HZ);
}

export type { EntityId };
export { resolveUnitStat };
