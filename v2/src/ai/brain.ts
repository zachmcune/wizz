// THE AI BRAIN — one instance per AI player, driven once per decision tick.
//
// This is the only place that turns a `Perception` into `Command`s. It owns the per-player memory that
// cannot live in `Perception` (because perception is rebuilt from scratch each pass and must stay a pure
// function of observable state):
//
//   * how far through the build order we are,
//   * the last wave size (so ambition grows instead of resetting),
//   * whether a wave is currently out,
//   * scouting assignments.
//
// Determinism: every decision is a pure function of `Perception` plus this memory, and every iteration over
// a collection is over an array built in slot order or sorted by id. No `Math.random`, no `Date.now`, no
// `Set`/`Map` iteration that could depend on insertion order across runs. `tests/phase5-determinism.test.ts`
// runs the same seed twice and compares the final hash.

import type { Command } from '../sim/types';
import type { Registry } from '../data/registry';
import type { SimServices } from '../sim/context';
import { PerceivedWorld, type Perception, type SeenBuilding, type SeenUnit } from './perception';
import { profileFor, type DifficultyProfile } from './difficulty';
import { planEconomy, findBuildSpot, cheapestCombatUnit } from './economy';
import { planMilitary, bestCounterUnit, pickAttackTarget } from './military';
import { TILE } from '../core/constants';

export interface BrainMemory {
  /** Units we were commanding last pass, so we can detect a wave going out. */
  lastWaveSize: number;
  attacking: boolean;
  /** Ticks until the next full decision pass. */
  cooldown: number;
  /** Consecutive passes with no combat unit trained — the "idle army" alarm. */
  idlePasses: number;
  /** Last known enemy anchor (a ghost or a sighting), remembered between passes. */
  enemyAnchor: { x: number; y: number } | null;
  /** Ticks since we last saw an enemy unit anywhere. */
  ticksSinceContact: number;
  /** How many decision passes the current ghost-based anchor has gone unconfirmed. */
  anchorAge: number;
  /** Decision passes since the current wave was launched. */
  waveAge: number;
  /**
   * Decision passes since we last saw an enemy BUILDING's health fall or disappear.
   *
   * This is the stalemate detector. Two AIs that both sit at the 90-unit cap trade waves forever without either side
   * making progress, and the match never ends — measured on two of four seeds, both locked at 90 units and 11 buildings
   * after 32 sim-minutes with no winner. When this counter gets large the AI stops trading and commits everything it has.
   */
  passesWithoutProgress: number;
  /** Highest enemy-building destruction count we have observed, to detect progress. */
  enemyBuildingsLost: number;
}

/**
 * How long a remembered (ghost) building is trusted as an attack target.
 *
 * A REMEMBERED BASE IS NOT A STALE SIGHTING.
 *
 * This used to expire after 20 decision passes — about ten seconds — which meant an AI that had scouted the enemy base
 * forgot where it was almost immediately, set `enemyAnchor` back to null, and therefore never satisfied the attack
 * condition. Measured over an 18-minute AI-vs-AI match: 8 enemy buildings visible as ghosts, `live: 0`, `enemyAnchor:
 * null`, and zero waves sent. The match could not end because neither side ever marched anywhere.
 *
 * A building does not move. Once scouted, its position is valid until we observe that it is gone, so the ghost is trusted
 * for 90 passes (45 s at Hard's cadence). If the army arrives and finds nothing, the anchor is cleared by the
 * "wave spent" path and the scouts search again.
 */
const GHOST_TRUST_TICKS = 90;

/**
 * Hard ceiling on how long a wave stays "in flight".
 *
 * Two minutes at any cadence: long enough to cross the map, fight, and come back; short enough that a wave that neither
 * wins nor dies still hands control back so the next one can launch.
 */
const WAVE_MAX_PASSES = 120;

/**
 * Decision passes without any enemy building lost before the AI stops trading and commits everything.
 *
 * At Normal's 1 s cadence this is 90 s of no progress, which a healthy match never reaches: waves land, buildings fall,
 * and the counter resets. Reaching it means a genuine grind at the unit cap.
 */
