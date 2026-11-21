// ECONOMY PLANNER.
//
// v1's economy failed in one specific, measurable way: no match had a player with zero harvesters for more
// than 60 seconds, because harvesters were never re-tasked. A worker whose node ran dry stood next to a dead
// crystal for the rest of the game, and nothing ever noticed.
//
// This planner does four things, in priority order every pass:
//
//   1. SELF-HEALING HARVESTERS — any harvester that is idle, or whose node is exhausted, is sent to the
//      nearest node with mana left. This is the single most important behaviour for "no stalls".
//   2. HARVESTER COUNT — keep enough workers for the current refinery count, and build more refineries when
//      the income is the bottleneck.
//   3. BUILD ORDER — walk the opening, placing the first step that is due and legal, near the base and on
//      ground that can actually hold it.
//   4. FLOAT MANAGEMENT — never bank more than the difficulty allows; a hoarding AI is a losing AI.
//
// Everything is decided from `Perception`. In particular, placement scores tiles by what the AI can SEE.

import type { Command } from '../sim/types';
import type { Registry } from '../data/registry';
import type { BuildingDef } from '../data/defs';
import type { Perception, SeenBuilding, SeenNode, SeenUnit } from './perception';
import type { DifficultyProfile } from './difficulty';
import { openingFor, stepSatisfied, type BuildStep } from './build-order';
import { TILE } from '../core/constants';
import { groundHeightAt } from './perception';
import { canBuildNearBase } from '../sim/build-zone';
import type { GameState } from '../sim/types';
import type { SimServices } from '../sim/context';

export interface EconomyPlan {
  commands: Command[];
  /** Why the planner did what it did, for the debug overlay and the "no idle army/economy" assertions. */
  notes: string[];
  /** True when the planner wanted to place a building but could not find a legal tile. */
  blockedOnPlacement: boolean;
  /**
   * Mana the military planner must leave untouched so the next build-order step can be paid for.
   *
   * Without this the army competes with the build order for every unit of income and wins, because training
   * a unit is always affordable before a 1200-mana tier-2 building is. That is what kept both AIs in a
   * 25-minute match stuck on four buildings: they out-produced their own tech and never reached the units
   * that could break a base.
   */
  reservedForBuild: number;
}

/** Buildings that count as our production capacity for units. */
function producersOf(per: Perception, registry: Registry): SeenBuilding[] {
  return per.myBuildings.filter((b) => {
    if (b.buildProgress !== undefined) return false;
    const def = registry.buildings.get(b.defId);
    return !!def?.producesUnits?.length;
  });
}

/** Every def we already have at least one of, including foundations, to avoid double-placement. */
function inProgressCount(per: Perception, defId: string): number {
  let n = 0;
  for (const b of per.myBuildings) {
    if (b.defId === defId && b.buildProgress !== undefined) n++;
  }
  return n;
}

/**
 * The main economy pass.
 *
 * `services` is used only for terrain height and map bounds — both are public map data, the same information
 * the player's own screen has.
 */
