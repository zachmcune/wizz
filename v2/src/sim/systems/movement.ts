// Movement: flow-field steering plus local separation and collision.
//
// This is a "feel" system as much as a correctness one. Two rules drive the design:
//   1. Units in a group must not overlap or jitter — separation is applied before the move, and the
//      move itself slides along blocked axes rather than stopping dead.
//   2. A unit that cannot reach its exact goal must still make progress, so the goal is considered
//      reached within `TILE * 0.4` rather than at exact equality.
//
// The separation hash (a pair-keyed angle) is deterministic: it derives from the two entity ids, not
// from iteration order, so two perfectly-overlapping units always push apart the same way.

import { TICK_HZ, TILE } from '../../core/constants';
import type { StepContext } from '../context';
import type { GameState, EntityId } from '../types';
import {
  EntityStore,
  KIND_UNIT,
  STATE_ATTACKING,
  STATE_GARRISONED,
  STATE_IDLE,
  STATE_MOVING,
} from '../entity-store';
import {
  ensureGarrisonHost,
  garrisonedInId,
  getGarrisonHost,
  hasMorph,
  isChanneling,
} from '../capabilities';
import { makePathContext, moveTowardGoal, slidePosition, applyVelocityMove, steerToGoal } from '../pathing';
import { resolveUnitStat } from '../modifiers';
import { getPlayer } from '../queries';

const SEP_BLEND = 0.55;
/** Extra speed an overlapped unit may use to extricate itself, as a fraction of its walk speed. */
const SEP_OVERSPEED = 0.45;

export interface SeparationPush {
  x: number;
  y: number;
}

/**
 * Push that resolves one overlapping pair. Symmetric in the two ids so the result does not depend
 * on which entity is processed first; perfectly-coincident units are separated along a deterministic
 * pseudo-angle derived from their ids.
 */
/** How much wider than collision the separation radius is, so drawn sprites do not interpenetrate. */
const VISUAL_SEPARATION = 2.6;

/**
 * Deterministic formation offset for a unit ordered to a point.
 *
 * Units are laid out on concentric rings. The ring index and angle come from the entity id, so:
 *   • the same unit always takes the same slot (deterministic, replay-safe),
 *   • units spread across rings instead of stacking, and
 *   • two different groups ordering to the same point do not collide on the same slots, because their
 *     ids differ.
 *
 * `spacing` is the visual separation distance, so slots are far enough apart that drawn sprites do not
 * overlap on arrival.
 */
function formationSlot(id: EntityId, spacing: number): { x: number; y: number } {
  /**
   * A deterministic slot on a hex-ish lattice around the order point.
   *
   * Earlier this used three rings of 0/6/12 slots, which gives 18 distinct places and leaves the centre
   * crowded: a 40-unit group had no slot beyond radius 1.9 * spacing, and every unit without a slot
   * piled onto the middle.
   *
   * The slot is now a GRID cell indexed by a hash of the id. A grid rather than rings because:
   *   • it has unbounded capacity — any group size has distinct slots,
   *   • spacing is uniform, so no unit is starved of room, and
   *   • the centre cell is used at most once, which is the bug the ring version had.
   *
   * The grid is 5 wide with an alternating row offset, which packs bodies more tightly than a plain
   * square grid at the same visual spacing.
   */
  if (spacing <= 0) return { x: 0, y: 0 };
  const h = (Math.imul(id | 0, 2654435761) >>> 0) / 4294967296;
  /**
   * THE LATTICE MUST BE CENTRED ON THE ORDER POINT, IN BOTH AXES AND IN BOTH DIRECTIONS.
   *
   * `n` ranged over [0, 64) and `row = floor(n / COLS)` therefore reached row 12, so `y = row * spacing * 0.87 - 2 *
   * spacing * 0.87` produced offsets from **-1.74 to +8.70** slots: the formation extended five times further BELOW the
   * click than above it. Two consequences, both measured:
   *
   *   • an army ordered to a point gathered mostly underneath it, so any target it was sent to (a base, a ramp, a
   *     chokepoint) was approached from one side regardless of where the enemy actually was;
   *   • the spread depended on WHICH IDS were present. Ids are allocated per player in creation order, so the block
   *     belonging to the first-created player sat at a slightly different mean offset than the second player's
   *     (`audit/mirror4way.ts` measured the first-created player winning 12 of 12 mirrors).
   *
   * The lattice is now a centred block: rows are remapped from [0, 12] to [-6, +6], and the row offset is subtracted at
   * the true centre rather than an assumed one, so the mean slot offset is zero for a uniformly-sampled group. That makes
   * the formation neutral with respect to which ids a group happens to contain.
   */
  const n = Math.floor(h * 64);
  const COLS = 5;
  const ROWS = Math.ceil(64 / COLS); // 13 rows: n / 5 for n in [0, 64)
  const row = Math.floor(n / COLS);
  const col = n % COLS;
  const centredRow = row - (ROWS - 1) / 2;
  const x = (col - (COLS - 1) / 2) * spacing + (row % 2 === 0 ? 0 : spacing * 0.5);
  return { x, y: centredRow * spacing * 0.87 };
}