const STALEMATE_PASSES = 90;

export interface BrainTickResult {
  commands: Command[];
  notes: string[];
  perception: Perception | null;
}

export class AiBrain {
  readonly profile: DifficultyProfile;
  /**
   * Seeded opening variant for this player in this match.
   *
   * Derived from the match seed and the player id so it is reproducible: the same seed always yields the same opening, and
   * two AI players in the same match get independent picks. Set on first observation of the seed.
   */
  private openingVariant = 0;
  private variantSeed = -1;

  private readonly memory: BrainMemory = {
    lastWaveSize: 0,
    attacking: false,
    cooldown: 0,
    idlePasses: 0,
    enemyAnchor: null,
    ticksSinceContact: 9999,
    anchorAge: 0,
    waveAge: 0,
    passesWithoutProgress: 0,
    enemyBuildingsLost: 0,
  };
  private readonly world: PerceivedWorld;

  constructor(
    readonly playerId: string,
    difficulty: string | undefined,
    private readonly registry: Registry,
    private readonly services: SimServices,
  ) {
    this.profile = profileFor(difficulty);
    this.world = new PerceivedWorld(services);
  }

  /** Read-only view of the memory, for tests and the debug overlay. */
  get state(): Readonly<BrainMemory> {
    return this.memory;
  }

  get difficultyId(): string {
    return this.profile.id;
  }

  /**
   * One tick. Returns the commands to issue THIS tick.
   *
   * Decisions are made every `decisionInterval` ticks; on the ticks in between the brain issues nothing,
   * which is what models reaction time. A brain that re-evaluates every tick is not smarter, it is just
   * faster than any human.
   */
  tick(state: import('../sim/types').GameState): BrainTickResult {
    const per = this.world.build(state, this.playerId);

    if (per.defeated) return { commands: [], notes: ['defeated'], perception: per };

    /**
     * STALEMATE DETECTION.
     *
     * Progress is an enemy building disappearing. Two AIs that both sit at the 90-unit cap trade waves forever without
     * either side making progress — measured on two of four seeds, both locked at 90 units and 11 buildings after 32
     * sim-minutes with no winner. When nothing has changed for long enough, the AI stops trading and commits everything.
     */
    const enemyAlive = per.enemyBuildings.filter((b) => b.live || b.hp < b.maxHp).length;
    if (enemyAlive < this.memory.enemyBuildingsLost) {
      this.memory.passesWithoutProgress = 0;
    } else {
      this.memory.passesWithoutProgress += 1;
    }
    this.memory.enemyBuildingsLost = Math.max(this.memory.enemyBuildingsLost, enemyAlive);

    // Track contact for the "stalled" assertions.
    if (per.enemyUnits.length > 0 || per.enemyBuildings.some((b) => b.live)) {
      this.memory.ticksSinceContact = 0;
    } else {
      this.memory.ticksSinceContact += 1;
    }

    /**
     * REMEMBER WHERE THE ENEMY LIVES — but only from evidence that is still good.
     *
     * Preference order: a LIVE enemy building (certain), then a remembered ghost (probably still there), then a
     * visible enemy unit (they are somewhere, so their position is real). The old version took
     * `enemyBuildings[0]` unconditionally, and because ghosts are never pruned from the anchor, the army spent
     * an entire match marching at **(1644, 1388)** — a crystal that had been destroyed — while the real base sat
     * at **(3588, 436)**, 2400 units away. The measured symptom was an AI with 22 combat units, all permanently
     * mid-map, never engaging.
     *
     * A ghost is also aged out: if we have not re-sighted it for `GHOST_TTL` ticks, we stop trusting it and go
     * looking again rather than committing to a target we cannot confirm.
     */
    const liveEnemyBuilding = per.enemyBuildings.find((b) => b.live);
    const ghost = per.enemyBuildings.find((b) => !b.live);
    if (liveEnemyBuilding) {
      this.memory.enemyAnchor = { x: liveEnemyBuilding.x, y: liveEnemyBuilding.y };
      this.memory.anchorAge = 0;
    } else if (ghost) {
      // Ghosts are only worth chasing for a while; stale ones send armies to empty ground.
      this.memory.anchorAge += 1;
      if (this.memory.anchorAge <= GHOST_TRUST_TICKS) {
        this.memory.enemyAnchor = { x: ghost.x, y: ghost.y };
      } else {
        // Only give up on a ghost once the scouts have had a chance to look somewhere else.
        this.memory.enemyAnchor = null;
      }
    } else if (per.enemyUnits.length >= 3) {
      /**
       * A REAL ARMY, not a stray unit.
       *
       * Anchoring on `enemyUnits[0]` regardless of count meant a single wandering scout became the army's
       * objective, and — worse — it suppressed scouting, because "we know where they are". Requiring three
       * visible units means the anchor represents an actual force worth sending an army at; one stray unit is
       * not a destination, it is noise.
       */
      let sx = 0;
      let sy = 0;
      for (const u of per.enemyUnits) {
        sx += u.x;
        sy += u.y;
      }
      this.memory.enemyAnchor = { x: sx / per.enemyUnits.length, y: sy / per.enemyUnits.length };
      this.memory.anchorAge = 0;
    }

    // First tick of the match: choose the opening variant from the seed.
    if (this.variantSeed !== state.seed) {
      this.variantSeed = state.seed;
      let h = (state.seed >>> 0) ^ 0x9e3779b9;
      for (let i = 0; i < this.playerId.length; i++) h = Math.imul(h ^ this.playerId.charCodeAt(i), 0x85ebca6b) >>> 0;
      this.openingVariant = h % 3;
    }

    if (this.memory.cooldown > 0) {
      this.memory.cooldown -= 1;
      return { commands: [], notes: [], perception: per };
    }
    this.memory.cooldown = this.profile.decisionInterval;

    return this.decide(state, per);
  }

