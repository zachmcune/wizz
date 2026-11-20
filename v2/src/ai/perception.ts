// PERCEIVED WORLD — the ONLY input an AI decision is allowed to see.
//
// The v1 AI read `state.entities` directly at every difficulty, which is why every difficulty was
// omniscient: it knew where your base was before scouting, tracked units through fog, and could not be
// surprised. That is not a tuning problem, it is an architecture problem, and adding "don't cheat" checks
// to hand-written AI code cannot fix it — there is always one more place that reads the raw array.
//
// So the AI never receives the raw `GameState`. Everything it knows comes through this façade, which is
// built each tick from:
//
//   * the player's own entities                          (always known)
//   * allied entities                                    (always known — teams share sight)
//   * resource nodes                                     (always known, they are terrain features)
//   * enemy entities inside live sight                   (from `player.visible`)
//   * enemy BUILDINGS remembered out of sight            (the fog ghosts the renderer draws)
//
// Enemy units that leave sight are forgotten, exactly as the player's own screen forgets them — there is
// no unit ghost, so an AI cannot track an army through fog. Enemy buildings persist as ghosts, which is
// what a human sees.
//
// `tests/phase5-fog.test.ts` proves the façade cannot leak: it builds a `GameState` whose hidden entities
// are replaced with throwing proxies, so any read of hidden state from AI code throws during a full match.

import type { Registry } from '../data/registry';
import type { BuildingDef, UnitDef } from '../data/defs';
import type { GameState, Player, PlayerId, EntityId, TeamId } from '../sim/types';
import { KIND_BUILDING, KIND_RESOURCE_NODE, KIND_UNIT, STATE_HARVESTING, STATE_IDLE, STATE_RETURNING } from '../sim/entity-store';
import { MAX_UNITS_PER_PLAYER } from '../core/constants';
import type { SimServices } from '../sim/context';
import { isAlly, isEnemy, ownerOf } from '../sim/queries';
import { isBuildingInLiveSight, isTileVisible, radarActive } from '../sim/fog';
import { isPowerShort, powerDeficit } from '../sim/power';
import { buildProgressOf, getHarvester } from '../sim/capabilities';

// --------------------------------------------------------------------------------------- view types

export interface SeenUnit {
  id: EntityId;
  owner: PlayerId;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** The weapon def, resolved from the registry. Null for unarmed units. */
  weapon: UnitDef['weapon'];
  armor: 'light' | 'heavy' | 'building';
  radius: number;
  speed: number;
  /** True when this is one of OUR units (or an ally's), false for an enemy sighting. */
  friendly: boolean;
  /**
   * Our own unit's current activity. Only populated for FRIENDLY units — an enemy's orders are not
   * observable, and inventing them would be a hidden-state read.
   *
   * This exists so the economy planner can tell "this worker is already hauling" from "this worker is
   * standing still". An earlier version guessed idleness from position, re-tasked every worker on every
   * pass, and thereby reset the harvest order continuously — the workers never completed a single trip and
   * the AI's income was zero while it looked busy.
   */
  activity?: 'idle' | 'harvesting' | 'returning' | 'moving' | 'busy';
  /** Cargo held, for friendly harvesters. */
  carry?: number;
  carryMax?: number;
  /**
   * The mana node this worker is currently assigned to, for friendly harvesters.
   *
   * Our own units' orders are ours to know — the same information the player's UI shows in the unit panel. This
   * is what lets the economy planner put each worker on a DIFFERENT node instead of stacking the whole economy
   * on whichever crystal happens to be nearest.
   */
  harvestNodeId?: EntityId;
}

export interface SeenBuilding {
  id: EntityId;
  owner: PlayerId;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Undefined when the building is complete. A number means it is still going up. */
  buildProgress?: number;
  /** True when we can see it right now; false when it is a remembered ghost. */
  live: boolean;
  friendly: boolean;
}

export interface SeenNode {
  id: EntityId;
  x: number;
  y: number;
  remaining: number;
}

export interface SeenEnemyPlayer {
  id: PlayerId;
  team: TeamId;
  /** True once we have seen any of their buildings — i.e. we know where they live. */
  located: boolean;
}

/**
 * The tick-by-tick picture the AI reasons over. Every array is derived from `PerceivedWorld.build`, so a
 * planner that reads only this cannot know anything the player could not see.
 */
export interface Perception {
  playerId: PlayerId;
  team: TeamId;
  tick: number;
  /** Our own state — fully known, because it is ours. */
  mana: number;
  power: number;
  powerUsed: number;
  powerShort: boolean;
  powerDeficit: number;
  supplyUsed: number;
  supplyCap: number;
  defeated: boolean;
  /** Ids of techs (building defIds) and researches we have completed. */
  unlockedTech: ReadonlySet<string>;
  completedResearch: ReadonlySet<string>;
  factionId: string;

