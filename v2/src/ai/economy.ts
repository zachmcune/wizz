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
  /**
   * PULL WORKERS OFF THE LINE WHEN RAIDERS ARRIVE.
   *
   * Workers are the whole economy: losing them is unrecoverable, because the building that trains replacements is also the
   * thing their income pays for. Measured on seed 1000 (mirror): p1's worker line went 10 -> 7 -> 6 -> 0 between minutes 4
   * and 7 while an enemy army camped near its base, and from that point it had NO income — 175 mana, permanently, with no way
   * to buy a 200-cost worker. It had 5 buildings standing and could not use any of them for the rest of the match.
   *
   * A human player pulls wisps off the line the moment raiders show up. So do we: any worker within `FLEE_RADIUS` of a
   * visible enemy unit runs to the sanctum and waits there. They are re-tasked automatically once the area is clear, because
   * `isIdleHarvester` sees them as idle again.
   */
  /**
   * FLEE EARLY ENOUGH TO ACTUALLY ESCAPE.
   *
   * A worker mines at a node **453 units** from home on this map. With a 300-unit threat radius the AI only reacted once a raider
   * was already between the worker and safety, which is too late: measured on seed 1035, the flee fired 64 times and the worker
   * line still went 10 -> 0 between minutes 8 and 9, because fleeing meant crossing open ground under fire.
   *
   * The radius has to be wide enough to escape but narrow enough not to fire constantly. At 560 it fired on EVERY pass once both
   * armies sat near each other's bases: measured, both sides logged "pulling 7-10 workers off the line" continuously, so no worker
   * ever mined and a normal-vs-normal match ran 30 minutes without resolving. 380 is still wider than the 300 that proved too short,
   * but only triggers for a raider that is genuinely close.
   */
  /**
   * THE FLEE RADIUS MUST SCALE WITH HOW CONTESTED THE MAP IS.
   *
   * A fixed 380 units works in a 1v1, where a raider inside 380 of a worker really is coming for it. It breaks down in a
   * free-for-all: four armies roam a map whose nodes are ~1,100 units apart, so SOME enemy weapon unit is almost always
   * within 380 of SOME worker, and the flee fires on every pass for every player.
   *
   * Measured on the 4-player scan (seed 2001, 24 sim-minutes) — every side was worker-starved because its workers were
   * permanently fleeing instead of mining:
   *
   *   p1: 1 worker, 1 army, 100 mana, 8 buildings
   *   p2: 8 workers, 3 army, 180 mana
   *   p3: 7 workers, 4 army, 160 mana
   *   p4: 8 workers, 10 army, 165 mana
   *
   * With no income nobody could build the army that would end the match, so all four survived to the 30-minute cap.
   *
   * The radius now tightens as the number of hostile players grows: the more armies are on the map, the closer a raider has
   * to be before it counts as a threat to a specific worker.
   */
  const hostilePlayers = Math.max(1, per.enemies.length);
  const FLEE_RADIUS = hostilePlayers <= 1 ? 380 : Math.max(200, Math.floor(380 / hostilePlayers));
  const raiders = per.enemyUnits.filter((e) => e.weapon);
  if (raiders.length > 0) {
    /**
     * A WORKER CARRYING MANA IS NEVER INTERRUPTED — it is on its way to deposit, and cancelling that order throws the whole
     * trip away. Observed on seed 1000: two workers stuck forever at `busy` with `carry 75/75` and NO order, because a flee
     * order had replaced their harvest order and the harvest system only runs for `type === 'harvest'` entities. The player
     * then had zero income for sixteen minutes with thirteen live mana nodes on the map.
     */
    const fleeing = harvesters.filter(
      (h) =>
        (h.carry ?? 0) <= 0 && raiders.some((e) => Math.hypot(e.x - h.x, e.y - h.y) < FLEE_RADIUS),
    );
    if (fleeing.length > 0) {
      /**
       * WITHDRAW TO THE NEAREST DEFENDED POINT, NOT ALWAYS THE HQ.
       *
       * Running to the sanctum means crossing whatever ground the raider is on. The nearest own building with a weapon (a
       * sentry) or the sanctum if none exists is closer and is where the damage is actually coming from.
       */
      const armed = per.myBuildings.filter((b) => (registry.buildings.get(b.defId)?.weapon?.damage ?? 0) > 0);
      const safe =
        (armed.length > 0
          ? armed
              .map((b) => ({ b, d: Math.hypot(b.x - (fleeing[0]?.x ?? b.x), b.y - (fleeing[0]?.y ?? b.y)) }))
              .sort((x, y) => x.d - y.d)[0]!.b
          : null) ??
        per.myBuildings.find((b) => registry.buildings.get(b.defId)?.isConstructionYard) ??
        per.myBuildings[0];
      if (safe) {
        commands.push({
          type: 'move',
          playerId: pid,
          entityIds: fleeing.map((h) => h.id),
          x: safe.x,
          y: safe.y,
        });
        notes.push(`pulling ${fleeing.length} worker(s) off the line — raiders within ${FLEE_RADIUS}`);
        /**
         * Fleeing workers must not ALSO be handed a harvest order this pass, or the two orders fight and they stand still
         * while being shot. Returning here keeps the flee authoritative for this decision, and the next pass re-tasks them
         * from a safe position.
         */
        return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
      }
    }
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
  /**
   * ARMY THROUGHPUT IS THE LEVER THAT ACTUALLY DECIDES MATCHES.
   *
   * The lever ablation measured every micro behaviour — focus fire, retreat, kiting, counters, scouting — at a delta of ZERO
   * wins, and a "wait for army parity before attacking" lever made the harder difficulties dramatically WORSE. Aggression and
   * production rate decide games here, so `targetProduction` (declared on every profile and read by NOTHING until now) is
   * wired into the build order: a profile that wants more production buildings finishes its opening and then keeps adding
   * them, which is the difference between fielding a wave every 40 seconds and every 90.
   *
   * It is a legal decision a human makes, not a handicap: the buildings cost the same and are built with the same income.
   */
  const wantProduction = Math.max(1, profile.targetProduction);
  const extraProducerDef = registry.buildings.get('summoning_circle');
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
  /**
   * WORKER COUNT SCALES FROM A SMALL BASE, AND ONLY REFINERIES ADD TO IT.
   *
   * The previous formula was `min(8 + refineries*4, max(8, refineries*perRefinery, producers*4))`. With ZERO refineries
   * both sides of that clamp evaluate to 8, so the AI bought EIGHT workers (1600 mana) before it had built anything that
   * trains an army — and then could not afford the 550 summoning circle for minutes. Measured on seed 1000, mirror match:
   *
   *   min 1: 5 wisps, mana 125, 2 buildings
   *   min 4: 12 wisps, mana 375, 4 buildings, army 0
   *   min 6:  7 wisps, mana  50, 4 buildings, army 0    <- workers dying, no army ever built
   *   min 9: p1 eliminated
   *
   * A worker costs 200 and returns income slowly; the summoning circle is what turns income into an army. Starting at four
   * workers — enough to mine the two starting nodes without saturating them — and adding three per completed refinery keeps
   * the economy growing with the thing that actually supports it.
   */
  const wantedHarvesters = Math.min(
    12,
    Math.max(4, refineries * profile.harvestersPerRefinery > 0 ? 4 + refineries * 3 : 4, producersOf(per, registry).length * 2),
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
  const belowWorkerFloor = harvesters.length < 4;
  let reservedForBuild = 0;
  // While the worker line is broken, nothing may be hoarded for a building: the income is what makes everything else possible.
  if (belowWorkerFloor) reservedForBuild = 0;

  if (harvesters.length === 0 && per.mana < workerCost) {
    /**
     * NEVER SELL THE BUILDING THAT MAKES WORKERS.
     *
     * The first version protected the yard and refineries but not the producer that trains harvesters, so on seed 1035 the AI
     * sold its last attunement spire and made the deadlock permanent: with no spire it could never build a worker again, and no
     * amount of selling could help. Selling only counts as a rescue if the thing being sold is not the road back.
     */
    const makesWorkers = (defId: string): boolean =>
      (registry.buildings.get(defId)?.producesUnits ?? []).some((u) => registry.units.get(u)?.isHarvester === true);
    const expendable =
      per.myBuildings.find(
        (b) => registry.buildings.get(b.defId)?.menuCategory === 'defenses' && !makesWorkers(b.defId),
      ) ??
      per.myBuildings.find((b) => {
        const d = registry.buildings.get(b.defId);
        if (!d) return false;
        if (d.isConstructionYard || d.isRefinery) return false;
        if (makesWorkers(b.defId)) return false;
        return (d.producesUnits?.length ?? 0) === 0;
      });
    if (expendable) {
      commands.push({ type: 'sellBuilding', playerId: pid, buildingId: expendable.id });
      notes.push(`SELLING ${expendable.defId} to recover from a zero-worker economy`);
      return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
    }
  }

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

  /**
   * ------------------------------------------------------------------ 4a. production capacity
   *
   * Keeps adding unit producers up to the profile's `targetProduction`. A single producer turns income into an army at one
   * unit at a time; three producers can field a wave in a third of the time, and the ablation measured production rate as the
   * thing that decides matches. This is the difficulty lever that actually moves the win rate.
   */
  if (extraProducerDef && wantProduction > 1) {
    const producersNow =
      per.myBuildings.filter((b) => b.buildProgress === undefined && registry.buildings.get(b.defId)?.producesUnits?.length)
        .length + inProgressCount(per, extraProducerDef.id);
    // Only after the opening's own power and economy are in place, so production does not starve the thing that funds it.
    const economyReady = per.myBuildings.some((b) => b.defId === 'ley_conduit' && b.buildProgress === undefined);
    if (producersNow < wantProduction && economyReady && per.mana >= extraProducerDef.cost) {
      const spot = findBuildSpot(state, per, services, registry, extraProducerDef);
      if (spot) {
        commands.push({ type: 'build', playerId: pid, defId: extraProducerDef.id, x: spot.x, y: spot.y });
        notes.push(`production ${producersNow + 1}/${wantProduction} for army throughput`);
      }
    }
  }

  /**
   * ------------------------------------------------------------------ 4c. EXPANSION — a forward refining base
   *
   * WHAT AN EXPANSION ACTUALLY IS HERE, measured from the map rather than assumed. A building must be within 7 tiles of an
   * existing friendly structure, and every start position sits **14.1 tiles** from its richest node (a 25,000 node) and 30+ tiles
   * from the next one. So:
   *
   *   • the 2000-cost Waystone Wagon — which can deploy anywhere — is unusable in practice: measured over a whole match both
   *     difficulties hovered at 180-399 mana because the army spends everything, so 2000 was never reached;
   *   • a remote node 30 tiles out would need a 4-5 building chain, which costs more than the node is worth;
   *   • the RICH node at 14 tiles needs only a **two-building chain**, and taking it doubles the reachable mana.
   *
   * So an expansion is a forward refining base on the rich node next to home: two cheap structures to bridge the build zone, then a
   * refinery and a turret on the node itself. That is a real second base — separate income, separate thing to defend — which is what
   * the target asks for, and it is affordable at 750 for the refinery rather than 2000 for a wagon.
   *
   * DIFFICULTY LEVERS: `targetBases` (1 = never, Normal 2, Hard 3), `expandAfterSeconds` (Hard 70 s earlier) and
   * `defendExpansions` (units stationed at the new site).
   */
  if (profile.targetBases > 1 && elapsedSeconds >= profile.expandAfterSeconds) {
    const bases = countBases(per, registry);
    const site = bestExpansionSite(per, registry, services);

    if (site && bases < profile.targetBases) {
      const spireDef = registry.buildings.get('attunement_spire');
      const chainDef = registry.buildings.get('stone_wall');
      const turretDef = registry.buildings.get('arcane_sentry');

      // How far is the site from the nearest owned building, in tiles?
      const nearOwn = per.myBuildings.reduce(
        (best, b) => Math.min(best, Math.hypot(b.x - site.x, b.y - site.y)),
        Infinity,
      );

      /**
       * STEP 1 — bridge the build zone with cheap structures.
       *
       * Each step is placed at the furthest legal point toward the site, so the chain is as short as possible. `stone_wall` costs 40,
       * which is trivial next to the refinery it unlocks.
       */
      /**
       * Hard cap on bridging. Two links reach a 14-tile node; more than four means the target is unreachable and the AI should stop
       * spending rather than pave the map. Measured without this cap: 92 stone walls in one match and still no expansion.
       */
      const bridges = per.myBuildings.filter((b) => b.defId === 'stone_wall').length;
      /**
       * CHAIN BUDGET, from the distance actually required.
       *
       * The measured second cluster is 30.6 tiles from home and a link reaches ~6 tiles beyond the 7-tile zone, so it needs 4-5
       * links. The budget is derived from the distance rather than fixed, and hard-capped at 6 so a mis-chosen target can never pave
       * the map again — the run that taught this lesson laid **92 stone walls** in one match.
       */
      const siteTiles = site ? Math.hypot(site.x - per.myBuildings[0]!.x, site.y - per.myBuildings[0]!.y) / TILE : 0;
      const MAX_BRIDGES = Math.min(6, Math.max(2, Math.ceil((siteTiles - 7) / 5)));
      if (nearOwn > TILE * 6 && chainDef && bridges < MAX_BRIDGES) {
        const anchor = per.myBuildings.reduce(
          (best, b) => (Math.hypot(b.x - site.x, b.y - site.y) < Math.hypot(best.x - site.x, best.y - site.y) ? b : best),
          per.myBuildings[0]!,
        );
        /**
         * STEP TO THE EDGE OF THE BUILD ZONE, NOT 85% OF THE WAY.
         *
         * The build zone is 7 tiles, so a link placed at 85% of the remaining distance advances only ~1.4 tiles when the target is 9
         * tiles out — measured, the chain laid five walls in a cluster near the base and advanced a few dozen units toward a node 30
         * tiles away. Placing at ~6 tiles out (just inside the zone) makes each link cover a full zone-step, so 4-5 links cross the 30
         * tiles to the next cluster.
         */
        /**
         * WALK ALONG THE PATH AND TAKE THE FURTHEST LEGAL TILE.
         *
         * The generic ring scan is the wrong tool here: it ranks by proximity to an anchor and by `-ring*2`, so asking it for a tile
         * near a step point 6 tiles from a structure returned a spot in a completely different direction (976,528 for a target at
         * 703,911). A chain link has one job — be as far toward the site as the build zone allows — so it samples the line directly
         * and keeps the deepest legal candidate.
         */
        const toSite = Math.hypot(site.x - anchor.x, site.y - anchor.y) || 1;
        const dirX = (site.x - anchor.x) / toSite;
        const dirY = (site.y - anchor.y) / toSite;
        let linkSpot: { x: number; y: number } | null = null;
        for (let step = TILE * 6; step >= TILE; step -= TILE / 2) {
          const px = anchor.x + dirX * step;
          const py = anchor.y + dirY * step;
          if (isLegalBuildSpot(state, services, per, registry, chainDef, px, py)) {
            linkSpot = { x: px, y: py };
            break;
          }
        }
        if (per.mana >= chainDef.cost) {
          const spot = linkSpot ? snapToTile(linkSpot) : null;
          if (spot) {
            commands.push({ type: 'build', playerId: pid, defId: chainDef.id, x: spot.x, y: spot.y });
            notes.push(`EXPANDING: bridging the build zone toward a rich node (${Math.round(nearOwn)} away)`);
            return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
          }
        }
      }

      /**
       * STEP 2 — the refinery itself, on the node. This is the base.
       */
      if (nearOwn <= TILE * 6 && spireDef && per.mana >= spireDef.cost) {
        const spot = findBuildSpot(state, per, services, registry, spireDef, { x: site.x, y: site.y });
        if (spot) {
          commands.push({ type: 'build', playerId: pid, defId: spireDef.id, x: spot.x, y: spot.y });
          notes.push(`EXPANDING: forward refinery — base ${bases + 1}/${profile.targetBases}`);
          return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
        }
      }
      // Hold money for the refinery while it is out of reach, rather than letting the army spend it.
      if (nearOwn <= TILE * 6 && spireDef && per.mana < spireDef.cost) {
        notes.push(`saving to expand (${Math.round(per.mana)}/${spireDef.cost})`);
        return { commands, notes, blockedOnPlacement: false, reservedForBuild: Math.max(0, spireDef.cost - per.mana) };
      }

      /**
       * STEP 3 — a turret at the new base, so it is not a gift. Only once the refinery is standing there.
       */
      if (nearOwn <= TILE * 6 && turretDef && profile.defendExpansions > 0) {
        const hasOwnTurret = per.myBuildings.some(
          (b) => b.defId === 'arcane_sentry' && Math.hypot(b.x - site.x, b.y - site.y) < TILE * 6,
        );
        if (!hasOwnTurret && per.mana >= turretDef.cost) {
          const spot = findBuildSpot(state, per, services, registry, turretDef, { x: site.x, y: site.y });
          if (spot) {
            commands.push({ type: 'build', playerId: pid, defId: turretDef.id, x: spot.x, y: spot.y });
            notes.push('EXPANDING: turret at the forward base');
            return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
          }
        }
      }
    }

    /**
     * DEFEND THE FORWARD BASE.
     *
     * An expansion that is planted and abandoned is mana given away. `defendExpansions` units go to the newest base when enemies are
     * seen near it — a real cost, which is why Normal commits 2 and Hard 4.
     */
    if (profile.defendExpansions > 0 && bases > 1) {
      const newest = newestBase(per, registry);
      if (newest) {
        const threatened = per.enemyUnits.some((e) => Math.hypot(e.x - newest.x, e.y - newest.y) < TILE * 12);
        if (threatened) {
          /**
           * DEFENDING AN EXPANSION MUST NOT DISARM THE MAIN ARMY.
           *
           * `defendExpansions` units were taken from the front of the army on every pass, so a contested expansion pulled the whole
           * force home continuously — measured on hard-vs-normal, which logged "defending expansion with 4 unit(s)" while sitting at
           * 3 army units, and the match ran 32 minutes without either side able to push. The detachment is now capped at a third of
           * the army, so the expansion is covered without the main force being recalled.
           */
          const army = per.myUnits.filter((u) => u.weapon && !registry.units.get(u.defId)?.isHarvester);
          const maxDetach = Math.max(1, Math.floor(army.length / 3));
          const defenders = army.slice(0, Math.min(profile.defendExpansions, maxDetach));
          if (defenders.length > 0) {
            commands.push({
              type: 'attackMove',
              playerId: pid,
              entityIds: defenders.map((d) => d.id),
              x: newest.x,
              y: newest.y,
            });
            notes.push(`defending expansion with ${defenders.length} unit(s)`);
          }
        }
      }
    }
  }

  /**
   * ------------------------------------------------------------------ 4b. static defense
   *
   * A BASE DEFENSE LAYER, SO THE FIRST PUSH DOES NOT END THE GAME.
   *
   * Measured before this existed: the first side to mass about ten units attacked, and the defender — holding five units and
   * at most one sentry from the build order — lost its sanctum in about thirteen seconds. Matches ended around minute seven
   * and NO AI EVER REACHED 20 ARMY UNITS in any match, so the mid game never happened and difficulty had no room to express
   * itself. That is the single structural reason both the match-length and the difficulty requirements failed.
   *
   * The build order puts its first sentry at 90 seconds and only ever asks for one. A defended base needs enough turrets to
   * make a ten-unit push cost more than it gains, and they must go up BEFORE the enemy's first wave rather than after.
   *
   * `buildsDefenses` was declared on every difficulty profile and never read anywhere — a dead lever. It is now the gate, so
   * Easy genuinely does not build them and the difference is measurable.
   */
  if (profile.buildsDefenses) {
    const sentryDef = registry.buildings.get('arcane_sentry');
    const sentries = per.myBuildings.filter((b) => b.defId === 'arcane_sentry').length +
      inProgressCount(per, 'arcane_sentry');
    // Scale the ring with the threat: one turret per ~8 enemy army units seen, never fewer than 2 once affordable.
    const enemyArmy = per.enemyUnits.filter((u) => u.weapon).length;
    /**
     * DEFENSE COMPETES WITH ARMY FOR THE SAME MANA, SO IT MUST YIELD.
     *
     * A turret costs 250 and comes out of the same pool as a soldier. Without a brake the AI kept buying turrets while its
     * army stayed small: measured on seed 1000, p1 sat on 3 defenses and 4 army at minute 10 while p2 — which had 2 defenses
     * — fielded 10, then 19, then 22 and won. Static defense does not win fights, it only buys time; time is worthless
     * without an army to use it.
     *
     * So the ring is capped by the army that exists: at most one turret per three soldiers, and never more than the threat
     * justifies. A bigger army raises the cap, which is the correct feedback direction.
     */
    const myArmy = per.myUnits.filter((u) => u.weapon && !registry.units.get(u.defId)?.isHarvester).length;
    const wantSentries = Math.min(
      Math.min(6, Math.max(2, 2 + Math.floor(enemyArmy / 8))),
      Math.max(2, Math.floor(myArmy / 3)),
    );
    if (
      sentryDef &&
      sentries < wantSentries &&
      per.mana >= sentryDef.cost &&
      inProgressCount(per, 'arcane_sentry') === 0 &&
      elapsedSeconds >= 25
    ) {
      const spot = findBuildSpot(state, per, services, registry, sentryDef);
      if (spot) {
        commands.push({ type: 'build', playerId: pid, defId: sentryDef.id, x: spot.x, y: spot.y });
        notes.push(`static defense ${sentries + 1}/${wantSentries} against ${enemyArmy} seen`);
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
  /**
   * A LIQUIDITY CRISIS HAS TO BE SOLD OUT OF, OR IT NEVER ENDS.
   *
   * With zero workers the economy has no income, and the reserve below holds back the ENTIRE bank to buy a worker that costs 200
   * when the bank holds 120-190 — so the worker is never affordable and income never returns. Measured on seeds 1035 and 1042,
   * which both froze from minute 10 to the end of a 23-minute match with **61,047 mana still on the map** and both sides at 0
   * workers: the map was not dry, the economy was deadlocked.
   *
   * The map is not the problem there, so raising node capacity would not have fixed it. A player in that position sells something:
   * a defence is worth less than the income to rebuild an army. The AI now does the same — one non-essential building per pass
   * until it can afford a worker again.
   */
  /**
   * A DEPLETED WORKER LINE TAKES PRIORITY OVER EVERYTHING ELSE.
   *
   * Measured on seed 1035: 30 worker deaths, **24 of them between minutes 7 and 8** in a single raid. The AI then held ~150 mana
   * against a 200-cost worker and could never rebuild, so income stayed at zero for the remaining 15 minutes of the match while
   * 61,047 mana sat untouched on the map.
   *
   * Below four workers nothing else matters — not defence, not army, not the next build step. That spending already tried to
   * happen (4-5 `produce` commands were rejected for `mana`), so the failure was liquidity, not intent. This makes the AI stop
   * committing its bank elsewhere while it is below the floor, which is what a player does instinctively.
   */
  if (starving) {
    // Hold back exactly one worker so the military planner cannot spend the economy's recovery.
    reservedForBuild = Math.max(0, Math.min(workerCost, per.mana));
  } else if (activeStep) {
    const def = registry.buildings.get(activeStep.defId);
    if (def && inProgressCount(per, activeStep.defId) === 0) {
      /**
       * A DISTANT GOAL STILL NEEDS A SHARE, BUT THE ARMY STILL NEEDS ITS OWN.
       *
       * Two failure modes measured on the same seed:
       *   - reserving only within 400 of the cost: `saving for attunement_spire (200/750)` repeated 253 times in twelve
       *     minutes, so NO step above ~400 mana was ever reachable and the AI stayed on six buildings;
       *   - reserving everything past the halfway point: the AI held the whole bank, built no army, and was eliminated at
       *     minute 9.
       *
       * So the reserve is a share of the bank that never exceeds the remaining cost: 35% while far away, rising toward the
       * cost as it gets close, leaving at least 260 spendable so a defence can always be bought.
       */
      const gap = Math.max(0, def.cost - per.mana);
      const share = gap > def.cost * 0.5 ? 0.35 : 0.6;
      reservedForBuild = Math.max(0, Math.min(Math.floor(per.mana * share), Math.max(0, per.mana - 260)));
    }
  }

  /**
   * THE WORKER RESERVE — a floor that is never spent below while harvesters are short.
   *
   * The economy must never commit its last worker's worth of mana. Measured on seed 1000 with the roomier economy: p2 held
   * **155 mana with two attunement spires and zero harvesters** — one spire could have trained a replacement worker for 200, but
   * the bank was 45 short and no worker means no income, so it stayed 45 short forever while p1 sat on 111,700 untouched mana.
   * Nothing could be sold either, because the yard and both spires are all load-bearing.
   *
   * So while the worker line is short, the reserve is at least the cost of the next worker — capped by what is actually in the
   * bank, since reserving more than you have is the same as reserving all of it. Above the floor the existing build-order share
   * applies unchanged, because the army still needs its own money.
   */
  if (harvesters.length < 2) {
    const workerFloor = Math.min(workerCost, per.mana);
    reservedForBuild = Math.max(reservedForBuild, workerFloor);
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
  /**
   * A WORKER WITH NO HARVEST ORDER IS IDLE, whatever its movement state says.
   *
   * `activity` reports `busy` for any unit that is not idle/harvesting/returning, so a worker holding a stale `move` order
   * reported `busy` and was never re-tasked — while producing nothing. Measured on seed 1035 (hard vs normal), which ran the
   * full 30 minutes: the player's only harvester sat at its destination with `carry: 0`, permanently `busy`, on a map with 13
   * live mana nodes. Income was zero and the economy could never recover, so the match could not end.
   *
   * `harvestNodeId` is present only when a `harvest` order is actually active, so its absence is the reliable signal that
   * the worker is not contributing. A worker CARRYING mana is never re-tasked — it is on its way to deposit, and
   * interrupting that throws the trip away.
   */
  if ((u.carry ?? 0) > 0) return false;
  if (u.harvestNodeId !== undefined) return false;
  return u.activity === 'idle' || u.activity === undefined || u.activity === 'moving' || u.activity === 'busy';
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
  let bestHash = 0;
  for (const n of nodes) {
    const crowded = claimed.has(n.id);
    const d = Math.hypot(n.x - u.x, n.y - u.y);
    // Crowding is a large penalty rather than an exclusion, so an all-claimed set still yields a target.
    const score = d + (crowded ? 4000 : 0) - Math.min(2000, n.remaining / 10);
    /**
     * SYMMETRIC TIE-BREAK, not array order.
     *
     * `score < bestScore` kept the first node on a tie, and `nodes` is built in entity-slot order — which is node
     * allocation order, a fixed geographic sequence. Two workers equidistant from two nodes would therefore always pick
     * the lower-indexed one, and in a mirror that is a different compass direction for each base. The position hash
     * carries no directional bias and is stable across replays.
     */
    if (score < bestScore || (score === bestScore && spotHash(n.x, n.y) < bestHash)) {
      bestScore = score;
      best = n;
      bestHash = spotHash(n.x, n.y);
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
  /**
   * Optional point to build TOWARD.
   *
   * Expansion needs buildings at a specific remote site, not merely "somewhere near the yard". Passing a target biases the score so
   * the chosen spot is as close to it as the build zone and terrain allow, while every legality check still comes from the sim.
   */
  prefer?: { x: number; y: number },
): { x: number; y: number } | null {
  /**
   * WHERE THE SCAN IS ANCHORED.
   *
   * Normally the yard, because economy buildings belong near the base. But the ring scan only reaches `maxRadiusTiles`, so anchoring
   * on the yard makes it IMPOSSIBLE to build beyond that radius — measured: an expansion chain laid five stone walls in a tight
   * cluster beside the base and never advanced toward its target 30 tiles away.
   *
   * When a `prefer` point is supplied the scan anchors on the nearest OWNED BUILDING to that point instead, so each link extends
   * from the furthest structure already built and the chain actually walks toward the target.
   */
  /**
   * WITH A TARGET, SCAN AROUND THE TARGET ITSELF.
   *
   * Anchoring on the nearest owned building searches rings outward from THERE, so the scan can never propose a tile near the target —
   * measured: asking for a spot near (656,1424) returned (528,624), which is FURTHER from the target than the untargeted answer
   * (688,720). Scanning around the target and keeping only zone-legal, buildable tiles makes the chain actually advance.
   */
  const yard = prefer
    ? { x: prefer.x, y: prefer.y, id: -1, defId: '', buildProgress: undefined }
    : (per.myBuildings.find((b) => registry.buildings.get(b.defId)?.isConstructionYard) ??
      per.myBuildings.find((b) => b.buildProgress === undefined));
  if (!yard) return null;

  const yardH = groundHeightAt(services, yard.x, yard.y);
  const half = (def.footprint * TILE) / 2;
  const maxRadiusTiles = 14;
  /**
   * Where the threat is, for placing defenses on the side that matters.
   *
   * Prefer the centroid of visible enemy units (an actual attack in progress); fall back to nothing, which leaves the
   * outward bias to do the work.
   */
  const threatDir = (() => {
    const enemies = per.enemyUnits.filter((e) => e.weapon);
    if (enemies.length === 0) return null;
    let sx = 0;
    let sy = 0;
    for (const e of enemies) {
      sx += e.x;
      sy += e.y;
    }
    return { x: sx / enemies.length, y: sy / enemies.length };
  })();
  /**
   * WHERE A DEFENSE ACTUALLY EARNS ITS KEEP.
   *
   * On this map a base's nearest mana node is **453 units** away while a sentry's range is 165, so a turret beside the
   * sanctum can never protect the worker line — measured: sentries at (208,208) and (720,208) with the workers dying at
   * (784,784), every one of them out of range. Workers were being killed at a node no defense could reach.
   *
   * Defenses are therefore anchored on the ECONOMY rather than the sanctum: the live node closest to home, which is where
   * the workers actually stand and where an early raid does its damage.
   */
  const defenseAnchor = (() => {
    const yardNode = per.nodes
      .filter((n) => n.remaining > 0)
      .map((n) => ({ n, d: Math.hypot(n.x - yard.x, n.y - yard.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (yardNode && yardNode.d < TILE * 20) return { x: yardNode.n.x, y: yardNode.n.y };
    return { x: yard.x, y: yard.y };
  })();

  type Spot = { x: number; y: number; score: number };
  const candidates: Spot[] = [];
  for (let ring = 1; ring <= maxRadiusTiles; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        // Only the ring's perimeter, so we spiral outwards instead of rescanning the interior.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        /**
       * BUILD CANDIDATES ARE TILE-ALIGNED ON THE FOOTPRINT ORIGIN, NOT OFFSET FROM THE YARD CENTRE.
       *
       * This used to be `x = anchor.x + dx * TILE`, a world-unit offset from the yard's CENTRE. Placement then goes
       * through `buildingOrigin`, which is `floor((x - footprint*TILE/2) / TILE)`. For an EVEN footprint that floor is not
       * mirror-covariant: a 2x2 spire at x=528 resolves to tiles [15,16], but the mirror position x=3568 resolves to
       * [110,111] when the mirror of [15,16] is [111,112]. The rounding is one tile off, and always toward -x.
       *
       * The effect was that the two bases had genuinely different buildable aprons. `audit/symmetry-break.ts` caught it
       * as the first divergence of a mirror match, at t=1s, before any unit moved:
       *
       *   p1  attunement_spire at (544,544)
       *   p2  attunement_spire at (544,512) after reflection — one tile row apart
       *
       * and `audit/mirror4way.ts` measured the consequence: the lower-x corner won 16 of 16 games, regardless of which
       * player id or creation index occupied it. That is the positional bias this whole investigation started from.
       *
       * Working in TILE space instead removes the rounding entirely: the candidate origin is the yard's own origin tile
       * plus (dx, dy), so the candidate set is exactly mirror-covariant. The world position is then the centre of that
       * footprint, reconstructing the same coordinate the sim will compute.
       */
      /**
       * ECONOMY buildings cluster on the yard; DEFENSES cluster on the economy they are protecting.
       */
      const anchor = def.menuCategory === 'defenses' ? defenseAnchor : { x: yard.x, y: yard.y };
      /**
       * THE ANCHOR'S OWN FOOTPRINT SETS THE PARITY OF THE CHILD'S OFFSET.
       *
       * A mirror maps a tile at `o` to `mapTiles - fp - o`. Anchoring a child on the parent's ORIGIN and stepping by
       * `dx` therefore only mirrors correctly when the parent's footprint and the child's have the same parity. Here the
       * parent is a 3-wide sanctum and the most important child is a 2-wide refinery, so it does not:
       *
       *   left sanctum origin 13, child at dx = -2  -> child origin 11, whose mirror is 126 - 11 = 115
       *   right sanctum origin 112, chosen at dx = +2 -> child origin 114         (one tile short of 115)
       *
       * That one tile moved the whole buildable apron, and it showed up as the entire remaining positional bias: with both
       * halves of the map byte-identical and the nodes exact mirror pairs, `audit/corner-pairs.ts` still found corner 1
       * beating corner 0 in 11 of 11 games, and `audit/symmetry-break.ts` still caught one side's first refinery a tile
       * away from the other's at t=1s.
       *
       * The fix is to anchor on the parent's footprint CENTRE in half-tiles and rebuild the child origin from that, which
       * makes the offset relation `dx' = (parentFootprint - childFootprint) - dx` and is exactly covariant for any parity
       * combination:
       *
       *   dx' = (3 - 2) - dx = 1 - dx      for a 2-wide child of a 3-wide sanctum
       */
      const anchorFootprint = (() => {
        const b = per.myBuildings.find((x2) => x2.x === anchor.x && x2.y === anchor.y);
        const d = b ? registry.buildings.get(b.defId) : undefined;
        return d?.footprint ?? def.footprint;
      })();
      const anchorTx = Math.floor((anchor.x - (anchorFootprint * TILE) / 2) / TILE);
      const anchorTy = Math.floor((anchor.y - (anchorFootprint * TILE) / 2) / TILE);
      /**
       * THE REFLECTION OFFSET IS `(anchorFootprint - childFootprint)`, AND IT ONLY BITES WHEN PARITIES DIFFER.
       *
       * Under an x-mirror a tile at `o` maps to `mapTiles - footprint - o`. If the left base scans `dx` and the right base
       * scans `dx'`, the two child origins are `anchorTx + dx` and `anchorTx' + dx'`, whose sum must be
       * `mapTiles - childFootprint`. Since the anchor origins themselves satisfy
       * `anchorTx + anchorTx' = mapTiles - anchorFootprint`, the offsets must satisfy
       *
       *   dx + dx' = anchorFootprint - childFootprint
       *
       * so `dx' = (anchorFootprint - childFootprint) - dx`. When the two footprints have the SAME parity that difference is
       * even and plain `-dx` is off by a whole tile whenever it is not zero — which is exactly the 3-wide sanctum with a
       * 2-wide refinery: `dx' = 1 - dx`, not `-dx`.
       *
       * The scan therefore walks the left base's offsets and derives the child origin from the ANCHOR-FOOTPRINT grid, with
       * the parity difference folded in. Applying it as a flat `-dx - 0.5` (as an earlier attempt did) rounds straight back
       * to `-dx` and changes nothing.
       */
      const parityDelta = anchorFootprint - def.footprint;
      /**
       * APPLY THE PARITY DELTA ON THE SIDE THAT NEEDS IT.
       *
       * The condition `dx + dx' = anchorFootprint - childFootprint` has to hold across the two bases, so it is enough to
       * shift ONE side by `parityDelta` and leave the other scanning exactly `dx`. The side is chosen from the base's own
       * position relative to the map's vertical axis, which is published map data — the same class of information as
       * `tileWalkable` and the start locations.
       *
       * Choosing by side rather than adding a constant keeps the left base's scan identical to what it always was, so no
       * measured behaviour on the left half changes; only the mirrored base's offset is corrected.
       */
      /**
       * THE PARITY CORRECTION IS NEEDED ON BOTH AXES, AND MUST BE 180-DEGREE COVARIANT.
       *
       * The sanctum is 3-wide and the refinery 2-wide in BOTH axes, so the offset relation `dx' = 1 - dx` applies to y as
       * well as x. Correcting only x left the diagonal pairing (corner 0 against corner 3, which are a 180-degree mirror
       * pair) unequal: `audit/corner-pairs.ts` measured `p1@c0 vs p2@c3` at 2/8 while `p1@c3 vs p2@c0` was 8/8, with the
       * map itself verified invariant under 180-degree rotation (0 tile and 0 height mismatches, all 13 mana nodes paired).
       *
       * Selecting the corrected side by "right half OR bottom half" keeps the rule covariant under that rotation, because
       * 180 degrees maps the right half onto the left and the bottom onto the top — so exactly one base in each mirrored
       * pair takes the delta on each axis, whichever quadrant it starts in.
       */
      const mapTilesWide = per.mapW;
      const mapTilesHigh = per.mapH;
      const shiftX = anchorTx * 2 > mapTilesWide ? parityDelta : 0;
      const shiftY = anchorTy * 2 > mapTilesHigh ? parityDelta : 0;
      const originTx = anchorTx + dx + shiftX;
      const originTy = anchorTy + dy + shiftY;
      const x = (originTx + def.footprint / 2) * TILE;
      const y = (originTy + def.footprint / 2) * TILE;
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
        /**
         * When a target point is supplied, closeness to it dominates every other term. Expansion chains need the NEXT link toward a
         * remote node, which "near the yard" scoring would never choose.
         */
        if (prefer) {
          const toTarget = Math.hypot(x - prefer.x, y - prefer.y);
          score += Math.max(0, 400 - toTarget / 4);
        }
        if (def.isRefinery) {
          let bestNode = Infinity;
          for (const n of per.nodes) bestNode = Math.min(bestNode, Math.hypot(n.x - x, n.y - y));
          score += Math.max(0, 40 - bestNode / 32);
        }
        /**
         * DEFENSES MUST FACE THE THREAT, NOT HUDDLE ON THE YARD.
         *
         * The outward bias used to be `+ Math.hypot(dx, dy)` on TILE deltas — a maximum of about 14 against a `-ring*2` term,
         * so it was nearly a no-op and turrets landed 1-3 tiles from the sanctum. Meanwhile the raiders killing the worker
         * line sat 232-244 units out, and a sentry's range is 165: measured on seed 1000, two full-health turrets with
         * `attack: 0` cooldowns had never fired a shot while enemy units killed every worker two tiles beyond their reach.
         *
         * The bias now scales with the actual distance in world units and outweighs the proximity term, so a turret is placed
         * toward the enemy — and, when the enemy direction is known, PREFERABLY toward the side they are coming from.
         */
        if (def.menuCategory === 'defenses' || def.id.includes('sentry') || def.id.includes('beacon')) {
          const worldD = Math.hypot(x - yard.x, y - yard.y) / TILE;
          score += worldD * 12;
          // If we know where the attack is coming from, strongly prefer the arc facing it.
          if (threatDir) {
            const toThreat = Math.hypot(x - threatDir.x, y - threatDir.y);
            score += Math.max(0, 60 - toThreat / 24);
          }
        }
        candidates.push({ x, y, score });
      }
    }
    /**
     * Defenses NEED to reach further than the economy does: their whole purpose is to cover ground the yard does not.
     * The ring cap is therefore per-building rather than a blanket 3.
     */
    /**
     * A TARGETED BUILD MUST REACH THE EDGE OF THE ZONE.
     *
     * The cap stopped the scan 3 tiles from the anchor, which is right for economy buildings placed near the yard but makes a chain
     * link impossible: a link must sit ~6 tiles out to advance the chain a full step. Measured with the cap in place, an expansion
     * chain laid five walls in a tight cluster beside the base and never moved toward its target. With a `prefer` point the cap is
     * wide enough to reach the zone edge.
     */
    const ringCap = prefer
      ? Math.ceil((TILE * 6) / TILE) + 2
      : def.menuCategory === 'defenses' || def.id.includes('sentry')
        ? 9
        : 3;
    if (candidates.length > 0 && ring >= ringCap) break;
  }
  if (candidates.length === 0) return null;
  /**
   * PLACEMENT TIES MUST NOT RESOLVE BY SCAN ORDER — IT WAS A MIRROR BIAS.
   *
   * The scan walks rings outward and, within a ring, `dy` then `dx` from `-ring` upward. Keeping the first candidate with a
   * strictly better score therefore broke every tie toward the TOP-LEFT of the ring, i.e. toward negative x and negative y.
   * In a mirror the two bases face opposite directions, so "toward -y" is a different part of each base's neighbourhood:
   * one side put its first refinery one tile row above the sanctum and the other one below.
   *
   * Measured with `audit/symmetry-break.ts`, which reflects one player's entities through the map's vertical axis and
   * compares against the other player's. The FIRST divergence of a mirror match was at t=1s, before any unit had moved:
   *
   *   p1  attunement_spire at y=544
   *   p2  attunement_spire at y=512   (its mirror image would be 544)
   *
   * Every base after that inherited a slightly different geometry — different wall exposure, different refinery-to-node
   * distance — and the mirror result was 12-0 to whichever corner the scan favoured.
   *
   * So the tie-break is now a SYMMETRIC position hash rather than scan order: it is stable for a given tile (so a replay is
   * identical) and gives no direction any systematic preference.
   */
  let best = candidates[0]!;
  let bestTie = Math.min(best.x, best.y) | 0;
  let bestHash = spotHash(best.x, best.y);
  for (const c of candidates) {
    if (c.score > best.score) {
      best = c;
      bestHash = spotHash(c.x, c.y);
      continue;
    }
    if (c.score < best.score) continue;
    const h = spotHash(c.x, c.y);
    if (h < bestHash) {
      best = c;
      bestHash = h;
    }
  }
  void bestTie;
  return { x: best.x, y: best.y };
}

/**
 * A symmetric, position-only tie-break value.
 *
 * Derived from the tile coordinates and nothing else, so it is deterministic across replays and carries no directional bias
 * (unlike "first in a scan that runs top-left outward"). Two different candidate tiles are overwhelmingly unlikely to
 * collide, and a collision merely means the scan order decides between two equally good spots.
 */
function spotHash(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
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

/**
 * How many separate mining bases a side holds.
 *
 * A "base" is a cluster of owned buildings: buildings within `BASE_CLUSTER` world units of each other belong to the same base.
 * Measured from building positions rather than tracked as state, so it cannot drift from reality — if a forward base is destroyed
 * the count drops and the AI will try to replace it.
 */
export function countBases(per: Perception, registry: Registry): number {
  const pts = per.myBuildings.map((b) => ({ x: b.x, y: b.y }));
  void registry;
  const BASE_CLUSTER = TILE * 12;
  const clusters: { x: number; y: number; n: number }[] = [];
  for (const p of pts) {
    const near = clusters.find((c) => Math.hypot(c.x / c.n - p.x, c.y / c.n - p.y) < BASE_CLUSTER);
    if (near) {
      near.x += p.x;
      near.y += p.y;
      near.n++;
    } else clusters.push({ x: p.x, y: p.y, n: 1 });
  }
  return Math.max(1, clusters.length);
}

/** The centroid of the most recently founded cluster, i.e. the one to defend. */
export function newestBase(per: Perception, registry: Registry): { x: number; y: number } | null {
  const BASE_CLUSTER = TILE * 12;
  const clusters: { x: number; y: number; n: number; id: number }[] = [];
  // Highest entity id = most recently built, so seed clusters from the newest buildings first.
  const sorted = [...per.myBuildings].sort((a, b) => b.id - a.id);
  for (const p of sorted) {
    const near = clusters.find((c) => Math.hypot(c.x / c.n - p.x, c.y / c.n - p.y) < BASE_CLUSTER);
    if (near) {
      near.x += p.x;
      near.y += p.y;
      near.n++;
    } else clusters.push({ x: p.x, y: p.y, n: 1, id: p.id });
  }
  void registry;
  if (clusters.length === 0) return null;
  // The newest cluster is the one seeded by the highest id.
  const newest = clusters.reduce((a, b) => (a.id > b.id ? a : b));
  return { x: newest.x / newest.n, y: newest.y / newest.n };
}

/**
 * The best free mana cluster to expand to.
 *
 * "Free" means a live node with mana that no owned base is already working, and "best" balances remaining mana against distance
 * so the AI does not cross the map for a 3,000 node while a 25,000 node sits two tiles away. Enemies are NOT consulted beyond what
 * the perception already shows, so this stays fog-legal: a site behind fog is chosen on distance and richness alone.
 */
export function bestExpansionSite(
  per: Perception,
  registry: Registry,
  services: SimServices,
): { x: number; y: number } | null {
  const BASE_CLUSTER = TILE * 12;
  const home = per.myBuildings[0];
  if (!home) return null;
  void registry;
  void services;
  /**
   * ONLY CONSIDER A NODE THE BUILD ZONE CAN ACTUALLY REACH.
   *
   * A build zone is 7 tiles, so a node 40 tiles from home needs a 5-building chain that costs more than the node yields. The first
   * version scored richness against distance and picked a 3,000 node **1,314 units** away over the 25,000 node 453 units away,
   * then tried to chain to it — measured as **92 stone walls** and no second base at all.
   *
   * So the search is restricted to nodes within a reachable radius, and those are ranked by DISTANCE first: the cheapest expansion
   * is the nearest one, and the richest node on this map is also the nearest, so the two criteria agree here.
   */
  /**
   * How far a second base may be, in world units.
   *
   * Every start position has its richest node **already served** by its own refinery (measured: a spire 339 units from the 25,000
   * node), so a genuinely separate base has to reach the next cluster, which is 979 units away — about 4 links of chain. Beyond
   * that the chain costs more than the 3,000 mana node yields, so the radius is set to admit that one and no further.
   */
  const REACHABLE = TILE * 34;
  let best: { x: number; y: number; d: number } | null = null;
  for (const n of per.nodes) {
    if (n.remaining <= 0) continue;
    const covered = per.myBuildings.some((b) => Math.hypot(b.x - n.x, b.y - n.y) < BASE_CLUSTER);
    if (covered) continue;
    const d = Math.hypot(n.x - home.x, n.y - home.y);
    if (d > REACHABLE) continue;
    if (!best || d < best.d) best = { x: n.x, y: n.y, d };
  }
  return best ? { x: best.x, y: best.y } : null;
}


/** Round a world point to the centre of its tile, which is where buildings are anchored. */
function snapToTile(p: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.floor(p.x / TILE) * TILE + TILE / 2, y: Math.floor(p.y / TILE) * TILE + TILE / 2 };
}

/**
 * Is this exact point a legal place for `def` — terrain free, node free, and inside the build zone?
 *
 * Uses the SAME predicates the build command validates with (`nav.canPlace`, `canBuildNearBase`) so a chain link the AI proposes can
 * never be rejected by the sim.
 */
function isLegalBuildSpot(
  state: GameState,
  services: SimServices,
  per: Perception,
  registry: Registry,
  def: BuildingDef,
  x: number,
  y: number,
): boolean {
  const half = (def.footprint * TILE) / 2;
  const tx = Math.floor((x - half) / TILE);
  const ty = Math.floor((y - half) / TILE);
  if (!services.nav.canPlace(tx, ty, def.footprint)) return false;
  if (!canBuildNearBase(state, services, per.playerId, tx, ty, def.footprint)) return false;
  if (overlapsOwn(per, registry, x, y, def)) return false;
  if (overlapsNode(per, registry, x, y, def, services)) return false;
  return true;
}