  private decide(state: import('../sim/types').GameState, per: Perception): BrainTickResult {
    const commands: Command[] = [];
    const notes: string[] = [];
    const pid = per.playerId;

    const elapsedSeconds = Math.floor(per.tick / 20);

    // ---- home position: the construction yard, or the first building we have.
    const yard =
      per.myBuildings.find((b) => this.registry.buildings.get(b.defId)?.isConstructionYard) ??
      per.myBuildings[0] ??
      null;
    const homeX = yard?.x ?? (per.myUnits[0]?.x ?? 0);
    const homeY = yard?.y ?? (per.myUnits[0]?.y ?? 0);

    // ---- economy
    const econ = planEconomy(
      state,
      per,
      this.registry,
      this.services,
      this.profile,
      this.difficultyId,
      elapsedSeconds,
      this.openingVariant,
    );
    commands.push(...econ.commands);
    notes.push(...econ.notes);
    /** Mana the army may not spend, so the build order always completes. */
    const spendable = Math.max(0, per.mana - econ.reservedForBuild);

    // ---- military
    const mil = planMilitary(per, this.registry, this.profile, {
      homeX,
      homeY,
      lastWaveSize: this.memory.lastWaveSize,
      attacking: this.memory.attacking,
      /**
       * All-in when the game has stopped moving.
       *
       * `planMilitary` uses this to drop the wave-size gate and skip the retreat logic, so a stalemated AI throws its whole
       * army at the enemy base instead of exchanging equal waves at the unit cap forever.
       */
      allIn: this.memory.passesWithoutProgress >= STALEMATE_PASSES,
      enemyAnchor: this.memory.enemyAnchor,
    });
    commands.push(...mil.commands);
    notes.push(...mil.notes);
    /**
     * WAVE LIFECYCLE.
     *
     * `attacking` used to be set true and then only cleared when the AI had literally zero armed units. An AI
     * that kept producing would therefore stay "attacking" forever and never launch a second, larger wave — the
     * flag latched on after the first push and the army idled mid-map for the rest of the match.
     *
     * A wave now ends when we can see no enemy at all for a while (nothing left to fight here), which returns
     * the army to massing and lets the next wave go out once it has grown.
     */
    if (mil.shouldAttack) {
      this.memory.lastWaveSize = mil.committedWave;
      this.memory.attacking = true;
      this.memory.waveAge = 0;
    } else if (this.memory.attacking) {
      this.memory.waveAge += 1;
      /**
       * WHEN IS A WAVE OVER?
       *
       * The previous attempts were wrong in both directions: cancelling as soon as nothing was in sight aborted every
       * march before it landed, while waiting for the army to disappear latched `attacking` forever — measured one wave in
       * eight minutes, then `attacking: true` with `waveAge` climbing past 115 and no further commands issued.
       *
       * A wave is over when the army that was sent has been whittled down below half its committed size (it lost the
       * fight), or when it has been out long enough that it must have arrived and resolved. Either way the army returns
       * to massing and the next, larger wave can form.
       */
      const armyNow = per.myUnits.filter((u) => u.weapon && !this.registry.units.get(u.defId)?.isHarvester).length;
      const lostMostOfIt = armyNow < Math.max(3, this.memory.lastWaveSize * 0.5);
      const beenOutLongEnough = this.memory.waveAge >= WAVE_MAX_PASSES;
      if (lostMostOfIt || beenOutLongEnough) {
        this.memory.attacking = false;
        notes.push(lostMostOfIt ? 'wave spent, regrouping' : 'wave timed out, regrouping');
      }
    }

    // ---- production: army units, countering what we have SEEN.
    const producers = per.myBuildings.filter((b) => {
      if (b.buildProgress !== undefined) return false;
      const d = this.registry.buildings.get(b.defId);
      return !!d?.producesUnits?.length;
    });
    if (producers.length > 0 && !econ.blockedOnPlacement) {
      const target = this.profile.counters
        ? bestCounterUnit(this.registry, per, producers, per.enemyUnits)
        : cheapestCombatUnit(this.registry, per, producers);
      /**
       * PRODUCE AT A SUSTAINABLE RATE, NOT EVERY PASS.
       *
       * Training whenever mana allows means the army eats the entire income: measured income was **-15
       * mana/min** with 82 units built, so the bank never recovered and the 1200-cost tier-2 building was
       * never affordable — the AI stayed on four buildings for 25 minutes. Reserving for the build order is not
       * enough on its own because a single unit is always cheap relative to the reserve cap.
       *
       * So army production only runs while the bank is comfortably above the reserve, and it targets the
       * difficulty's unit ambition rather than the supply cap: an AI does not need 82 units at minute 6, it
       * needs enough to take a fight it can win.
       */
      const armyTarget = this.armyTarget();
      const armyNow = per.myUnits.filter((u) => u.weapon && !this.registry.units.get(u.defId)?.isHarvester).length;
      const aboveReserve = target !== null && spendable > Math.max(150, target.cost * 2);
      if (target && aboveReserve && armyNow < armyTarget && per.supplyUsed < per.supplyCap) {
        // Round-robin across producers so neither sits idle.
        const b = producers[per.tick % producers.length]!;
        const def = this.registry.buildings.get(b.defId);
        if (def?.producesUnits?.includes(target.id)) {
          commands.push({ type: 'produce', playerId: pid, buildingId: b.id, defId: target.id });
          this.memory.idlePasses = 0;
        } else {
          const alt = producers.find((p) => this.registry.buildings.get(p.defId)?.producesUnits?.includes(target.id));
          if (alt) {
            commands.push({ type: 'produce', playerId: pid, buildingId: alt.id, defId: target.id });
            this.memory.idlePasses = 0;
          }
        }
      } else {
        this.memory.idlePasses += 1;
      }
    }

    // ---- scouting
    /**
     * SCOUT UNTIL CONTACT, THEN KEEP EYES ON THE BASE.
     *
     * The first version sent one unit to "the furthest corner" and stopped as soon as it had an anchor. Two
     * things were wrong: one trip to one corner covers a tiny fraction of the map (`exploredTiles` measured
     * **1570 of 11264** — 14%), and taking the corner furthest from home is not the corner the enemy is in.
     *
     * Now the scout is sent to the nearest UNEXPLORED tile cluster along the ring of the map, which walks it
     * around the perimeter over successive passes until it finds something. Once contact is made it keeps
     * patrolling the enemy's last known position so the army is not attacking a ghost.
     */
    if (this.profile.scouts) {
      const scouts = this.pickScouts(per, this.profile.scoutCount);
      if (scouts.length > 0) {
        /**
         * A SCOUT ONLY STANDS WATCH ON A CONFIRMED BASE.
         *
         * The anchor is set from `enemyUnits[0]` when no building is known, which is correct for aiming an army
         * but wrong for scouting: a single stray `imp_swarmling` at (2273,1470) became a permanent "watch this
         * spot" assignment, so the scout parked next to one unit forever and the search stopped. Measured: 400
         * consecutive `scout watching the enemy` notes, exploration frozen at 5362/11264, and no enemy BUILDING
         * ever seen in 25 minutes.
         *
         * So a watch is only posted when we actually know where a building is. Otherwise the scout keeps
         * searching, which is the only way it will ever find one.
         */
        const knownBase = per.enemyBuildings.length > 0;
        if (knownBase && this.memory.enemyAnchor) {
          const watch = scouts[0]!;
          const ax = this.memory.enemyAnchor.x;
          const ay = this.memory.enemyAnchor.y;
          if (Math.hypot(watch.x - ax, watch.y - ay) > 260) {
            commands.push({ type: 'move', playerId: pid, entityIds: [watch.id], x: ax, y: ay });
            notes.push('scout watching the enemy base');
          }
        } else {
          /**
           * RE-ISSUE ONLY WHEN THE SCOUT HAS ARRIVED (or is idle).
           *
           * `nextUnexplored` returns the nearest unexplored tile, and the nearest one barely changes while the
           * scout is walking — but issuing a fresh `move` every decision tick restarts its path from wherever
           * it happens to be, and the sim's pathing then re-plans each time. On a map whose enemy base is
           * **3168 units away**, the scout never got anywhere: exploration stalled at 2029 of 11264 tiles
           * (18%) after 25 minutes and neither AI ever located the other.
           *
           * So the order is only refreshed when the unit is actually free to take a new one.
           */
          const free = scouts.filter((u) => u.activity === 'idle' || u.activity === undefined);
          const target = nextUnexplored(per);
          if (target && free.length > 0) {
            commands.push({
              type: 'move',
              playerId: pid,
              entityIds: free.map((s) => s.id),
              x: target.x,
              y: target.y,
            });
            notes.push('scouting unexplored ground');
          }
        }
      }
    }

    // ---- research + superweapon
    commands.push(...this.planResearch(per, notes, spendable));
    if (this.profile.usesSuperweapon) commands.push(...this.planSuperweapon(per, notes));

    return { commands, notes, perception: per };
  }