export function separationForPair(
  ax: number,
  ay: number,
  aRadius: number,
  aId: EntityId,
  bx: number,
  by: number,
  bRadius: number,
  bId: EntityId,
): SeparationPush {
  const ox = ax - bx;
  const oy = ay - by;
  const dd = Math.hypot(ox, oy);
  /**
   * VISUAL SEPARATION.
   *
   * Units are DRAWN at 2.9x their collision radius so they are legible on a phone, but separation used
   * the raw collision sum — so two units could sit 16 world units apart (collision-satisfied) while
   * their sprites, ~46 units wide, interpenetrated completely. Measured on a 52-unit fight at 667x375,
   * 92% of units overlapped another sprite.
   *
   * Sprites therefore need to keep sprite-sized distance. This multiplier makes the separation radius
   * track the drawn size, which is what makes a massed fight readable. It deliberately does NOT change
   * `radius` itself: hit boxes, splash radii and selection are untouched, so combat behaves identically.
   *
   * 2.6 rather than 2.9: the full drawn ratio leaves no overlap at all, which forces units into a
   * perfect grid and looks mechanical. 2.6 lets bodies touch at the edges the way an RTS crowd should,
   * while removing the deep interpenetration that made units unreadable.
   */
  const minDist = (aRadius + bRadius) * VISUAL_SEPARATION;
  if (dd >= minDist) return { x: 0, y: 0 };
  if (dd > 0) {
    const push = (minDist - dd) / minDist;
    return { x: (ox / dd) * push, y: (oy / dd) * push };
  }
  const low = Math.min(aId, bId);
  const high = Math.max(aId, bId);
  const angle = (((low * 73856093 + high * 19349663) >>> 0) % 360) * (Math.PI / 180);
  const sign = aId === low ? 1 : -1;
  return { x: Math.cos(angle) * sign, y: Math.sin(angle) * sign };
}

function isAir(store: EntityStore, registry: StepContext['services']['registry'], slot: number): boolean {
  if (store.kind[slot] !== KIND_UNIT) return false;
  return registry.units.get(store.extras[slot]!.defId)?.mobility === 'air';
}

/** Remove a unit's garrison reservation from every host (cheap: only hosts that have any). */
function clearGarrisonReservations(state: GameState, unitId: EntityId): void {
  const store = state.entities;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.kind[slot] !== 1) continue;
    const host = getGarrisonHost(store.extras[slot]!);
    if (!host?.garrisonReservedIds.length) continue;
    const filtered = host.garrisonReservedIds.filter((id: EntityId) => id !== unitId);
    if (filtered.length !== host.garrisonReservedIds.length) host.garrisonReservedIds = filtered;
  }
}