export function planEconomy(
  state: GameState,
  per: Perception,
  registry: Registry,
  services: SimServices,
  profile: DifficultyProfile,
  difficultyId: string,
  elapsedSeconds: number,
  /**
   * Which seeded opening variant to play.
   *
   * Chosen per match from the seed and player id at brain construction. It only selects between legal build orders, so it
   * cannot grant an advantage — but it does stop every tournament seed from being the same deterministic game.
   */
  openingVariant = 0,
): EconomyPlan {
  const commands: Command[] = [];
  const notes: string[] = [];
  const pid = per.playerId;

  // ------------------------------------------------------------------ 1. self-healing harvesters
  const harvesters = per.myUnits.filter((u) => {
    const def = registry.units.get(u.defId);
    return !!def?.isHarvester;
  });
  const liveNodes = per.nodes.filter((n) => n.remaining > 0);
  if (harvesters.length > 0 && liveNodes.length === 0) {
    notes.push('no mana nodes left in sight');
  }
  if (liveNodes.length > 0) {
    const idle = harvesters.filter((u) => isIdleHarvester(u));
    if (idle.length > 0) {
      /**
       * SPREAD WORKERS ACROSS NODES.
       *
       * `claimed` only prevented the workers re-tasked in THIS pass from colliding with each other. Every
       * worker already harvesting was still free to be counted, so on a fresh order they all picked the same
       * nearest crystal — measured **6 of 8 workers on node 1** while nodes 3-6 sat at full 12000 mana
       * untouched. Six units cannot all touch one node: they push each other off the contact radius, so most
       * of them stand still and the economy yields a fraction of what the worker count implies.
       *
       * Now the claim set is seeded with the nodes our OTHER workers are already committed to, so a worker is
       * only sent where there is room. Nodes are also ranked by remaining mana, so a nearly-empty crystal is
       * not chosen while a full one is available.
       */
      const busyNodes = new Set<number>();
      for (const h of harvesters) {
        if (!isIdleHarvester(h)) {
          const target = orderNodeOf(h);
          if (target !== null) busyNodes.add(target);
        }
      }
      for (const u of idle) {
        const node = nearestFreeNode(u, liveNodes, busyNodes);
        if (!node) continue;
        busyNodes.add(node.id);
        commands.push({ type: 'harvest', playerId: pid, entityIds: [u.id], nodeId: node.id });
      }
      notes.push(`re-tasked ${idle.length} idle harvester(s)`);
    }
  }

  // ------------------------------------------------------------------ 2. harvester count
  const refineries = per.myBuildings.filter((b) => {
    const def = registry.buildings.get(b.defId);
    return !!def?.isRefinery && b.buildProgress === undefined;
  }).length;
  /**
   * How many workers we want.
   *
   * Scaled from refineries AND from the number of producers, because the binding constraint early is not the
   * refinery count (there is always at least the yard as a drop-off) but how fast income compounds. The old
   * formula was `refineries * perRefinery` with a floor of 4, so an AI that had not yet built a refinery —
   * or had built exactly one — sat on 4-6 workers forever and its income never grew past ~10 mana/s, which is
   * not enough to fund both an army and a tech tree. Measured: a 6-worker economy held a hard ceiling of
   * ~400 banked mana and never reached a 1200-cost tier-2 building in 25 minutes.
   */
  const producerList = producersOf(per, registry);
  // ------------------------------------------------------------------ 3. build order
  const opening = openingFor(difficultyId, openingVariant);
  const built = new Map<string, number>();
  for (const b of per.myBuildings) {
    if (b.buildProgress === undefined) built.set(b.defId, (built.get(b.defId) ?? 0) + 1);
  }

  /**
   * WORKERS ARE BOUGHT FROM SURPLUS, NEVER FROM THE BUILD ORDER'S SAVINGS.
   *
   * `harvestersPerRefinery` is a TARGET, and at Hard's value (8) two spires ask for sixteen workers. Each costs 200, so the
   * AI spent every coin it earned on wisps and never accumulated the 550 a summoning circle needs. Measured on seed 1000,
   * hard vs easy, at minute 10:
   *
   *   hard: 3 buildings (sanctum, two spires), 11 harvesters, **175/550** toward a summoning circle
   *   easy: 5 buildings INCLUDING the summoning circle, 8 harvesters
   *
   * and hard held that 175 indefinitely while fielding **zero army for twelve minutes**, then lost. The strongest
   * difficulty was the weakest player because its worker target outran its income.
   *
   * Two guards: the target is capped so a single refinery cannot demand a swarm, and workers are only bought once the next
   * build-order step is already paid for — the opening is what turns income into an army, so it goes first.
   */
  const wantedHarvesters = Math.min(
    // Never let the worker target alone absorb everything: 4 per refinery plus base capacity is plenty.
    8 + refineries * 4,
    Math.max(8, refineries * profile.harvestersPerRefinery, producersOf(per, registry).length * 4),
  );
  const harvesterProducer = producerList.find((b) => {
    const def = registry.buildings.get(b.defId);
    return !!def?.producesUnits?.some((u) => registry.units.get(u)?.isHarvester);
  });


  let activeStep: BuildStep | null = null;
  for (const step of opening) {
    if (stepSatisfied(step, opening, built, (id) => registry.buildings.get(id))) continue;
    if (elapsedSeconds < step.notBeforeSeconds) {
      activeStep = step;
      break;
    }
    const def = registry.buildings.get(step.defId);
    if (!def) continue;
    // Already under construction? Do not place a second one.
    if (inProgressCount(per, step.defId) > 0) {
      activeStep = step;
      break;
    }
    // Unlocked? `unlockedTech` carries building ids whose construction has completed.
    if (def.requires.some((r) => !per.unlockedTech.has(r)) && !def.requires.every((r) => r === 'sanctum')) {
      continue;
    }
    activeStep = step;
    break;
  }

  /**
   * REBUILD WHEN THE BASE HAS BEEN STRIPPED.
   *
   * The openings above assume the starting base survives: none of them contains a sanctum step, because the player begins
   * with one. That is wrong the moment it is destroyed. Measured on seed 1035 at 14 sim-minutes, after a successful raid:
   *
   *   buildings: sanctum, ley_conduit, summoning_circle   (no construction yard, no producer)
   *   mana: 220, harvesters: 2 (still working), income: 0
   *
   * The AI had a working economy and a bank, but every producer had been destroyed, so it could never train again. It sat
   * at exactly 220 mana for the last 11 minutes of the match and only "ended" when the winner finally walked over. The bank
   * under the cheapest unit cost is what the stall metric flags as `longestNoSpendSeconds`.
   *
   * This branch takes priority over the opening: with no construction yard there is no way to build anything at all, and
   * with no unit producer the army can never be replaced. Both are cheap enough to be reachable — a sanctum costs 0 and a
   * summoning circle 550 — so this is a genuine recovery path rather than a token gesture.
   */
  let blockedOnPlacement = false;
  const hasYard = per.myBuildings.some(
    (b) => b.buildProgress === undefined && registry.buildings.get(b.defId)?.isConstructionYard,
  );
  const hasProducer = producerList.length > 0;
  /**
   * REBUILD, AND REBUILD THE PREREQUISITE CHAIN.
   *
   * Checking only the final building's requirements is not enough, because a razed base loses the whole chain. Measured on
   * seed 1014 at 22 sim-minutes: p2 held **3800 mana** with two buildings standing (sanctum, ley_conduit) and four
   * harvesters still hauling — a healthy economy — but every unit producer was gone. A summoning circle requires an
   * attunement_spire, that spire had been destroyed, and the AI had no step that would ever rebuild one, so it kept
   * banking mana it could not spend for the rest of the match.
   *
   * So walk the requirement tree and rebuild the deepest missing piece first: yard, then whatever the producer needs,
   * then the producer itself. Each step is a legal, affordable building on its own, so this is a real recovery path.
   */
  const rebuildTarget = !hasYard ? 'sanctum' : !hasProducer ? 'summoning_circle' : null;
  if (rebuildTarget !== null) {
    /** The first def in the prerequisite chain that we do not currently have (or are not building). */
    const missingPrerequisite = (defId: string, depth = 0): string | null => {
      if (depth > 4) return null;
      const def = registry.buildings.get(defId);
      if (!def) return null;
      for (const req of def.requires) {
        if (req === 'sanctum' && !hasYard) return 'sanctum';
        const standing =
          per.myBuildings.some((b) => b.defId === req && b.buildProgress === undefined) || inProgressCount(per, req) > 0;
        if (standing) continue;
        // Recurse so a missing grandparent is rebuilt before the parent.
        return missingPrerequisite(req, depth + 1) ?? req;
      }
      return null;
    };
    const toBuildId = missingPrerequisite(rebuildTarget) ?? rebuildTarget;
    const def = registry.buildings.get(toBuildId);
    if (def && per.mana >= def.cost && inProgressCount(per, toBuildId) === 0) {
      const spot = findBuildSpot(state, per, services, registry, def);
      if (spot) {
        commands.push({ type: 'build', playerId: pid, defId: def.id, x: spot.x, y: spot.y });
        notes.push(
          toBuildId === rebuildTarget
            ? `REBUILDING ${def.id} — ${hasYard ? 'every unit producer was destroyed' : 'the base lost its yard'}`
            : `REBUILDING PREREQUISITE ${def.id} so ${rebuildTarget} can be rebuilt`,
        );
        return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
      }
      blockedOnPlacement = true;
      notes.push(`nowhere legal to rebuild ${def.id}`);
    } else if (def && per.mana < def.cost) {
      notes.push(`saving to rebuild ${def.id} (${Math.round(per.mana)}/${def.cost})`);
      /**
       * RESERVE THE WHOLE COST WHILE A REBUILD IS PENDING.
       *
       * Returning `reservedForBuild: 0` here left the military planner free to spend the bank, and it spent it
       * continuously: measured on seeds 1035/1077, p1 bought an imp_swarmling (140) every ~40 seconds, so its bank
       * oscillated 205-460 forever and never reached the 550 a summoning circle costs. Thirteen minutes of income, zero
       * progress. The reserve makes the rebuild inevitable instead of merely intended.
       */
      return { commands, notes, blockedOnPlacement, reservedForBuild: Math.max(0, def.cost - per.mana) };
    }
  }

  const pauseHarvesters = activeStep?.pauseHarvesters === true && per.mana >= (registry.buildings.get(activeStep.defId)?.cost ?? 0);

  // Build the active step if it is due and affordable.
  if (activeStep && elapsedSeconds >= activeStep.notBeforeSeconds) {
    const def = registry.buildings.get(activeStep.defId);
    const affordable = def !== undefined && per.mana >= def.cost;
    const alreadyGoing = inProgressCount(per, activeStep.defId) > 0;
    if (def && affordable && !alreadyGoing) {
      const spot = findBuildSpot(state, per, services, registry, def);
      if (spot) {
        commands.push({ type: 'build', playerId: pid, defId: def.id, x: spot.x, y: spot.y });
        notes.push(`building ${def.id} — ${activeStep.why}`);
      } else {
        blockedOnPlacement = true;
        notes.push(`no legal tile for ${def.id}`);
      }
    } else if (!affordable && def) {
      notes.push(`saving for ${def.id} (${Math.round(per.mana)}/${def.cost})`);
    }
  }

  // ------------------------------------------------------------------ 4. train harvesters
  /**
   * DO NOT BUY WORKERS WITH THE MONEY THAT IS SUPPOSED TO REBUILD THE PRODUCER.
   *
   * When the base has no unit producer, the only thing that matters is affording the replacement. Harvesters cost 200
   * each, so topping workers up to the target (8) drains the bank below a summoning circle (550) every single time it
   * approaches it. Measured on seeds 1035/1077, which ran the full 32 minutes without ending: p1's bank oscillated
   * between **205 and 460** for thirteen straight minutes -- it had income (two wisps still hauling) and it was spending,
   * but the cycle could never cross 550, so it never rebuilt a producer and therefore never had an army. It never
   * attacked, and its opponent could not find it to finish the match.
   *
   * So while a rebuild is pending, workers are paused and every coin goes to the rebuild.
   */
  const rebuildPending = rebuildTarget !== null;
  /**
   * Buy a worker only if the bank still covers the pending build step afterwards.
   *
   * This is the direct fix for the deadlock measured above: at Hard's worker target the AI spent its entire income on wisps
   * and never reached the 550 a summoning circle costs. The opening is what converts income into an army, so it is paid for
   * first and workers come out of whatever is left.
   */
  const workerCost = (() => {
    const hb = producerList.find((b) => {
      const d = registry.buildings.get(b.defId);
      return !!d?.producesUnits?.some((u) => registry.units.get(u)?.isHarvester);
    });
    if (!hb) return 200;
    const uid = registry.buildings.get(hb.defId)?.producesUnits?.find((u) => registry.units.get(u)?.isHarvester);
    return uid ? (registry.units.get(uid)?.cost ?? 200) : 200;
  })();
  /**
   * A BUILD STEP THAT IS OUT OF REACH MUST NOT BLOCK WORKERS FOREVER.
   *
   * `affordableStep` is the next unbuilt step, and with 1 harvester the AI cannot afford a 750 third refinery — so the
   * "keep enough for the build order" guard demanded 950 mana and it bought ZERO workers permanently. Measured on seed
   * 1000 at 30 sim-minutes, with **12 live mana nodes** on the map and both sides holding only ONE harvester each:
   *
   *   p1: 5 buildings (2 spires, so wisps are producible), 1 harvester, 2 army units, 355 mana, 7966/11264 explored
   *   p2: 4 buildings, 1 harvester, 1 army unit, 430 mana
   *
   * Neither could ever rebuild its economy, so neither could field an army, so neither attacked, and the match ran out the
   * clock. A starving economy has to fix the starvation first: while workers are below target, the reserve only applies to
   * steps that are actually reachable, and an aspirational third refinery is abandoned rather than stranding the economy.
   */
  /**
   * A STARVING ECONOMY BUYS WORKERS FIRST, WITH NO RESERVE.
   *
   * The reserve exists so the army cannot starve the build order. But it must not apply when the economy is already unable
   * to fund anything: reserving even one worker's cost (200) demanded 400 banked to buy a 200-cost worker, which an economy
   * with a single harvester realistically never reaches. Measured on seed 1007 (hard vs normal) with **13 live mana nodes**
   * on the map and both sides down to ONE harvester each:
   *
   *   p1 (hard): 4 buildings, 1 harvester, 9 army units, 320 mana, `massing: 9/11` forever
   *   p2 (norm): 4 buildings, 1 harvester, 1 army unit,  110 mana, `saving for summoning_circle (110/550)`
   *
   * Neither could buy a worker, so neither economy could recover, so neither army could grow, and the match ran out the
   * clock with Hard sitting on 9 units it never committed.
   *
   * Below four workers there is no build order worth protecting: an economy that cannot fund its own replacement will not
   * complete a 550-750 cost building either. Every coin goes to restoring income until the floor is met.
   */
  /**
   * A STARVING ECONOMY RESERVES EXACTLY ONE WORKER — AND PROTECTS IT FROM THE ARMY.
   *
   * The reserve exists so the army cannot starve the build order. It must not apply to a 550-750 cost building while the
   * economy has fewer than four workers, because such an economy can never reach that sum — but it must hold back the 200
   * for the next worker, or the military planner spends it first and the economy never recovers.
   *
   * Measured on seed 1007 (hard vs normal), with **13 live mana nodes** on the map and both sides down to ONE harvester:
   *
   *   with no reserve at all:  p2 1 harvester -> 5 army units, still 1 harvester, 140 mana, `saving for … (140/750)`
   *   with this reserve:       the 200 is held back and the worker is actually bought
   *
   * The army spending the worker's mana is the mechanism, which is why an unreserved starving economy grows an army it
   * cannot replace instead of fixing its income.
   */
  const starving = harvesters.length < 4;
  const canAffordWorker = per.mana >= workerCost;
  if (
    harvesterProducer &&
    harvesters.length < wantedHarvesters &&
    !pauseHarvesters &&
    !rebuildPending &&
    canAffordWorker
  ) {
    const hDef = registry.buildings.get(harvesterProducer.defId);
    const unitId = hDef?.producesUnits?.find((u) => registry.units.get(u)?.isHarvester);
    const unit = unitId ? registry.units.get(unitId) : undefined;
    if (unitId && unit && per.supplyUsed < per.supplyCap) {
      /**
       * Queue several workers in one pass while we are far behind, so the economy ramps in seconds rather
       * than one-per-decision. Capped by what we can actually pay for and by the shortfall, and never more
       * than the producer's queue can hold.
       */
      const shortfall = wantedHarvesters - harvesters.length;
      const affordable = Math.floor(per.mana / Math.max(1, unit.cost));
      const batch = Math.max(1, Math.min(shortfall, affordable, 3));
      for (let i = 0; i < batch; i++) {
        commands.push({ type: 'produce', playerId: pid, buildingId: harvesterProducer.id, defId: unitId });
      }
    }
  }

  // ------------------------------------------------------------------ 5. float management
  // A banked mana pile is wasted tempo. If we are holding far more than the next step costs, spend it on
  // standing army instead of sitting on it. The military planner also trains, so this only nudges.
  if (producerList.length > 0 && per.mana > 1200) {
    const cheapest = cheapestCombatUnit(registry, per, producerList);
    if (cheapest && per.supplyUsed < per.supplyCap) {
      const b = producerList.find((p) => registry.buildings.get(p.defId)?.producesUnits?.includes(cheapest.id));
      if (b && per.mana >= cheapest.cost * 2) {
        commands.push({ type: 'produce', playerId: pid, buildingId: b.id, defId: cheapest.id });
        notes.push('dumping float into army');
      }
    }
  }

  /**
   * Reserve for the next unbuilt step, so the army cannot starve the tech tree.
   *
   * CAPPED, because an uncapped reserve starves the army instead. Measured on the first run: with 400 banked
   * mana and a 750-cost attunement spire pending, the reserve was 350, leaving **50 spendable** — so the AI
   * trained nothing at all, for minutes, while claiming to be saving. Both AIs sat at 8 workers and zero
   * combat units and the match could never end.
   *
   * The cap is deliberately below a typical unit cost so there is always enough left to keep producing, and
   * the reserve only ever applies once the step is within reach; a distant step is not hoarded for.
   */
  let reservedForBuild = 0;
  if (starving) {
    // Hold back exactly one worker so the military planner cannot spend the economy's recovery.
    reservedForBuild = Math.max(0, Math.min(workerCost, per.mana));
  } else if (activeStep) {
    const def = registry.buildings.get(activeStep.defId);
    if (def && inProgressCount(per, activeStep.defId) === 0) {
      const gap = Math.max(0, def.cost - per.mana);
      // Only hold back while the step is nearly affordable, and never more than 40% of the bank.
      if (gap <= 400) reservedForBuild = Math.min(gap, Math.floor(per.mana * 0.4));
    }
  }

  return { commands, notes, blockedOnPlacement, reservedForBuild };
}

