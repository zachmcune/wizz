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
import { MAX_UNITS_PER_PLAYER, TILE } from '../core/constants';
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

  /** Our units. STRICTLY ours — a teammate's units are in `alliedUnits`, because we cannot command them. */
  myUnits: SeenUnit[];
  /** Our buildings. STRICTLY ours — a teammate's buildings are in `alliedBuildings`. */
  myBuildings: SeenBuilding[];
  /**
   * A TEAMMATE'S UNITS AND BUILDINGS, kept separate from our own.
   *
   * These are fully visible (teams share sight) but we cannot give them orders and must not count them as our economy,
   * our base, or our army. They exist so coordination can use them — a teammate's army near a target, a teammate's base
   * to defend — without the planners mistaking them for their own.
   */
  alliedUnits: SeenUnit[];
  alliedBuildings: SeenBuilding[];
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
  /**
   * True when a tile's centre is walkable ground.
   *
   * Terrain is static and fully observable from the map, exactly like the resource nodes, so this is not hidden state — a
   * human player can see where the cliffs are from turn one. The AI needs it because a destination on impassable ground is
   * a destination no unit can ever reach: armies were being sent into the side of a cliff and oscillating in place a few
   * units from the goal, never exploring.
   */
  tileWalkable: (tx: number, ty: number) => boolean;
  /**
   * Static map landmarks: every start location and every mana node, in world units.
   *
   * These are PUBLIC, like the cliffs and the resource nodes themselves — the lobby shows you the start positions
   * before the match begins, and nodes are already exposed in full through `nodes` (they are terrain, not units).
   * Nothing here depends on fog: it is the same class of information as `tileWalkable`, which the AI has always used
   * to avoid sending armies into cliffs.
   *
   * The AI needs them because "sweep unexplored ground" alone is not a search *plan*. A base is not uniformly
   * likely to be anywhere on the map: it is at a start location, and failing that it is near a node cluster, because
   * every economy in the game must sit beside mana. Ranking unexplored ground by "how likely is an enemy base here"
   * instead of merely "how far away is it" is what turns a random walk into a systematic search.
   *
   * The enemy's actual *presence* at those locations is still discovered through fog. Measured in the 2v2: `b1`
   * explored only 7,805 of 11,264 tiles in 75 minutes while holding 39 army units, because nothing directed it to the
   * four places a base could plausibly be.
   */
  landmarks: { starts: { x: number; y: number }[]; nodes: { x: number; y: number }[] };
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
    const alliedUnits: SeenUnit[] = [];
    const alliedBuildings: SeenBuilding[] = [];
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
          /**
           * `myUnits` IS STRICTLY *MY* UNITS — allies go in `alliedUnits`.
           *
           * Both used to be pushed into `myUnits`, and every consumer assumes ownership: the economy counts these as
           * workers it can re-task, the army counts them as units it can order, and `planMilitary` issues commands with
           * them. In a team game that meant a brain believed its teammate's army was its own and tried to command it,
           * and believed its teammate's buildings were its own base:
           *
           *   measured, 2v2 seed 2005 after 10 s — `a2` saw 3 "my" buildings (a1:2, a2:1) and 5 "my" units
           *   (a1:3, a2:2) while it actually owned 2 buildings. It sized its refineries and worker count from the TEAM
           *   total and anchored its build search on its teammate's base, so it could neither place structures nor
           *   produce: 1 unit and 2 buildings for 28 minutes with 8,325 unspent mana.
           */
          const view = this.unitView(st, slot, owner, defId, true);
          if (owner === playerId) myUnits.push(view);
          else alliedUnits.push(view);
        } else if (this.canSee(st, slot, playerId, nav)) {
          enemyUnits.push(this.unitView(st, slot, owner, defId, false));
        }
        // Enemy units out of sight are simply not listed — no memory, no tracking.
        continue;
      }

      if (kind === KIND_BUILDING) {
        if (friendly) {
          const view = this.buildingView(st, slot, owner, defId, true, true);
          if (owner === playerId) myBuildings.push(view);
          else alliedBuildings.push(view);
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
      alliedUnits,
      alliedBuildings,
      enemyUnits,
      enemyBuildings,
      nodes,
      enemies,
      allies,
      visibleTiles,
      exploredTiles,
      mapW: this.nav.w,
      mapH: this.nav.h,
      tileWalkable: (tx: number, ty: number) => this.services.nav.canPlace(tx, ty, 1),
      landmarks: this.landmarksFor(st),
      radar: radarActive(st, registry, playerId),
    };
  }

  /**
   * The map's published start locations and mana nodes, in world units.
   *
   * Read from the map definition (static level data), never from player or entity fog state. Cached because a map
   * definition does not change during a match, and this is called on every decision pass.
   */
  private landmarksFor(st: GameState): { starts: { x: number; y: number }[]; nodes: { x: number; y: number }[] } {
    const key = st.mapId;
    const cached = this.landmarkCache.get(key);
    if (cached) return cached;
    const map = this.registry.maps.get(key);
    const value = {
      starts: (map?.startLocations ?? []).map((s) => ({ x: s.x * TILE, y: s.y * TILE })),
      nodes: (map?.manaNodes ?? []).map((n) => ({ x: n.x * TILE, y: n.y * TILE })),
    };
    this.landmarkCache.set(key, value);
    return value;
  }

  private readonly landmarkCache = new Map<string, { starts: { x: number; y: number }[]; nodes: { x: number; y: number }[] }>();

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