  /** How many combat units this difficulty wants before it stops massing. */
  private armyTarget(): number {
    const base = this.profile.minWaveSize * 2;
    if (this.profile.id === 'easy') return base;
    if (this.profile.id === 'normal') return base + 8;
    return base + 16;
  }

  /** Up to `count` cheap fast units to use as scouts. */
  private pickScouts(per: Perception, count: number): SeenUnit[] {
    /**
     * A HARVESTER SCOUTS WHEN THERE IS NOTHING ELSE.
     *
     * Excluding harvesters outright meant the AI had NO scout until it had trained a combat unit, and by then the army
     * planner pulls those into waves. Measured on a 15-minute match: 8049 of 11264 tiles explored but
     * `knownBuildings = 0` — the enemy base at (3632, 464) was never within a unit's 140-unit sight radius, so no ghost
     * was ever recorded, the attack anchor stayed stale, and the match could not end.
     *
     * One wisp drawn off the mining line is the standard opening scout, and it is cheap: the economy loses one worker for
     * a couple of minutes in exchange for knowing where the opponent lives.
     */
    const ranked: { u: SeenUnit; speed: number; harvester: boolean }[] = [];
    for (const u of per.myUnits) {
      const def = this.registry.units.get(u.defId);
      if (!def) continue;
      ranked.push({ u, speed: def.speed, harvester: def.isHarvester === true });
    }
    // Combat units first (they survive contact), then harvesters as the fallback.
    ranked.sort((a, b) => Number(a.harvester) - Number(b.harvester) || b.speed - a.speed || a.u.id - b.u.id);
    // Never take more than one harvester, so the economy keeps the rest.
    let harvestersTaken = 0;
    const out: SeenUnit[] = [];
    for (const r of ranked) {
      if (out.length >= Math.max(1, count)) break;
      if (r.harvester) {
        if (harvestersTaken >= 1) continue;
        harvestersTaken++;
      }
      out.push(r.u);
    }
    return out;
  }

