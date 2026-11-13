// Entity storage: Structure-of-Arrays with a dead mask and stable compaction.
//
// Why SoA instead of v1's `Map<EntityId, Entity>`:
//   v1's `entitiesSorted()` allocated a fresh array and sorted it on EVERY call, and it was called
//   33 times (21 of them inside per-tick systems). At 187 entities that measured 6.995 ms/tick —
//   14 % of the 20 Hz budget — before any rendering. Here, iteration is a linear scan over typed
//   arrays with zero allocation, and ordering is guaranteed by construction instead of by sorting.
//
// Determinism guarantees:
//   • Ids are appended monotonically, so slot index order == ascending id order. Systems that
//     iterate forward therefore visit entities in id order, with no sort.
//   • Removal sets a dead flag; compaction is a STABLE in-place filter, so relative order is kept.
//   • Compaction runs at most once per tick, at a defined point (end of the step), so the slot
//     layout at any tick boundary is a deterministic function of the history.
//
// Variable-size per-entity data (orders, buffs, capability payloads) lives in a parallel array of
// objects (`extras`). Most systems never touch it, so it does not pollute the hot numeric columns.

import type { RngStates, SuperweaponBeam } from './types';

export const ENTITY_CAPACITY_START = 256;
/** Hard ceiling. 4 players × 90 units + buildings + projectiles + nodes fits well inside this. */
export const ENTITY_CAPACITY_MAX = 4096;

export const KIND_UNIT = 0;
export const KIND_BUILDING = 1;
export const KIND_PROJECTILE = 2;
export const KIND_RESOURCE_NODE = 3;

export const STATE_IDLE = 0;
export const STATE_MOVING = 1;
export const STATE_ATTACKING = 2;
export const STATE_HARVESTING = 3;
export const STATE_RETURNING = 4;
export const STATE_CHANNELING = 5;
export const STATE_PRODUCING = 6;
export const STATE_BUILDING = 7;
export const STATE_GARRISONED = 8;
export const STATE_DEAD = 9;

export const STANCE_AGGRESSIVE = 0;
export const STANCE_HOLD = 1;
export const STANCE_STANDGROUND = 2;

export const UNIT_STATE_NAMES = [
  'idle',
  'moving',
  'attacking',
  'harvesting',
  'returning',
  'channeling',
  'producing',
  'building',
  'garrisoned',
  'dead',
] as const;

export const STANCE_NAMES = ['aggressive', 'hold', 'standground'] as const;

/**
 * Everything that is not a fixed-width numeric column. Kept as a parallel array so the hot
 * columns stay contiguous. Fields are optional and filled in by the systems that own them.
 */
export interface EntityExtra {
  /** Def id string. Interned to a numeric `defIndex` for hot comparisons. */
  defId: string;
  defIndex: number;
  /** Order queue; index 0 is the active order (v1 semantics). */
  orders: unknown[];
  /** cooldown key -> ticks remaining. */
  cooldowns: Record<string, number>;
  buffs: { kind: string; expiresTick: number; moveFactor?: number; attackCooldownFactor?: number }[];
  /** Capability payloads (harvester, production, garrison, morph, ...). Set by Phase 2 systems. */
  caps: Record<string, unknown>;
}

function makeExtra(defId = '', defIndex = -1): EntityExtra {
  return { defId, defIndex, orders: [], cooldowns: {}, buffs: [], caps: {} };
}

export class EntityStore {
  capacity: number;
  /** Number of slots in use, including dead slots not yet compacted. */
  count = 0;
  private deadSlots = 0;

  id: Int32Array;
  ownerIndex: Int16Array;
  kind: Uint8Array;
  dead: Uint8Array;
  state: Uint8Array;
  stance: Uint8Array;

  posX: Float64Array;
  posY: Float64Array;
  velX: Float64Array;
  velY: Float64Array;
  facing: Float64Array;
  hp: Float64Array;
  maxHp: Float64Array;
  radius: Float64Array;

  /** Resource-node amount remaining (0 for non-nodes). */
  amount: Float64Array;
  amountMax: Float64Array;

  /** Player id string per entity owner (mirrors ownerIndex for cheap mapping). */
  private ownerIds: string[] = [];

  extras: EntityExtra[];