  /** Our units. */
  myUnits: SeenUnit[];
  /** Our buildings, complete and under construction. */
  myBuildings: SeenBuilding[];
  /** Enemy units currently in sight. Units that leave sight vanish — no tracking through fog. */
  enemyUnits: SeenUnit[];
  /** Enemy buildings in live sight PLUS remembered ghosts. `live` distinguishes them. */
  enemyBuildings: SeenBuilding[];
  /** Resource nodes, which are terrain and always known. */
  nodes: SeenNode[];
  /** Opposing players we know exist. */
  enemies: SeenEnemyPlayer[];
  /** Our allies (excluding ourselves). */
  allies: SeenEnemyPlayer[];

  /** Tiles currently in sight, as a `Set` of `ty * mapW + tx`. */
  visibleTiles: ReadonlySet<number>;
  /** Tiles seen at least once. */
  exploredTiles: ReadonlySet<number>;
  mapW: number;
  mapH: number;
  /** True when a powered radar building is up. */
  radar: boolean;
}

// ------------------------------------------------------------------------------------------ the façade

export class PerceivedWorld {
  /**
   * `services` only — never the raw state. That asymmetry is the point: the façade is constructed once per
   * brain, and each `build(state, playerId)` call receives the state for exactly one tick and returns only
   * the observable projection of it. Nothing retains the state, so nothing can hold a reference to hidden
   * data and read it later.
   */
  constructor(private readonly services: SimServices) {}

  private get registry(): Registry {
    return this.services.registry;
  }

  /** Map dimensions come from the nav grid, which is the sim's own authority on them. */
  private get nav(): { w: number; h: number } {
    return { w: this.services.nav.w, h: this.services.nav.h };
  }