export function movementSystem(state: GameState, ctx: StepContext): void {
  const store = state.entities;
  const registry = ctx.services.registry;
  const nav = ctx.services.nav;
  const dt = 1 / TICK_HZ;
  const scratch: number[] = [];

  // ---- pass 1: ordered movement
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    const ex = store.extras[slot]!;

    if (store.state[slot] === STATE_GARRISONED || garrisonedInId(ex) !== undefined) {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }
    if (hasMorph(ex) || isChanneling(ex)) {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }
    /**
     * A CHASING UNIT IS MOVED BY THE COMBAT SYSTEM.
     *
     * `combat` walks a unit directly at the target it is attacking; this system walks it at `order + formationOffset`.
     * When both run, the two goals cancel and the unit makes no net progress -- measured on seed 1035: 32 attacking
     * units, none within weapon reach of the base, closing at ~0 despite valid attack orders.
     *
     * `STATE_ATTACKING` is set by `chase` precisely to say "movement is already handled this tick", so skip here.
     */
    /**
     * A CHASING UNIT IS MOVED BY COMBAT — BUT ONLY WHILE IT IS ACTUALLY CHASING.
     *
     * `combat` moves a unit directly at the target it has acquired, and this system skips such a unit so the two do not cancel
     * (see the note below). The bug: `chase` only runs when a target is within reach, so a unit left in STATE_ATTACKING with NO
     * target had neither system move it and froze permanently.
     *
     * Measured: an easy AI's rift_familiar sat at (506,604) for **200 consecutive ticks** with a valid `attackMove` to the enemy
     * base and `state = ATTACKING`, while the base it was ordered to attack was 3000 units away and not yet in weapon range. Every
     * one of that side's units did the same, so a 17-unit army never reached a 7-building base and the match ran 45 minutes without
     * resolving.
     *
     * A unit is now only skipped when it genuinely holds an attack target; otherwise normal order-driven movement resumes and it
     * closes the distance itself.
     */
    const attackOrder = ex.orders[0] as { type?: string; targetId?: number } | undefined;
    const hasAttackTarget =
      attackOrder?.type === 'attack' && attackOrder.targetId !== undefined && store.slotOf(attackOrder.targetId as EntityId) >= 0;
    if (store.state[slot] === STATE_ATTACKING && hasAttackTarget) {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }
    if (store.state[slot] === STATE_ATTACKING && !hasAttackTarget) {
      // No target to chase: hand the unit back to its order so it keeps marching.
      store.state[slot] = STATE_MOVING;
    }

    const order = ex.orders[0] as
      | { type: 'move' | 'attackMove' | 'moveInOrder'; x: number; y: number; groupSpeed?: number }
      | { type: 'garrison'; buildingId: EntityId }
      | { type: 'attack'; targetId: EntityId }
      | { type: 'harvest'; nodeId?: EntityId }
      | { type: 'hold' }
      | undefined;
    if (!order) {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }

    /**
     * ONLY ORDERS THAT CARRY A DESTINATION MAY REACH THE STEERING CODE BELOW.
     *
     * The steering path reads `order.x`/`order.y` unconditionally. `harvest`, `attack`, `channel` and `hold` orders
     * carry no coordinates, so a harvesting worker fell straight through into it and computed
     * `goalX = undefined + slot2.x`, i.e. **NaN**. `Math.hypot(NaN, NaN)` is NaN, every `>`/`<=` comparison against
     * NaN is false, so the NaN sailed past the arrival check, past the overspeed clamp, and into `store.velX/velY`
     * AND `store.facing` via `Math.atan2`.
     *
     * Measured with `audit/nan-guard.ts` on seed 1000: **282,204 non-finite values** in one match, first at tick 19 on
     * the starting wisps, and the poison then spreads to `facing` because `applyVelocityMove` derives it from the same
     * vector. `facing` IS in the lockstep hash, so this makes every hash containing a harvesting unit depend on NaN
     * bits — the one thing the hash exists to make impossible — and it draws every worker at a garbage orientation.
     *
     * Harvest movement is owned by `harvestSystem`, attack chasing by `combatSystem` (both run after this one). So the
     * correct behaviour here is to leave such a unit alone rather than to invent a goal for it.
     */
    if (order.type === 'harvest' || order.type === 'attack' || order.type === 'hold') {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }

    const owner = store.ownerId(store.ownerIndex[slot]!);
    const player = getPlayer(state, owner);
    const udef = registry.units.get(ex.defId);
    if (!player || !udef) continue;

    let speed = resolveUnitStat(state, registry, player, udef, 'speed', slot);
    if (order.type === 'moveInOrder' && order.groupSpeed !== undefined) speed = order.groupSpeed;

    const flying = isAir(store, registry, slot);
    const pathCtx = makePathContext(nav, ctx.services.flow, state.relations, owner, flying);

    // Garrison walk-in resolves to an occupancy handoff, not a position.
    if (order.type === 'garrison') {
      const hostSlot = store.slotOf(order.buildingId);
      if (hostSlot < 0 || store.kind[hostSlot] !== 1 || store.dead[hostSlot]) {
        clearGarrisonReservations(state, store.id[slot]!);
        ex.orders.shift();
        store.state[slot] = STATE_IDLE;
        store.velX[slot] = 0;
        store.velY[slot] = 0;
        continue;
      }
      const dx = store.posX[hostSlot]! - store.posX[slot]!;
      const dy = store.posY[hostSlot]! - store.posY[slot]!;
      const d = Math.hypot(dx, dy);
      if (d <= store.radius[slot]! + store.radius[hostSlot]! + 8) {
        clearGarrisonReservations(state, store.id[slot]!);
        const host = ensureGarrisonHost(store.extras[hostSlot]!);
        if (!host.garrisonedIds.includes(store.id[slot]!)) host.garrisonedIds.push(store.id[slot]!);
        // The garrison capability lives on the unit.
        store.extras[slot]!.caps.garrisonable = { garrisonedIn: store.id[hostSlot]! };
        store.posX[slot] = store.posX[hostSlot]!;
        store.posY[slot] = store.posY[hostSlot]!;
        store.velX[slot] = 0;
        store.velY[slot] = 0;
        ex.orders.length = 0;
        store.state[slot] = STATE_GARRISONED;
        continue;
      }
      const res = moveTowardGoal(
        store.posX[slot]!,
        store.posY[slot]!,
        pathCtx,
        { x: store.posX[hostSlot]!, y: store.posY[hostSlot]! },
        speed,
        dt,
        store.radius[slot]!,
      );
      if (res.result.moved) {
        store.posX[slot] = res.result.x;
        store.posY[slot] = res.result.y;
      }
      continue;
    }

    /**
     * FORMATION OFFSET — every unit in a group gets its OWN slot around the order point.
     *
     * Previously every unit steered at the exact same (x, y). Separation alone could not resolve that:
     * it pushes units apart while steering pulls them all back to one point, so a 40-unit attack-move
     * settled into a heap with most bodies overlapping (measured 31% deeply interpenetrating).
     *
     * Each unit is now assigned a deterministic ring slot based on its id, so a group forms a block
     * roughly two ranks deep around the destination. The slot is a property of the unit, not of
     * iteration order, so the whole thing stays deterministic and replay-safe.
     */
    const slot2 = formationSlot(store.id[slot]!, (store.radius[slot] ?? 8) * VISUAL_SEPARATION);
    /**
     * DEFENSIVE FINITE CHECK. The order-type guard above is the fix; this is the tripwire that stops a future order
     * shape from silently poisoning velocity and facing again. It throws instead of continuing, because a NaN here is a
     * programming error in the order vocabulary, not a gameplay condition — and a loud failure at the tick it happens is
     * worth far more than a hash that quietly contains NaN bits for the rest of the match.
     */
    if (!Number.isFinite(order.x) || !Number.isFinite(order.y)) {
      throw new Error(
        `movementSystem: ${order.type} order for entity ${store.id[slot]} (${ex.defId}) has a non-finite destination`,
      );
    }
    const goalX = order.x + slot2.x;
    const goalY = order.y + slot2.y;
    const dx = goalX - store.posX[slot]!;
    const dy = goalY - store.posY[slot]!;
    const d = Math.hypot(dx, dy);
    if (d <= TILE * 0.4) {
      ex.orders.shift();
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      if (ex.orders.length === 0 && store.state[slot] === STATE_MOVING) store.state[slot] = STATE_IDLE;
      continue;
    }

    // Separation from neighbours, applied as an extra steering term.
    let sepX = 0;
    let sepY = 0;
    // Query radius must cover the VISUAL separation distance (2.6x radius sum), or neighbours that
    // should be pushed apart are never returned and the multiplier has no effect.
    const neighbours = ctx.services.spatial.queryRadius(
      store.posX[slot]!,
      store.posY[slot]!,
      store.radius[slot]! * 3 * VISUAL_SEPARATION,
      scratch,
    );
    for (const other of neighbours) {
      if (other === slot) continue;
      if (store.kind[other] !== KIND_UNIT) continue;
      if (isAir(store, registry, other) !== flying) continue;
      const push = separationForPair(
        store.posX[slot]!,
        store.posY[slot]!,
        store.radius[slot]!,
        store.id[slot]!,
        store.posX[other]!,
        store.posY[other]!,
        store.radius[other]!,
        store.id[other]!,
      );
      sepX += push.x;
      sepY += push.y;
    }

    // Primary steering, then separation blended in. The blend is capped so separation can never
    // overwhelm the path direction and push a unit away from its goal.
    const baseSteer = steerToGoal(
      makePathContext(nav, ctx.services.flow, state.relations, owner, flying),
      { x: store.posX[slot]!, y: store.posY[slot]! },
      { x: goalX, y: goalY },
      // One flow field per ORDER, not per unit: the formation slot only varies the final approach.
      { x: order.x, y: order.y },
    );
    let moveX = baseSteer.x * speed + sepX * speed * SEP_BLEND;
    let moveY = baseSteer.y * speed + sepY * speed * SEP_BLEND;

    if (moveX === 0 && moveY === 0) {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
      continue;
    }

    /**
     * Clamp, but allow a modest overspeed when units are deeply overlapped.
     *
     * The old clamp limited the combined steering+separation vector to exactly `speed`. When many units
     * share a destination their steering vectors all point the same way, so the separation term was
     * normalised away and the crowd never resolved — measured as 85% of units still interpenetrating
     * after four seconds in an 84-unit pile.
     *
     * `SEP_OVERSPEED` lets an overlapping unit briefly move up to 45% faster than its walk speed. It is
     * bounded and only applies while `sepMag` is non-zero, so an unobstructed unit is unaffected and no
     * unit can chase anything down with it.
     */
    const sepMag = Math.hypot(sepX, sepY);
    const cap = speed * (1 + Math.min(1, sepMag) * SEP_OVERSPEED);
    const mag = Math.hypot(moveX, moveY);
    if (mag > cap) {
      moveX = (moveX / mag) * cap;
      moveY = (moveY / mag) * cap;
    }

    const res = applyVelocityMove(
      store.posX[slot]!,
      store.posY[slot]!,
      moveX,
      moveY,
      pathCtx,
      dt,
      undefined,
      store.radius[slot]!,
    );
    if (res.moved) {
      store.posX[slot] = res.x;
      store.posY[slot] = res.y;
      store.velX[slot] = moveX;
      store.velY[slot] = moveY;
      if (res.facing !== 0) store.facing[slot] = res.facing;
    } else {
      store.velX[slot] = 0;
      store.velY[slot] = 0;
    }
  }

  // ---- pass 2: idle separation so stacked units spread out without orders
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    const ex = store.extras[slot]!;
    if (ex.orders.length > 0 || isChanneling(ex) || store.state[slot] === STATE_GARRISONED) continue;
    const owner = store.ownerId(store.ownerIndex[slot]!);
    const flying = isAir(store, registry, slot);
    const pathCtx = makePathContext(nav, ctx.services.flow, state.relations, owner, flying);
    const neighbours = ctx.services.spatial.queryRadius(
      store.posX[slot]!,
      store.posY[slot]!,
      store.radius[slot]! * 2.5 * VISUAL_SEPARATION,
      scratch,
    );
    let sepX = 0;
    let sepY = 0;
    for (const other of neighbours) {
      if (other === slot) continue;
      if (store.kind[other] !== KIND_UNIT) continue;
      if (isAir(store, registry, other) !== flying) continue;
      const push = separationForPair(
        store.posX[slot]!,
        store.posY[slot]!,
        store.radius[slot]!,
        store.id[slot]!,
        store.posX[other]!,
        store.posY[other]!,
        store.radius[other]!,
        store.id[other]!,
      );
      sepX += push.x;
      sepY += push.y;
    }
    if (sepX === 0 && sepY === 0) continue;
    /**
     * Idle resolution speed.
     *
     * At 8 units/sec a dense 80-unit spawn resolved from 95% to only 82% overlapping over FIFTEEN
     * seconds — visible in a screenshot as a permanent pile. The push is normalised by the overlap
     * fraction, so units move proportionally to how deeply they interpenetrate; raising the rate makes
     * crowds fan out in about a second without letting a single unit teleport. This affects only units
     * with no orders, so it cannot disturb combat positioning or pathing.
     */
    const IDLE_SEPARATION_SPEED = 26;
    const slid = slidePosition(
      pathCtx,
      store.posX[slot]!,
      store.posY[slot]!,
      store.posX[slot]! + sepX * IDLE_SEPARATION_SPEED * dt,
      store.posY[slot]! + sepY * IDLE_SEPARATION_SPEED * dt,
      store.radius[slot]!,
    );
    if (slid) {
      store.posX[slot] = slid.x;
      store.posY[slot] = slid.y;
    }
  }
}