  constructor(capacity = ENTITY_CAPACITY_START) {
    this.capacity = capacity;
    this.id = new Int32Array(capacity);
    this.ownerIndex = new Int16Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.dead = new Uint8Array(capacity);
    this.state = new Uint8Array(capacity);
    this.stance = new Uint8Array(capacity);
    this.posX = new Float64Array(capacity);
    this.posY = new Float64Array(capacity);
    this.velX = new Float64Array(capacity);
    this.velY = new Float64Array(capacity);
    this.facing = new Float64Array(capacity);
    this.hp = new Float64Array(capacity);
    this.maxHp = new Float64Array(capacity);
    this.radius = new Float64Array(capacity);
    this.amount = new Float64Array(capacity);
    this.amountMax = new Float64Array(capacity);
    this.extras = Array.from({ length: capacity }, () => makeExtra());
  }

  /** Register player ids so owner index ↔ id mapping is stable and comparable. */
  setOwners(ids: readonly string[]): void {
    this.ownerIds = [...ids];
  }

  ownerId(index: number): string {
    return this.ownerIds[index] ?? '';
  }

  ownerIndexFor(id: string): number {
    const i = this.ownerIds.indexOf(id);
    return i;
  }

  private grow(): void {
    if (this.capacity >= ENTITY_CAPACITY_MAX) {
      throw new Error(
        `Entity capacity ${ENTITY_CAPACITY_MAX} exceeded — content or spawn logic is over budget`,
      );
    }
    const next = Math.min(this.capacity * 2, ENTITY_CAPACITY_MAX);
    const copy = <T extends Int32Array | Int16Array | Uint8Array | Float64Array>(src: T, make: (n: number) => T): T => {
      const dst = make(next);
      (dst as unknown as { set: (a: ArrayLike<number>, o?: number) => void }).set(src as unknown as ArrayLike<number>, 0);
      return dst;
    };
    this.id = copy(this.id, (n) => new Int32Array(n));
    this.ownerIndex = copy(this.ownerIndex, (n) => new Int16Array(n));
    this.kind = copy(this.kind, (n) => new Uint8Array(n));
    this.dead = copy(this.dead, (n) => new Uint8Array(n));
    this.state = copy(this.state, (n) => new Uint8Array(n));
    this.stance = copy(this.stance, (n) => new Uint8Array(n));
    this.posX = copy(this.posX, (n) => new Float64Array(n));
    this.posY = copy(this.posY, (n) => new Float64Array(n));
    this.velX = copy(this.velX, (n) => new Float64Array(n));
    this.velY = copy(this.velY, (n) => new Float64Array(n));
    this.facing = copy(this.facing, (n) => new Float64Array(n));
    this.hp = copy(this.hp, (n) => new Float64Array(n));
    this.maxHp = copy(this.maxHp, (n) => new Float64Array(n));
    this.radius = copy(this.radius, (n) => new Float64Array(n));
    this.amount = copy(this.amount, (n) => new Float64Array(n));
    this.amountMax = copy(this.amountMax, (n) => new Float64Array(n));
    for (let i = this.capacity; i < next; i++) this.extras.push(makeExtra());
    this.capacity = next;
  }

  /**
   * Append an entity. Returns its slot index. Ids must be strictly increasing so that slot order
   * stays equal to id order (the determinism guarantee at the top of this file).
   */
  private append(id: number, ownerIndex: number, kind: number, defId: string, defIndex: number): number {
    if (this.count >= this.capacity) this.grow();
    if (this.count > 0 && id <= this.id[this.count - 1]!) {
      throw new Error(`Entity ids must be strictly increasing: got ${id} after ${this.id[this.count - 1]!}`);
    }
    const i = this.count++;
    this.id[i] = id;
    this.ownerIndex[i] = ownerIndex;
    this.kind[i] = kind;
    this.dead[i] = 0;
    this.state[i] = STATE_IDLE;
    this.stance[i] = STANCE_AGGRESSIVE;
    this.posX[i] = 0;
    this.posY[i] = 0;
    this.velX[i] = 0;
    this.velY[i] = 0;
    this.facing[i] = 0;
    this.hp[i] = 1;
    this.maxHp[i] = 1;
    this.radius[i] = 0;
    this.amount[i] = 0;
    this.amountMax[i] = 0;
    this.extras[i] = makeExtra(defId, defIndex);
    return i;
  }