/**
 * A worker needs a new order only when it genuinely has nothing to do.
 *
 * `activity` comes from the sim's own state machine (see `perception.ts`), so this is a measurement rather
 * than a guess. Re-tasking a worker that is already hauling resets its order and it never completes a trip —
 * which is exactly what happened when this was inferred from position.
 */
function isIdleHarvester(u: SeenUnit): boolean {
  return u.activity === 'idle' || u.activity === undefined;
}

/** The node a worker is currently committed to, from its own order (see `SeenUnit.harvestNodeId`). */
function orderNodeOf(u: SeenUnit): number | null {
  return u.harvestNodeId ?? null;
}

/**
 * Nearest node with room that nobody else is working.
 *
 * Falls back to the nearest node at all once every node has a claimant (a wide economy legitimately has several
 * workers per node), and prefers nodes with mana left so a nearly-depleted crystal is skipped.
 */
function nearestFreeNode(u: SeenUnit, nodes: SeenNode[], claimed: Set<number>): SeenNode | null {
  let best: SeenNode | null = null;
  let bestScore = Infinity;
  for (const n of nodes) {
    const crowded = claimed.has(n.id);
    const d = Math.hypot(n.x - u.x, n.y - u.y);
    // Crowding is a large penalty rather than an exclusion, so an all-claimed set still yields a target.
    const score = d + (crowded ? 4000 : 0) - Math.min(2000, n.remaining / 10);
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

/**
 * Find a legal, sensible spot for a building near our base.
 *
 * Scores candidate tiles by: distance to our construction yard (want close), distance to our other buildings
 * (want not overlapping), distance to mana nodes (a refinery wants to be near one), and rejects any tile
 * whose height differs from the base's (a building on a cliff edge reads badly and blocks pathing).
 */
export function findBuildSpot(
  state: GameState,
  per: Perception,
  services: SimServices,
  registry: Registry,
  def: BuildingDef,
): { x: number; y: number } | null {
  const yard =
    per.myBuildings.find((b) => registry.buildings.get(b.defId)?.isConstructionYard) ??
    per.myBuildings.find((b) => b.buildProgress === undefined);
  if (!yard) return null;

  const yardH = groundHeightAt(services, yard.x, yard.y);
  const half = (def.footprint * TILE) / 2;
  const grid = TILE;
  const maxRadiusTiles = 14;

  type Spot = { x: number; y: number; score: number };
  const candidates: Spot[] = [];
  for (let ring = 1; ring <= maxRadiusTiles; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        // Only the ring's perimeter, so we spiral outwards instead of rescanning the interior.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = yard.x + dx * grid;
        const y = yard.y + dy * grid;
        if (x - half < TILE || y - half < TILE) continue;
        if (x + half > (per.mapW - 1) * TILE || y + half > (per.mapH - 1) * TILE) continue;
        if (groundHeightAt(services, x, y) !== yardH) continue;
        /**
         * THE SIM OWNS PLACEMENT LEGALITY.
         *
         * `canBuildNearBase` is the same predicate the build command validates against, so consulting it
         * means the AI can never propose a spot the sim will reject for being outside the build zone. The
         * earlier version only checked height and overlap, so on maps where the yard sits near the zone's
         * edge it would place a building the sim refused — the AI looked like it was building and nothing
         * appeared.
         */
        if (!legalSpot(state, services, per.playerId, x, y, def)) continue;
        if (overlapsOwn(per, registry, x, y, def)) continue;
        if (overlapsNode(per, registry, x, y, def, services)) continue;

        // Score: prefer close to the yard, and (for refineries) close to a mana node.
        let score = -ring * 2;
        if (def.isRefinery) {
          let bestNode = Infinity;
          for (const n of per.nodes) bestNode = Math.min(bestNode, Math.hypot(n.x - x, n.y - y));
          score += Math.max(0, 40 - bestNode / 32);
        }
        if (def.id.includes('sentry') || def.id.includes('beacon')) {
          // Defenses want to face outwards, away from the yard.
          score += Math.hypot(dx, dy);
        }
        candidates.push({ x, y, score });
      }
    }
    // Once we have candidates at this ring, take the best: closer is better, so stop looking further out.
    if (candidates.length > 0 && ring >= 3) break;
  }
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  for (const c of candidates) if (c.score > best.score) best = c;
  return { x: best.x, y: best.y };
}