  /**
   * Research the next affordable thing.
   *
   * The plan's "20-minute target" means research has to actually complete by mid-game, so this picks the
   * cheapest research whose prerequisites are met and whose building we own, rather than hoarding for the most
   * expensive one.
   */
  private planResearch(per: Perception, notes: string[], spendableRef: number): Command[] {
    const out: Command[] = [];
    const buildings = per.myBuildings.filter((b) => b.buildProgress === undefined);
    if (buildings.length === 0) return out;
    let best: { id: string; cost: number; buildingId: number } | null = null;
    for (const r of this.registry.research.values()) {
      if (per.completedResearch.has(r.id)) continue;
      if (r.requires.some((q: string) => !per.completedResearch.has(q))) continue;
      if (r.factions && !r.factions.includes(per.factionId)) continue;
      const host = buildings.find((b) => b.defId === r.researchedAt);
      if (!host) continue;
      if (!best || r.cost < best.cost) best = { id: r.id, cost: r.cost, buildingId: host.id };
    }
    if (best && spendableRef >= best.cost + 200) {
      out.push({ type: 'research', playerId: per.playerId, buildingId: best.buildingId, defId: best.id });
      notes.push(`researching ${best.id}`);
    }
    return out;
  }

  /**
   * Use the Astral Spire.
   *
   * Only Hard does this, and only when it has actually seen a cluster of enemy units to aim at — firing a
   * superweapon into fog at a guess would be a cheat in spirit even though the command itself is legal.
   */
  private planSuperweapon(per: Perception, notes: string[]): Command[] {
    const spire = per.myBuildings.find(
      (b) => b.buildProgress === undefined && this.registry.buildings.get(b.defId)?.isSuperweapon,
    );
    if (!spire) return [];
    const def = this.registry.buildings.get(spire.defId);
    const spell = def?.unlocksSpells?.[0];
    if (!spell) return [];
    if ((per as unknown as { spellCooldowns?: Record<string, number> }).spellCooldowns?.[spell]) return [];
    // Aim at the densest visible enemy cluster, or at a live enemy building.
    const cluster = densestCluster(per.enemyUnits);
    if (cluster) {
      notes.push(`superweapon at ${Math.round(cluster.x)},${Math.round(cluster.y)}`);
      return [{ type: 'castSpell', playerId: per.playerId, spellId: spell, x: cluster.x, y: cluster.y }];
    }
    const live = per.enemyBuildings.filter((b) => b.live);
    if (live.length > 0) {
      const t = live[0]!;
      notes.push('superweapon at a visible enemy building');
      return [{ type: 'castSpell', playerId: per.playerId, spellId: spell, x: t.x, y: t.y }];
    }
    return [];
  }

