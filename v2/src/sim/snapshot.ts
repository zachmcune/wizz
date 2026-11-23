// STATE SNAPSHOT — serialise and restore a `GameState` so a peer can rejoin mid-match.
//
// WHY THIS EXISTS AT ALL. Lockstep peers normally stay in sync by replaying the same commands. That falls
// apart in two cases the Phase 6 brief calls out explicitly:
//
//   • a peer falls so far behind that replaying the backlog is slower than jumping forward;
//   • a peer disconnects and rejoins later, possibly minutes into the match.
//
// Both are solved the same way: the host serialises its state and the relay forwards it. Restoring it must
// reproduce a state that hashes identically to the host's, or the rejoin introduces the desync it was meant
// to fix. `tests/sim/snapshot.test.ts` asserts exactly that — serialise, restore, compare `hashState`.
//
// SERVICES ARE NOT SERIALISED. `SimServices` (nav grid, flow cache, spatial grid) is derived state that is
// rebuilt from the map and the entity set, so a snapshot never has to carry it. That keeps the payload to
// gameplay state only, which is both smaller and impossible to get inconsistent with the world it describes.

import type { GameState, Player, EntityId } from './types';
import { EntityStore, type EntityExtra } from './entity-store';
import type { Registry } from '../data/registry';
import { createServices, type SimServices } from './context';
import { buildingOrigin } from './systems/production';

/** Bumped when the serialised shape changes, so an old snapshot is rejected instead of half-read. */
export const SNAPSHOT_VERSION = 1;

interface SerializedExtra {
  defId: string;
  defIndex: number;
  orders: unknown[];
  cooldowns: Record<string, number>;
  buffs: EntityExtra['buffs'];
  caps: Record<string, unknown>;
}

interface SerializedEntity {
  id: number;
  ownerIndex: number;
  kind: number;
  dead: number;
  state: number;
  stance: number;
  posX: number;
  posY: number;
  velX: number;
  velY: number;
  facing: number;
  hp: number;
  maxHp: number;
  radius: number;
  amount: number;
  amountMax: number;
  extra: SerializedExtra;
}

export interface StateSnapshot {
  v: number;
  tick: number;
  seed: number;
  rng: Record<string, number>;
  players: Player[];
  relations: GameState['relations'];
  mapId: string;
  winnerTeam: number | null;
  ended: boolean;
  beams: GameState['beams'];
  oneSuperweaponPerPlayer: boolean;
  nextEntityId: number;
  ownerIds: string[];
  entities: SerializedEntity[];
}

export function serializeState(state: GameState): StateSnapshot {
  const store = state.entities;
  const entities: SerializedEntity[] = [];
  for (let i = 0; i < store.count; i++) {
    const ex = store.extras[i]!;
    entities.push({
      id: store.id[i]!,
      ownerIndex: store.ownerIndex[i]!,
      kind: store.kind[i]!,
      dead: store.dead[i]!,
      state: store.state[i]!,
      stance: store.stance[i]!,
      posX: store.posX[i]!,
      posY: store.posY[i]!,
      velX: store.velX[i]!,
      velY: store.velY[i]!,
      facing: store.facing[i]!,
      hp: store.hp[i]!,
      maxHp: store.maxHp[i]!,
      radius: store.radius[i]!,
      amount: store.amount[i]!,
      amountMax: store.amountMax[i]!,
      extra: {
        defId: ex.defId,
        defIndex: ex.defIndex,
        orders: ex.orders,
        cooldowns: ex.cooldowns,
        buffs: ex.buffs,
        caps: ex.caps,
      },
    });
  }

  return {
    v: SNAPSHOT_VERSION,
    tick: state.tick,
    seed: state.seed,
    rng: { ...state.rng },
    players: state.players,
    relations: state.relations,
    mapId: state.mapId,
    winnerTeam: state.winnerTeam,
    ended: state.ended,
    beams: state.beams,
    oneSuperweaponPerPlayer: state.oneSuperweaponPerPlayer,
    nextEntityId: state.nextEntityId,
    ownerIds: state.players.map((p) => p.id),
    entities,
  };
}

/**
 * Round-trip through JSON first.
 *
 * The snapshot travels over a WebSocket as JSON, so the object a peer restores is never the object the host
 * serialised — it has been through `JSON.stringify`/`parse`. Serialising to JSON here makes the snapshot
 * test exercise the real path. Without it a structured-clone-only difference (a `Map`, `undefined`, or a
 * `-0`) would pass locally and corrupt the live rejoin.
 */
export function encodeSnapshot(state: GameState): string {
  return JSON.stringify(serializeState(state));
}

export function decodeSnapshot(text: string): StateSnapshot {
  const snap = JSON.parse(text) as StateSnapshot;
  if (snap.v !== SNAPSHOT_VERSION) {
    throw new Error(`snapshot version ${String(snap.v)} is not supported (expected ${SNAPSHOT_VERSION})`);
  }
  return snap;
}