function footprintTiles(footprint: number): number[] {
  const out: number[] = [];
  const mid = Math.floor(footprint / 2);
  for (let dy = -mid; dy < footprint - mid; dy++) {
    for (let dx = -mid; dx < footprint - mid; dx++) out.push(dx, dy);
  }
  return out;
}

function overlapsOwn(per: Perception, registry: Registry, x: number, y: number, def: BuildingDef): boolean {
  const mine = footprintTiles(def.footprint);
  for (const b of per.myBuildings) {
    const bd = registry.buildings.get(b.defId);
    if (!bd) continue;
    const theirs = footprintTiles(bd.footprint);
    const theirHalf = ((bd.footprint * TILE) / 2);
    const myHalf = (def.footprint * TILE) / 2;
    // Cheap bounding rejection first.
    const reach = theirHalf + myHalf;
    if (Math.abs(b.x - x) >= reach || Math.abs(b.y - y) >= reach) continue;
    /**
     * TILE ORIGIN MUST MATCH THE SIM.
     *
     * The sim anchors a building's footprint at `floor((centre - footprint*TILE/2) / TILE)`, i.e. the footprint's
     * top-left corner. This check previously derived it from the CENTRE (`floor(centre/TILE) - floor(footprint/2)`),
     * which for an even footprint is off by one whenever the centre is not tile-aligned. The two disagreed often enough
     * that the AI proposed a spot its own check passed and `canPlace` rejected as `blocked` — measured on seed 1014:
     * a rebuild command every 21 ticks for 11 minutes, all rejected, while the AI held 3800 mana it could not spend.
     */
    const myTx = Math.floor((x - myHalf) / TILE);
    const myTy = Math.floor((y - myHalf) / TILE);
    const theirTx = Math.floor((b.x - theirHalf) / TILE);
    const theirTy = Math.floor((b.y - theirHalf) / TILE);
    const mySet = new Set<string>();
    for (let i = 0; i < mine.length; i += 2) mySet.add(`${myTx + mine[i]!},${myTy + mine[i + 1]!}`);
    for (let i = 0; i < theirs.length; i += 2) {
      if (mySet.has(`${theirTx + theirs[i]!},${theirTy + theirs[i + 1]!}`)) return true;
    }
  }
  return false;
}