  /** Expose the build spot finder so tests can assert placement legality. */
  spotFor(
    state: import('../sim/types').GameState,
    def: import('../data/defs').BuildingDef,
    per: Perception,
  ): { x: number; y: number } | null {
    return findBuildSpot(state, per, this.services, this.registry, def);
  }

  /** Expose the target picker for tests. */
  targetFor(per: Perception, anchor: { x: number; y: number }): { x: number; y: number; why: string } {
    return pickAttackTarget(per, anchor, this.registry);
  }

  /** Convenience for the debug overlay. */
  perception(state: import('../sim/types').GameState): Perception {
    return this.world.build(state, this.playerId);
  }

  /** For diagnostics: a building list summary. */
  ownBuildings(per: Perception): SeenBuilding[] {
    return per.myBuildings;
  }
}

/**
 * Where should the scout look next?
 *
 * Picks the unexplored tile that is FURTHEST from home, not the nearest. That is counter-intuitive but it is the
 * right search strategy: the nearest unexplored tile is always the fringe of our own explored bubble, so a scout
 * chasing it just walks a slowly expanding circle around its own base and never crosses the map. Measured with
 * nearest-first: after 25 minutes the AI had explored 5362 of 11264 tiles and had **never seen an enemy
 * building** — the enemy base was 3168 units away and simply never visited.
 *
 * Furthest-first throws the scout at the far side of the map, which is where an opponent's base actually is: an
 * RTS start position is a corner, and the corners are the far points. Once contact is made the anchor takes over
 * (see `enemyAnchor`), so this only governs the search.
 *
 * `exploredTiles` is what the player's own vision has revealed, so this remains entirely legal information.
 */