  /** Build the perception for one player. This is the only way AI code gets world information. */
  build(st: GameState, playerId: PlayerId): Perception {
    const registry = this.registry;
    const me = st.players.find((p) => p.id === playerId);
    if (!me) throw new Error(`PerceivedWorld: unknown player ${playerId}`);

    const nav = this.nav;
    const store = st.entities;

    const myUnits: SeenUnit[] = [];
    const myBuildings: SeenBuilding[] = [];
    const enemyUnits: SeenUnit[] = [];
    const enemyBuildings: SeenBuilding[] = [];
    const nodes: SeenNode[] = [];

    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot]) continue;
      const kind = store.kind[slot]!;
      const owner = ownerOf(st, slot);
      const defId = store.extras[slot]!.defId;
      const friendly = owner === playerId || isAlly(st, playerId, owner);

      if (kind === KIND_RESOURCE_NODE) {
        nodes.push({
          id: store.id[slot]!,
          x: store.posX[slot]!,
          y: store.posY[slot]!,
          remaining: store.amount[slot]!,
        });
        continue;
      }

      if (kind === KIND_UNIT) {
        if (friendly) {
          myUnits.push(this.unitView(st, slot, owner, defId, true));
        } else if (this.canSee(st, slot, playerId, nav)) {
          enemyUnits.push(this.unitView(st, slot, owner, defId, false));
        }
        // Enemy units out of sight are simply not listed — no memory, no tracking.
        continue;
      }

      if (kind === KIND_BUILDING) {
        if (friendly) {
          myBuildings.push(this.buildingView(st, slot, owner, defId, true, true));
        } else if (isBuildingInLiveSight(st, playerId, slot, nav)) {
          enemyBuildings.push(this.buildingView(st, slot, owner, defId, false, true));
        }
      }
    }

    // Remembered enemy buildings (the ghosts). Only ones not already seen live, and only those we can
    // still attribute to a living enemy.
    for (const known of Object.values(me.knownBuildings)) {
      const slot = store.slotOf(known.id);
      if (slot >= 0 && !store.dead[slot] && isBuildingInLiveSight(st, playerId, slot, nav)) continue;
      if (known.owner === playerId || isAlly(st, playerId, known.owner)) continue;
      enemyBuildings.push({
        id: known.id,
        owner: known.owner,
        defId: known.defId,
        x: known.x,
        y: known.y,
        hp: known.hp,
        maxHp: known.maxHp,
        ...(known.buildProgress !== undefined ? { buildProgress: known.buildProgress } : {}),
        live: false,
        friendly: false,
      });
    }

    const enemies: SeenEnemyPlayer[] = [];
    const allies: SeenEnemyPlayer[] = [];
    for (const p of st.players) {
      if (p.id === playerId || p.defeated) continue;
      const located = enemyBuildings.some((b) => b.owner === p.id) || enemyUnits.some((u) => u.owner === p.id);
      const entry: SeenEnemyPlayer = { id: p.id, team: p.team, located };
      if (isEnemy(st, playerId, p.id)) enemies.push(entry);
      else allies.push(entry);
    }

    const visibleTiles = new Set<number>();
    const exploredTiles = new Set<number>();
    for (let i = 0; i < me.visible.length; i++) {
      if (me.visible[i] === 1) visibleTiles.add(i);
      if (me.explored[i] === 1) exploredTiles.add(i);
    }

    return {
      playerId,
      team: me.team,
      tick: st.tick,
      mana: me.mana,
      power: me.power,
      powerUsed: me.powerUsed,
      powerShort: isPowerShort(st, playerId),
      powerDeficit: powerDeficit(st, playerId),
      supplyUsed: countSupply(store, st, playerId),
      supplyCap: supplyCap(),
      defeated: me.defeated,
      unlockedTech: new Set(me.unlockedTech),
      completedResearch: new Set(me.completedResearch),
      factionId: me.factionId ?? 'arcane',
      myUnits,
      myBuildings,
      enemyUnits,
      enemyBuildings,
      nodes,
      enemies,
      allies,
      visibleTiles,
      exploredTiles,
      mapW: this.nav.w,
      mapH: this.nav.h,
      radar: radarActive(st, registry, playerId),
    };
  }

  /** Can this player see that entity right now? Allies and own units are always visible. */
  private canSee(st: GameState, slot: number, playerId: PlayerId, nav: { w: number; h: number }): boolean {
    const store = st.entities;
    const owner = ownerOf(st, slot);
    if (owner === playerId || isAlly(st, playerId, owner)) return true;
    if (store.kind[slot] === KIND_RESOURCE_NODE) return true;
    const viewer = st.players.find((p) => p.id === playerId);
    if (!viewer) return false;
    return isTileVisible(viewer, store.posX[slot]!, store.posY[slot]!, nav);
  }

  private unitView(st: GameState, slot: number, owner: PlayerId, defId: string, friendly: boolean): SeenUnit {
    const store = st.entities;
    const def = this.registry.units.get(defId);
    const base: SeenUnit = {
      id: store.id[slot]!,
      owner,
      defId,
      x: store.posX[slot]!,
      y: store.posY[slot]!,
      hp: store.hp[slot]!,
      maxHp: store.maxHp[slot]!,
      weapon: def?.weapon ?? null,
      armor: (def?.armor ?? 'light') as 'light' | 'heavy' | 'building',
      radius: store.radius[slot]!,
      speed: def?.speed ?? 0,
      friendly,
    };
    if (friendly) {
      // Our own orders are ours to know.
      const ex = store.extras[slot]!;
      const stt = store.state[slot]!;
      base.activity =
        stt === STATE_HARVESTING ? 'harvesting'
          : stt === STATE_RETURNING ? 'returning'
            : stt === STATE_IDLE ? 'idle'
              : 'busy';
      const h = getHarvester(ex);
      if (h) {
        base.carry = h.carry;
        base.carryMax = h.carryMax;
        const order = (ex.orders[0] as { type?: string; nodeId?: EntityId } | undefined);
        if (order?.type === 'harvest' && order.nodeId !== undefined) base.harvestNodeId = order.nodeId;
      }
    }
    return base;
  }

  private buildingView(
    st: GameState,
    slot: number,
    owner: PlayerId,
    defId: string,
    friendly: boolean,
    live: boolean,
  ): SeenBuilding {
    const store = st.entities;
    const progress = buildProgressOf(store.extras[slot]!);
    return {
      id: store.id[slot]!,
      owner,
      defId,
      x: store.posX[slot]!,
      y: store.posY[slot]!,
      hp: store.hp[slot]!,
      maxHp: store.maxHp[slot]!,
      ...(progress !== undefined ? { buildProgress: progress } : {}),
      live,
      friendly,
    };
  }
}

// -------------------------------------------------------------------------------------------- helpers

/** Supply is unit count; the cap comes from the sim's own constant so the AI cannot invent one. */
function countSupply(store: GameState['entities'], st: GameState, playerId: PlayerId): number {
  let n = 0;
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    if (ownerOf(st, slot) === playerId) n++;
  }
  return n;
}

/**
 * The unit cap. Read from `core/constants` rather than re-declared, so the AI and the sim can never drift
 * apart on what the ceiling is.
 */
function supplyCap(): number {
  return MAX_UNITS_PER_PLAYER;
}

/**
 * Ground height (in height levels) at a world position.
 *
 * The AI needs this to avoid planning a layout across a cliff, and it must agree with pathing, so it goes
 * through the nav grid — the same authority the sim uses — rather than re-deriving height from the map.
 */
export function groundHeightAt(services: SimServices, wx: number, wy: number): number {
  return services.nav.heightAtWorld(wx, wy);
}

/** Defensive helper: the def for a building, or undefined when the registry has no such id. */
export function buildingDef(registry: Registry, id: string): BuildingDef | undefined {
  return registry.buildings.get(id);
}

/** Defensive helper: the def for a unit, or undefined when the registry has no such id. */
export function unitDef(registry: Registry, id: string): UnitDef | undefined {
  return registry.units.get(id);
}

/** Convenience: the player record, for code that legitimately needs our own `Player`. */
export function self(st: GameState, id: PlayerId): Player | undefined {
  return st.players.find((p) => p.id === id);
}