/** Rebuild a live `GameState` and its services from a snapshot. */
export function restoreState(
  registry: Registry,
  snap: StateSnapshot | string,
): { state: GameState; services: SimServices } {
  const s = typeof snap === 'string' ? decodeSnapshot(snap) : snap;
  const services = createServices(registry, s.mapId);

  const store = new EntityStore(Math.max(256, 1 << Math.ceil(Math.log2(Math.max(1, s.entities.length)))));
  store.setOwners(s.ownerIds);
  for (const e of s.entities) {
    /**
     * Rebuild through the store's own spawn paths so capacity growth, id ordering and the extras defaults
     * all behave exactly as they do in a live match. Writing the columns directly would duplicate that
     * logic and drift from it.
     */
    let slot: number;
    if (e.kind === 0) slot = store.spawnUnit(e.id, e.ownerIndex, e.extra.defId, e.extra.defIndex, e.posX, e.posY, e.hp, e.radius);
    else if (e.kind === 1) slot = store.spawnBuilding(e.id, e.ownerIndex, e.extra.defId, e.extra.defIndex, e.posX, e.posY, e.hp, e.radius);
    else if (e.kind === 2) slot = store.spawnProjectile(e.id, e.ownerIndex, e.extra.defId, e.extra.defIndex, e.posX, e.posY, e.facing);
    else slot = store.spawnResourceNode(e.id, e.posX, e.posY, e.radius, e.amount);

    store.dead[slot] = e.dead;
    store.state[slot] = e.state;
    store.stance[slot] = e.stance;
    store.velX[slot] = e.velX;
    store.velY[slot] = e.velY;
    store.facing[slot] = e.facing;
    store.maxHp[slot] = e.maxHp;
    store.amountMax[slot] = e.amountMax;
    if (e.kind !== 2) store.hp[slot] = e.hp;
    store.extras[slot] = {
      defId: e.extra.defId,
      defIndex: e.extra.defIndex,
      orders: e.extra.orders,
      cooldowns: e.extra.cooldowns,
      buffs: e.extra.buffs,
      caps: e.extra.caps,
    };
  }

  const state: GameState = {
    tick: s.tick,
    seed: s.seed,
    rng: { ...s.rng },
    players: s.players,
    relations: s.relations,
    entities: store,
    nextEntityId: s.nextEntityId,
    mapId: s.mapId,
    winnerTeam: s.winnerTeam as GameState['winnerTeam'],
    ended: s.ended,
    beams: s.beams,
    oneSuperweaponPerPlayer: s.oneSuperweaponPerPlayer,
  };

  /**
   * REBUILD THE NAVIGATION BLOCKS. `createServices` yields a nav grid with terrain only — no building
   * footprints — because a fresh match has no buildings yet. A restored state does, and the blocks are part of
   * pathing, `canPlace` and the turret/garrison target rules. Skipping this produced a restore whose state
   * HASH was identical (nothing blocking lives in `GameState`) but whose next tick diverged immediately:
   * units pathed straight through their own base. `tests/sim/snapshot.test.ts` caught it at step 0.
   *
   * Derived state is not serialised — it is re-derived here from the entities, which is exactly why keeping it
   * out of the snapshot is safe.
   */
  for (const e of s.entities) {
    if (e.dead || e.kind !== 1) continue;
    const slot = store.slotOf(e.id);
    if (slot < 0) continue;
    applyNavForBuilding(services, store, slot);
  }
  services.flow.invalidate();

  return { state, services };
}

/**
 * Register one building's footprint in the nav grid.
 *
 * Uses the canonical `buildingOrigin` from the production system rather than re-deriving the tile origin: the
 * offset formula is subtle (`x - footprint*TILE/2`, not `x - (footprint-1)/2*TILE`) and a copy would drift the
 * moment either side changed. Importing only that pure helper keeps the dependency acyclic.
 */
function applyNavForBuilding(services: SimServices, store: EntityStore, slot: number): void {
  const bdef = services.registry.buildings.get(store.extras[slot]!.defId);
  if (!bdef) return;
  const { tx, ty } = buildingOrigin(store.posX[slot]!, store.posY[slot]!, bdef.footprint);
  const owner = store.ownerId(store.ownerIndex[slot]!);
  if (bdef.isGate) services.nav.setGate(tx, ty, bdef.footprint, owner);
  else services.nav.setBuildingBlock(tx, ty, bdef.footprint, true);
}

/** Convenience for the desync/replay capture: the subset of state a bug report needs. */
export function snapshotDigest(state: GameState): {
  tick: number;
  entities: number;
  players: { id: string; mana: number; defeated: boolean }[];
  winnerTeam: number | null;
} {
  return {
    tick: state.tick,
    entities: state.entities.liveCount(),
    players: state.players.map((p) => ({ id: p.id, mana: Math.round(p.mana), defeated: p.defeated })),
    winnerTeam: state.winnerTeam,
  };
}

/** Entities owned by a player, for the desync report. */
export function ownedEntityIds(state: GameState, playerId: string): EntityId[] {
  const store = state.entities;
  const idx = store.ownerIndexFor(playerId);
  const out: EntityId[] = [];
  for (let s = 0; s < store.count; s++) {
    if (store.dead[s]) continue;
    if (store.ownerIndex[s] === idx) out.push(store.id[s]!);
  }
  return out;
}