  spawnUnit(
    id: number,
    ownerIndex: number,
    defId: string,
    defIndex: number,
    x: number,
    y: number,
    hp: number,
    radius: number,
  ): number {
    const i = this.append(id, ownerIndex, KIND_UNIT, defId, defIndex);
    this.posX[i] = x;
    this.posY[i] = y;
    this.hp[i] = hp;
    this.maxHp[i] = hp;
    this.radius[i] = radius;
    return i;
  }

  spawnBuilding(
    id: number,
    ownerIndex: number,
    defId: string,
    defIndex: number,
    x: number,
    y: number,
    hp: number,
    radius: number,
  ): number {
    const i = this.append(id, ownerIndex, KIND_BUILDING, defId, defIndex);
    this.posX[i] = x;
    this.posY[i] = y;
    this.hp[i] = hp;
    this.maxHp[i] = hp;
    this.radius[i] = radius;
    return i;
  }

  spawnProjectile(
    id: number,
    ownerIndex: number,
    defId: string,
    defIndex: number,
    x: number,
    y: number,
    facing: number,
  ): number {
    const i = this.append(id, ownerIndex, KIND_PROJECTILE, defId, defIndex);
    this.posX[i] = x;
    this.posY[i] = y;
    this.facing[i] = facing;
    this.hp[i] = 1;
    this.maxHp[i] = 1;
    this.radius[i] = 3;
    return i;
  }

  spawnResourceNode(id: number, x: number, y: number, radius: number, amount: number): number {
    const i = this.append(id, -1, KIND_RESOURCE_NODE, 'mana_node', -1);
    this.posX[i] = x;
    this.posY[i] = y;
    this.radius[i] = radius;
    this.amount[i] = amount;
    this.amountMax[i] = amount;
    this.hp[i] = 1;
    this.maxHp[i] = 1;
    return i;
  }

  /** Mark a slot dead. Compaction happens later, in `compact()`. */
  kill(i: number): void {
    if (this.dead[i]) return;
    this.dead[i] = 1;
    this.state[i] = STATE_DEAD;
    this.deadSlots++;
  }

  isAliveSlot(i: number): boolean {
    if (this.dead[i]) return false;
    if (this.kind[i] === KIND_RESOURCE_NODE) return this.amount[i]! > 0;
    return this.hp[i]! > 0;
  }

  /** Slot index for an entity id, or -1. Binary search — ids are ascending by construction. */
  slotOf(id: number): number {
    let lo = 0;
    let hi = this.count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = this.id[mid]!;
      if (v === id) return mid;
      if (v < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  /** Number of dead slots awaiting compaction. */
  deadCount(): number {
    return this.deadSlots;
  }

  /** Number of live entities (dead slots and depleted resource nodes excluded). */
  liveCount(): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) if (this.isAliveSlot(i)) n++;
    return n;
  }

  /**
   * Stable in-place compaction: removes dead slots while preserving relative order.
   * Called once per tick from the step, so slot layout is deterministic at tick boundaries.
   */
  compact(): void {
    if (this.deadSlots === 0) return;
    let write = 0;
    for (let read = 0; read < this.count; read++) {
      if (this.dead[read] === 1) continue;
      if (read !== write) this.moveSlot(read, write);
      write++;
    }
    this.count = write;
    this.deadSlots = 0;
  }

  private moveSlot(from: number, to: number): void {
    this.id[to] = this.id[from]!;
    this.ownerIndex[to] = this.ownerIndex[from]!;
    this.kind[to] = this.kind[from]!;
    this.dead[to] = this.dead[from]!;
    this.state[to] = this.state[from]!;
    this.stance[to] = this.stance[from]!;
    this.posX[to] = this.posX[from]!;
    this.posY[to] = this.posY[from]!;
    this.velX[to] = this.velX[from]!;
    this.velY[to] = this.velY[from]!;
    this.facing[to] = this.facing[from]!;
    this.hp[to] = this.hp[from]!;
    this.maxHp[to] = this.maxHp[from]!;
    this.radius[to] = this.radius[from]!;
    this.amount[to] = this.amount[from]!;
    this.amountMax[to] = this.amountMax[from]!;
    const ex = this.extras[to]!;
    this.extras[to] = this.extras[from]!;
    this.extras[from] = ex;
  }
}

/** Serialisable snapshot of state that is not in the typed columns (for hash + save). */
export interface EntitySerializableState {
  beams: SuperweaponBeam[];
  rng: RngStates;
}