function nextUnexplored(per: Perception): { x: number; y: number } | null {
  if (per.exploredTiles.size >= per.mapW * per.mapH) return null;
  const from = per.myBuildings[0] ?? per.myUnits[0];
  const cx = from ? Math.floor(from.x / TILE) : Math.floor(per.mapW / 2);
  const cy = from ? Math.floor(from.y / TILE) : Math.floor(per.mapH / 2);

  /**
   * SWEEP THE MAP IN COARSE CELLS, FARTHEST FIRST.
   *
   * Ranking individual tiles produced a pathological result: the "furthest unexplored tile" was often a thin
   * unexplored sliver only ~124 units away (a gap between explored patches), so the scout was sent to tidy up a
   * hole near home instead of crossing the map. Coverage climbed to 7378/11264 while the enemy base — at tile
   * (113,14) — was **never visited once** in 24 minutes.
   *
   * Coarse cells fix that. The map is divided into blocks of `STRIDE` tiles and a block only counts as explored
   * when it is mostly seen; scouts are then sent to the centre of the FARTHEST mostly-unexplored block. That
   * guarantees the search sweeps outward to the map's extremities, which is where an opponent's start position
   * is.
   */
  const STRIDE = 8;
  let best: { x: number; y: number; d: number } | null = null;
  for (let by = 0; by + STRIDE <= per.mapH; by += STRIDE) {
    for (let bx = 0; bx + STRIDE <= per.mapW; bx += STRIDE) {
      // Sample the block; treat it as unexplored unless most of it has been seen.
      let seen = 0;
      let total = 0;
      for (let ty = by; ty < by + STRIDE; ty += 2) {
        for (let tx = bx; tx < bx + STRIDE; tx += 2) {
          total++;
          if (per.exploredTiles.has(ty * per.mapW + tx)) seen++;
        }
      }
      if (total === 0 || seen / total >= 0.5) continue;
      const bxC = bx + STRIDE / 2;
      const byC = by + STRIDE / 2;
      const d = Math.hypot(bxC - cx, byC - cy);
      if (!best || d > best.d) best = { x: bxC * TILE, y: byC * TILE, d };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** The densest group of visible enemy units: where a splash spell does the most work. */
function densestCluster(units: SeenUnit[]): { x: number; y: number } | null {
  if (units.length < 4) return null;
  let best: { x: number; y: number; score: number } | null = null;
  for (const a of units) {
    let score = 0;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const b of units) {
      if (Math.hypot(b.x - a.x, b.y - a.y) <= 96) {
        score += 1;
        sx += b.x;
        sy += b.y;
        n++;
      }
    }
    if (!best || score > best.score) best = { x: sx / Math.max(1, n), y: sy / Math.max(1, n), score };
  }
  return best ? { x: best.x, y: best.y } : null;
}