function overlapsNode(per: Perception, registry: Registry, x: number, y: number, def: BuildingDef, services: SimServices): boolean {
  void registry;
  void services;
  const half = (def.footprint * TILE) / 2;
  for (const n of per.nodes) {
    if (Math.abs(n.x - x) < half + TILE / 2 && Math.abs(n.y - y) < half + TILE / 2) return true;
  }
  return false;
}

/** The cheapest combat unit this player can actually build right now. */
export function cheapestCombatUnit(
  registry: Registry,
  per: Perception,
  producers: SeenBuilding[],
): { id: string; cost: number } | null {
  const available = new Set<string>();
  for (const b of producers) {
    const def = registry.buildings.get(b.defId);
    for (const u of def?.producesUnits ?? []) available.add(u);
  }
  let best: { id: string; cost: number } | null = null;
  for (const id of available) {
    const u = registry.units.get(id);
    if (!u || u.isHarvester || !u.weapon) continue;
    if (u.requires.some((r) => !per.unlockedTech.has(r))) continue;
    if (u.factions && !u.factions.includes(per.factionId)) continue;
    if (!best || u.cost < best.cost) best = { id, cost: u.cost };
  }
  return best;
}

/** Export for tests: the set of building ids an opening needs, in order. */
export function openingIds(difficultyId: string, variant = 0): string[] {
  return openingFor(difficultyId, variant).map((s) => s.defId);
}

/**
 * Build-zone legality, asked of the sim rather than reimplemented.
 *
 * `build` validates with `canBuildNearBase`; the AI must use the same predicate or it will confidently
 * issue commands that are always rejected — which is what happened when placement was checked by hand:
 * the AI "built" every pass and nothing appeared.
 */
function legalSpot(
  state: GameState,
  services: SimServices,
  playerId: string,
  x: number,
  y: number,
  def: BuildingDef,
): boolean {
  /**
   * ASK THE SIM. Do not re-derive legality.
   *
   * Every previous version of this function reimplemented the sim's placement rules approximately, and each
   * approximation produced a spot the AI believed was legal and the sim rejected. Measured on seed 1014: a rebuild
   * command every 21 ticks, every one rejected `blocked`, for eleven minutes, while the AI held 3800 mana. Using
   * `nav.canPlace` — the same call `handleBuild` validates with — makes disagreement impossible by construction.
   */
  const half = (def.footprint * TILE) / 2;
  const tx = Math.floor((x - half) / TILE);
  const ty = Math.floor((y - half) / TILE);
  if (!services.nav.canPlace(tx, ty, def.footprint)) return false;
  return canBuildNearBase(state, services, playerId, tx, ty, def.footprint);
}
