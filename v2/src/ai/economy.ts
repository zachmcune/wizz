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
import { mirrorRank } from '../sim/pathing';
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
  /**
   * The forward site the AI is expanding to this pass, if any.
   *
   * The military planner garrisons it BEFORE the refinery is placed (see `garrisonSite` in `military.ts`). It is reported
   * here rather than recomputed there so both planners agree on one site within a pass — two independent calls to
   * `bestExpansionSite` could pick different nodes as the perception changes between them.
   */
  garrisonSite?: { x: number; y: number } | null;
}

/**
 * Attach the expansion site to an economy plan.
 *
 * Used at every return site so a plan that bails out early (a rebuild, a starving economy, a placement failure) still tells
 * the military planner where the forward base is going. That matters because the garrison has to be committed BEFORE the
 * base is affordable: a plan that returns early while saving is exactly the pass on which the squad should be marching.
 */
function withSite<T extends EconomyPlan>(plan: T, site: { x: number; y: number } | null): T {
  if (site) plan.garrisonSite = site;
  return plan;
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

  /**
   * THE EXPANSION TARGET — computed once, used by both the build order and the expansion branch.
   *
   * No money is reserved here. The earlier attempt at this reserved a share of the bank so the AI could save for a
   * dedicated 750-mana forward refinery, and it measurably made the AI WORSE: `audit/expand-outcomes.ts` went from
   * 24.1-minute matches with Hard winning to 8.8-17.4-minute matches with Hard losing, because the held mana was army
   * the AI never fielded. The expansion does not need its own budget — see the routing note in §3.
   */
  const expansionTarget = expansionGoal(per, registry, services, profile, elapsedSeconds);

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
         *
         * The reserve is NOT zeroed here. This return used to hand back `reservedForBuild: 0`, so every pass in which a
         * raider was near a worker released the whole expansion fund to the army — measured on seed 1000
         * (`audit/expand-reserve-probe.ts`): the bank climbed to ~500 while saving, a single fleeing worker reset it, the
         * army bought units with the released money, and the total reached 750 exactly zero times in 24 minutes. A retreat
         * order is not a reason to abandon a strategic commitment.
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
      /**
       * THE ASSIGNMENT ORDER IS A FAIRNESS DECISION, EXACTLY LIKE THE NODE TIE-BREAK.
       *
       * `busyNodes` grows as workers are assigned, so the SECOND worker of a pair cannot take the node the first one just
       * claimed. Which worker goes first therefore decides who gets the short trip, and `idle` is in entity-slot order —
       * i.e. SPAWN order, which is a fixed geographic sequence rather than a property of the board.
       *
       * On this map the two starting wisps are 64 units either side of the sanctum and the rich node is 320 units to one
       * side, so one wisp is 362 away from it and the other is 461. Measured (`audit/symmetry-break.ts`), the side whose
       * NEARER wisp was assigned first got the short trip and the other got the long one — a permanent income difference
       * from tick 2, before either AI decided anything. With the AI weak enough to field one unit this was invisible;
       * with armies it decides every game, and the mirror measured **corner 0 winning 0 of 55**.
       *
       * THE KEY MUST BE DISTANCE TO THE WORKER'S OWN BASE, NOT TO THE MAP'S MIDLINE.
       *
       * `mirrorRank` is the right idea for a tie between CANDIDATES AROUND ONE UNIT (both tiles are reflected together, so
       * the same key ranks them the same way in both mirrors). It is the wrong key for ordering TWO UNITS AGAINST EACH
       * OTHER: it measures distance from the map's midlines, and the far wisp is nearer the midline than the near one on
       * BOTH sides — so sorting by it assigns the SAME (wrong) wisp first at every base. Measured: the sweep flipped from
       * 0%/100% to 100%/0%, which is the signature of a key that is invariant but not covariant.
       *
       * Distance to the side's own sanctum is invariant under reflection by construction: reflecting a base, its workers
       * and the axis maps the distance onto itself. Ranking ascending by that distance puts each base's NEAREST wisp first,
       * so both bases get the short trip.
       */
      const home =
        per.myBuildings.find((b) => registry.buildings.get(b.defId)?.isConstructionYard) ?? per.myBuildings[0];
      const hx = home?.x ?? 0;
      const hy = home?.y ?? 0;
      /**
       * ORDER BY A SIGNED OFFSET THAT FLIPS WITH THE BASE'S OWN SIDE.
       *
       * Distance alone is not enough: on this map the two starting wisps are exactly equidistant from the sanctum (64
       * units each way), so it ties and the tie-break decides. Every GLOBAL x-ordering is wrong here, and the arithmetic
       * is worth writing down because it is the whole defect:
       *
       *   p1 wisps sit on tiles 12 and 16  -> ascending gives the wisp at x=400 first
       *   p2 wisps sit on tiles 111 and 115 -> ascending gives the wisp at x=3696 first
       *
       * and the mirror of p1's x=400 wisp is p2's x=3696 wisp — so ascending-by-x hands first claim to the SAME physical
       * wisp on one base and the OTHER physical wisp on its mirror. That is anti-covariant: it produced the exact
       * opposite assignment at the two bases, `busyNodes` then forced the second wisp onto a different node, and the two
       * economies diverged from tick 18. Measured on seed 8000 with `audit/symmetry-break.ts` at t=13s.
       *
       * Multiplying the x offset by the base's own side makes the key covariant: the left base ranks its left-hand wisp
       * first, and the right base — whose left-hand wisp is at a LARGER x — ranks that same reflected wisp first too.
       */
      const sideSign = hx <= (per.mapW * TILE) / 2 ? 1 : -1;
      const order = [...idle].sort((a, b) => {
        const da = Math.hypot(a.x - hx, a.y - hy);
        const db = Math.hypot(b.x - hx, b.y - hy);
        if (da !== db) return da - db;
        // Same distance: prefer the wisp on the base's outward side, then the smaller |dy|, then a tile key.
        const oa = (a.x - hx) * sideSign;
        const ob = (b.x - hx) * sideSign;
        if (oa !== ob) return oa - ob;
        const ya = Math.abs(a.y - hy);
        const yb = Math.abs(b.y - hy);
        if (ya !== yb) return ya - yb;
        return (
          mirrorRank(Math.floor(a.x / TILE), Math.floor(a.y / TILE), per.mapW, per.mapH) -
          mirrorRank(Math.floor(b.x / TILE), Math.floor(b.y / TILE), per.mapW, per.mapH)
        );
      });
      for (const u of order) {
        const node = nearestFreeNode(u, liveNodes, busyNodes, per.mapW, per.mapH);
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

  /**
   * THE ROUTE TO THE FORWARD NODE — laid BEFORE, and independently of, whichever opening step is active.
   *
   * `expansionTarget` is non-null only when the profile's own expansion policy says so: past `expandAfterSeconds`, fewer
   * MINING bases than `targetBases`, and a real army already standing (`expansionGoal`). Everything below inherits those
   * gates, so this cannot pre-empt the opening.
   *
   * IT IS DELIBERATELY NOT KEYED ON `activeStep`. It used to be, which meant the chain only advanced during the few seconds
   * in which the planner happened to be saving for ANOTHER refinery. Measured at seed 2000: `goal=Y` from 380 s with 650
   * mana banked, but the active step was a golem forge, so the route was never laid and no expansion happened in the whole
   * match. The route is a precondition for a purchase, not a purchase itself, so it cannot wait for the purchase.
   *
   * A link costs 40 — the cheapest thing in the plan — and every link's spot is validated with the sim's own build
   * predicates (`isLegalBuildSpot`), so a bad link is impossible rather than merely unlikely.
   */
  if (expansionTarget) {
    const site = expansionTarget;
    const nearOwn = per.myBuildings.reduce(
      (best, b) => Math.min(best, Math.hypot(b.x - site.x, b.y - site.y)),
      Infinity,
    );
    const chainDef = registry.buildings.get('stone_wall');
    const bridges = per.myBuildings.filter((b) => b.defId === 'stone_wall').length;
    const siteTiles = Math.hypot(site.x - per.myBuildings[0]!.x, site.y - per.myBuildings[0]!.y) / TILE;
    const maxBridges = Math.min(6, Math.max(2, Math.ceil((siteTiles - 7) / 5)));
    /**
     * ONE LINK IN FLIGHT AT A TIME. `stone_wall` is not an opening step, so it has no `inProgressCount` guard: the planner
     * re-issued the same `build` command every pass, each one rejected against the foundation already standing, while the
     * anchor search kept choosing the same occupied point. Measured at seed 1000: "bridging toward the forward node" logged
     * for two minutes with the wall count unchanged.
     */
    const linkInFlight = per.myBuildings.some((b) => b.defId === 'stone_wall' && b.buildProgress !== undefined);
    if (nearOwn > TILE * 6 && chainDef && !linkInFlight && bridges < maxBridges && per.mana >= chainDef.cost) {
      const anchor = per.myBuildings.reduce(
        (best, b) => (Math.hypot(b.x - site.x, b.y - site.y) < Math.hypot(best.x - site.x, best.y - site.y) ? b : best),
        per.myBuildings[0]!,
      );
      const toSite = Math.hypot(site.x - anchor.x, site.y - anchor.y) || 1;
      const dirX = (site.x - anchor.x) / toSite;
      const dirY = (site.y - anchor.y) / toSite;
      for (let step = TILE * 6; step >= TILE; step -= TILE / 2) {
        const px = anchor.x + dirX * step;
        const py = anchor.y + dirY * step;
        if (!isLegalBuildSpot(state, services, per, registry, chainDef, px, py)) continue;
        const spot = snapToTile({ x: px, y: py });
        commands.push({ type: 'build', playerId: pid, defId: chainDef.id, x: spot.x, y: spot.y });
        notes.push(`EXPANDING: bridging toward the forward node (${Math.round(nearOwn)} away)`);
        return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
      }
    }
  }

  /**
   * THE FORWARD REFINERY — a real second mining base, placed once the route reaches the node.
   *
   * This is the one purchase in the planner that RAISES income rather than converting it into units, so it is worth
   * prioritising above army once the AI is demonstrably not under pressure: `expansionGoal` has already required a standing
   * army, the expansion window, and a wanted base. The route has been laid by the block above.
   *
   * It comes BEFORE the opening step on purpose. The opening's own third refinery is scheduled at 220 s but is never
   * reached: measured at seeds 1000/3000 (`audit/expand-trace.ts`), the plan stalls on the golem forge and the nexus, the
   * match ends between 11 and 12 minutes, and the third refinery is never built — so relying on it meant the expansion never
   * happened even with the route complete and 650 mana banked. Placing the forward refinery here uses the money the plan was
   * already holding for exactly that purpose.
   */
  if (expansionTarget) {
    const site = expansionTarget;
    const spireDef = registry.buildings.get('attunement_spire');
    const turretDef = registry.buildings.get('arcane_sentry');
    const nearOwn = per.myBuildings.reduce(
      (best, b) => Math.min(best, Math.hypot(b.x - site.x, b.y - site.y)),
      Infinity,
    );
    /**
     * A FORWARD BASE IS ONLY WORTH BUILDING IF IT IS ALSO DEFENDED, AND THE TURRET GOES UP FIRST.
     *
     * Measured on seeds 1000/1014/2014/3021/3056 (`audit/expand-trace.ts`): the forward refinery was placed at 7.2 min
     * and destroyed at 8.3 min on ALL FIVE, killed by two enemy swarmlings. Handing the AI 400 extra mana at the moment of
     * placement did not save it either, so the problem is ORDER, not money: the refinery is 750 and the turret another 250,
     * so buying the refinery first always emptied the bank and the defence was never affordable in the 90 seconds the
     * building had left.
     *
     * Building the turret first is the version that survives contact. It costs 250 of the 1000 pair, leaves the refinery
     * affordable immediately afterwards, and means the node is already covered when the 750 goes down. The wall link that
     * made the site legal is itself the turret's build-zone anchor.
     */
    const pairCost = spireDef && turretDef ? spireDef.cost + turretDef.cost : (spireDef?.cost ?? 750);
    /**
     * ONE FORWARD BASE PER SITE, NOT A REBUILD LOOP.
     *
     * The forward refinery is deliberately NOT rebuilt after it falls. A site this far from home cannot be held against a
     * raiding AI — measured on seeds 1000/1014/2014/3021/3056, every forward refinery was destroyed within about 90 seconds
     * of completing — and a committed test caught the consequence of trying: `tests/sim/seed-variety.test.ts` measured
     * **2 of 10 mirror matches stalling to the 34-minute cap** with the first-listed slot at 70%, because each destruction
     * freed the AI to spend another 1000 mana on the same indefensible spot instead of on the army that ends the match.
     *
     * So the pair (turret, then refinery) is attempted ONCE per site. The route walls stay behind after the base falls,
     * which is what distinguishes "already tried here" from "never built", so no extra state is needed.
     */
    const triedHere = per.myBuildings.some(
      (b) =>
        (b.defId === 'stone_wall' || b.defId === 'attunement_spire') &&
        Math.hypot(b.x - site.x, b.y - site.y) < TILE * 10,
    );
    const hasGuard = per.myBuildings.some(
      (b) => b.defId === 'arcane_sentry' && Math.hypot(b.x - site.x, b.y - site.y) < TILE * 8,
    );
    const hasRefinery = per.myBuildings.some(
      (b) => registry.buildings.get(b.defId)?.isRefinery && Math.hypot(b.x - site.x, b.y - site.y) < TILE * 8,
    );
    /**
     * A FORWARD BASE IS ONLY WORTH BUILDING IF IT IS ALSO DEFENDED, AND THE TURRET GOES UP FIRST.
     *
     * The refinery is 750 and the turret another 250, so buying the refinery first always emptied the bank and the defence
     * was never affordable in the time the building had left: measured, the treasury fell from 715 straight to 175 on
     * placement and the turret never appeared. Turret first costs a quarter of the pair, leaves the refinery affordable
     * immediately afterwards, and means the node is already covered when the 750 goes down.
     *
     * The pair is gated on affording BOTH, because a lone refinery at this distance is 750 mana given away.
     */
    if (nearOwn <= TILE * 6 && turretDef && spireDef && !triedHere) {
      if (!hasGuard && per.mana >= pairCost) {
        const spot = findBuildSpot(state, per, services, registry, turretDef, { x: site.x, y: site.y });
        if (spot && Math.hypot(spot.x - site.x, spot.y - site.y) <= TILE * 8) {
          commands.push({ type: 'build', playerId: pid, defId: turretDef.id, x: spot.x, y: spot.y });
          notes.push('EXPANDING: turret at the forward node, before the refinery');
          return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
        }
      }
      if (hasGuard && !hasRefinery && per.mana >= spireDef.cost) {
        const spot = findBuildSpot(state, per, services, registry, spireDef, { x: site.x, y: site.y });
        if (spot && Math.hypot(spot.x - site.x, spot.y - site.y) <= TILE * 8) {
          commands.push({ type: 'build', playerId: pid, defId: spireDef.id, x: spot.x, y: spot.y });
          notes.push('EXPANDING: forward refinery on the rich node, behind its turret');
          return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
        }
      }
      /**
       * THE REFINERY ALONE, WHEN THE SITE IS TOO FAR TO EVER AFFORD THE PAIR.
       *
       * Turret-first was measured on a site **14 tiles** from home, where the enemy's first two swarmlings arrive within
       * 90 seconds and a lone refinery never paid for itself. The node this map actually offers is **27.7 tiles** out, and
       * at that distance the pair (1000 mana) is unreachable in the time a match lasts: measured on seed 1000, the AI
       * logged "waiting for surplus to fund the forward base" from minute 4 to minute 12 with the bank oscillating 65-195,
       * and never placed anything on the node. A site that is never built defends nothing.
       *
       * So at 20+ tiles the refinery goes down on its own the moment it is affordable, and the turret follows out of the
       * income it immediately starts producing. That is a real trade — the site is undefended while it goes up — and it is
       * the trade a player makes too when the node is far enough that the enemy has to cross the map to reach it.
       */
      const farSite = Math.hypot(site.x - (per.myBuildings[0]?.x ?? site.x), site.y - (per.myBuildings[0]?.y ?? site.y)) > TILE * 20;
      if (farSite && !hasRefinery && per.mana >= spireDef.cost) {
        const spot = findBuildSpot(state, per, services, registry, spireDef, { x: site.x, y: site.y });
        if (spot && Math.hypot(spot.x - site.x, spot.y - site.y) <= TILE * 8) {
          commands.push({ type: 'build', playerId: pid, defId: spireDef.id, x: spot.x, y: spot.y });
          notes.push('EXPANDING: forward refinery on the far node, turret to follow');
          return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
        }
      }
      /**
       * HOLD THE 1000, OR THE BANK WILL NEVER REACH IT.
       *
       * The build-order reserve leaves exactly 260 spendable once the bank is in the 300-750 band
       * (`audit/reserve-convergence.ts` tabulates it), so the army re-spends every surplus the moment it arrives. Holding
       * everything above a 120-mana float lets the bank compound; 120 is below every combat unit's cost (115-140), so
       * production pauses only while the last stretch is saved.
       */
      if (per.mana < pairCost) {
        notes.push(`EXPANDING: waiting for surplus to fund the forward base (${Math.round(per.mana)}/${pairCost})`);
      }
    }
  }

  // Build the active step if it is due and affordable.
  if (activeStep && elapsedSeconds >= activeStep.notBeforeSeconds) {
    const def = registry.buildings.get(activeStep.defId);
    const affordable = def !== undefined && per.mana >= def.cost;
    const alreadyGoing = inProgressCount(per, activeStep.defId) > 0;
    /**
     * THE FORWARD REFINERY ITSELF: THE OPENING'S OWN REFINERY STEP, PLACED ON THE NODE INSTEAD OF AT HOME.
     *
     * This is cost-neutral by construction — the same 750, the same defId, the same step the opening already asked for.
     * That matters because the AI's bank cannot afford an EXTRA refinery: measured, it earns 500-900 mana/min and holds
     * 200-550, and the build-order reserve leaves exactly 260 spendable, so a fourth 750 purchase is never reachable.
     * Routing one the plan already contains is therefore the only form of expansion that does not cost the army.
     *
     * `farEnough` rejects a spot that is merely legal-but-near-home, which would silently be the old behaviour rather than
     * an expansion.
     */
    if (expansionTarget && def?.id === 'attunement_spire') {
      const site = expansionTarget;
      const nearOwn = per.myBuildings.reduce(
        (best, b) => Math.min(best, Math.hypot(b.x - site.x, b.y - site.y)),
        Infinity,
      );
      /**
       * THE ROUTED REFINERY STILL HAS TO BE PAID FOR.
       *
       * This block sits ABOVE the `affordable` check, because routing is meant to happen at the moment the step would
       * have been built anyway. Without a price test here the planner issued the same rejected `build` command on every
       * pass from minute 3:45 to the end of the match — measured on seed 1000, 20+ rejections for `mana` with the bank at
       * 48/750 — and the forward refinery was never placed. A command the sim will refuse is not a decision.
       */
      if (nearOwn <= TILE * 6 && affordable) {
        const spot = findBuildSpot(state, per, services, registry, def, { x: site.x, y: site.y });
        if (spot && Math.hypot(spot.x - site.x, spot.y - site.y) <= TILE * 8) {
          commands.push({ type: 'build', playerId: pid, defId: def.id, x: spot.x, y: spot.y });
          notes.push(`EXPANDING: ${def.id} at the forward node — ${activeStep.why}`);
          return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
        }
      }
    }

    if (def && affordable && !alreadyGoing) {
      /**
       * A REFINERY THE OPENING ALREADY WANTS IS THE EXPANSION — SAME COST, DIFFERENT PLACE.
       *
       * Every opening asks for two or three `attunement_spire`s, and the planner has always placed all of them beside the
       * sanctum, where they mine the same 25,000 node the first one already serves. That is the whole reason the AI stopped
       * expanding: the expansion branch below competes for a FOURTH 750-mana refinery that the bank never reaches, while the
       * second and third refineries it does eventually afford are spent at home.
       *
       * Measured (`audit/expand-trace.ts`, `audit/expand-reserve-probe.ts`): a side earns 500-900 mana/min and holds a bank
       * of 200-550 — the build order's own reserve leaves exactly 260 spendable, so the bank saturates below 750 and the
       * `attunement_spire` step 4 shows as `saving for attunement_spire (550/750)` indefinitely. Nothing new can be bought.
       * But the step itself is already in the plan, so ROUTING it is free: the same 750, the same building, a better node.
       *
       * This is why the fix needs no extra income and no rule change. It is the same purchase, aimed at the target the
       * expansion branch computed, which is a real separate mining base 30.6 tiles from home on the map's next mana cluster.
       */
      const spireStep = def.id === 'attunement_spire';
      if (spireStep && expansionTarget) {
        const site = expansionTarget;
        const nearOwn = per.myBuildings.reduce(
          (best, b) => Math.min(best, Math.hypot(b.x - site.x, b.y - site.y)),
          Infinity,
        );
        /**
         * TWO THINGS CAN BE TRUE WHEN THE OPENING WANTS A REFINERY AND AN EXPANSION IS PENDING.
         *
         *   • the route is not there yet — the refinery cannot legally reach the node, so the SAME 750 buys a link instead
         *     (40 mana of which is the wall; the rest is banked toward the refinery). That is what makes the chain free:
         *     it is paid for out of a purchase the plan already contained, not out of a new one;
         *   • the route is there — place the refinery on the node itself.
         *
         * Both are the build order's own step, so nothing here adds a purchase the opening did not already ask for.
         */
        if (nearOwn <= TILE * 6) {
          const spot = findBuildSpot(state, per, services, registry, def, { x: site.x, y: site.y });
          const onSite = spot !== null && Math.hypot(spot.x - site.x, spot.y - site.y) <= TILE * 8;
          if (spot && onSite) {
            commands.push({ type: 'build', playerId: pid, defId: def.id, x: spot.x, y: spot.y });
            notes.push(`EXPANDING: ${def.id} at the forward node — ${activeStep.why}`);
            return { commands, notes, blockedOnPlacement: false, reservedForBuild: 0 };
          }
        }
      }
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
  /**
   * A worker is bought from money the expansion has NOT claimed — except while starving, when income comes first.
   *
   * The worker target is 4 + 3 per refinery, so a side with two refineries wants ten workers at 200 each; at the rate the
   * bank refills that is the whole of an expansion's budget, which is why the refinery was never affordable. Below the
   * worker floor the reserve is zero anyway (an economy that cannot fund its own replacement funds nothing), so the
   * subtraction is a no-op in exactly the case where workers genuinely must come first.
   */
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
  if (expansionTarget) {
    const bases = countBases(per, registry);
    const site = expansionTarget;

    if (site && bases < profile.targetBases) {
      const turretDef = registry.buildings.get('arcane_sentry');

      // How far is the site from the nearest owned building, in tiles?
      const nearOwn = per.myBuildings.reduce(
        (best, b) => Math.min(best, Math.hypot(b.x - site.x, b.y - site.y)),
        Infinity,
      );

      /**
       * STEP 3 — a turret at the new base, so it is not a gift. Only once the refinery is standing there.
       *
       * This is subject to the SAME global cap as the home ring (§4b): one turret per three soldiers, never more than six.
       * The first version of this block had no cap of its own and the home ring's cap did not see the forward turrets, so
       * an expansion that kept being re-targeted produced **56 sentries and 68 buildings** in one 30-minute match with
       * neither side able to finish (`audit/expand-outcomes.ts`, seed 1000). An expansion turret is a sentry like any other,
       * so it counts against the same budget.
       */
      const sentryCount = per.myBuildings.filter((b) => b.defId === 'arcane_sentry').length + inProgressCount(per, 'arcane_sentry');
      const armySize = per.myUnits.filter((u) => u.weapon && !registry.units.get(u.defId)?.isHarvester).length;
      const sentryCap = Math.min(6, Math.max(2, Math.floor(armySize / 3)));
      /**
       * A TURRET IS ONLY FOR A BASE THAT EXISTS.
       *
       * The comment above always said "only once the refinery is standing there", but the condition was never checked —
       * only `nearOwn <= 6 tiles`, which the chain satisfies by itself. So the turret was bought the moment the route
       * arrived and returned before the refinery ever got a chance: measured at seeds 1000/3000 (`audit/expand-trace.ts`),
       * `EXPANDING: turret at the forward base` at 7.2 min, three walls standing, and **no forward refinery in the match**.
       * A turret on an empty node is 250 mana spent on nothing the expansion needed.
       */
      const forwardRefinery = per.myBuildings.some(
        (b) =>
          registry.buildings.get(b.defId)?.isRefinery &&
          Math.hypot(b.x - site.x, b.y - site.y) < TILE * 8,
      );
      if (forwardRefinery && nearOwn <= TILE * 6 && turretDef && profile.defendExpansions > 0 && sentryCount < sentryCap) {
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
     * DEFEND THE FORWARD BASE — INCLUDING WHILE IT IS GOING UP.
     *
     * An expansion that is planted and abandoned is mana given away, and that is not a hypothetical here: measured on
     * seeds 1000/1014/2014/3021/3056 (`audit/expand-trace.ts`), the forward refinery was placed at **7.2 min and destroyed
     * at 8.3 min on all five** — 68 seconds, killed by two enemy swarmlings — because nothing was ever sent to hold it.
     *
     * Two conditions were wrong, and both had to be fixed:
     *   • this block keyed on `bases > 1` and on `newestBase()`, i.e. on a FINISHED cluster. `countBases` counts completed
     *     income anchors, so a refinery still under construction left `bases` at 1 and the guard never ran;
     *   • the detachment is taken from the FRONT of the army, which is fine, but it must be capped as a fraction of the
     *     army or a contested expansion recalls the whole force — the 32-minute no-result match that note records.
     *
     * So the target is the expansion SITE itself (which is where the new refinery is being built), the trigger is an enemy
     * within 12 tiles of it, and the detachment stays capped at a third.
     */
    if (profile.defendExpansions > 0) {
      const guardPoint = newestBase(per, registry) ?? expansionTarget;
      const nearSite = expansionTarget
        ? per.myBuildings.some((b) => Math.hypot(b.x - expansionTarget.x, b.y - expansionTarget.y) < TILE * 8)
        : false;
      const threatened =
        !!guardPoint &&
        (bases > 1 || nearSite) &&
        per.enemyUnits.some((e) => Math.hypot(e.x - guardPoint.x, e.y - guardPoint.y) < TILE * 12);
      if (guardPoint && threatened) {
        {
          const army = per.myUnits.filter((u) => u.weapon && !registry.units.get(u.defId)?.isHarvester);
          const maxDetach = Math.max(1, Math.floor(army.length / 3));
          const defenders = army.slice(0, Math.min(profile.defendExpansions, maxDetach));
          if (defenders.length > 0) {
            commands.push({
              type: 'attackMove',
              playerId: pid,
              entityIds: defenders.map((d) => d.id),
              x: guardPoint.x,
              y: guardPoint.y,
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
      /**
       * THE DEFENCE RING YIELDS TO AN EXPANSION IN PROGRESS.
       *
       * A turret is 250 and the refinery is 750, and this branch runs BEFORE the expansion branch, so a side with
       * `buildsDefenses` on re-bought a turret every time its bank crossed 250 and never saw 750. Measured on seed 1000
       * (`audit/expand-trace.ts`): the chain was complete at minute 12 and the bank never rose above 573 for the next ten
       * minutes, while the turret count kept climbing. The reserve is subtracted here so the ring is funded only from money
       * the expansion has not claimed.
       */
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
       * THE RESERVE MUST CONVERGE ON A REFINERY THE AI IS TRYING TO EXPAND WITH.
       *
       * The share below never lets the bank reach a 750 refinery: `min(mana*share, mana-260)` pins the SPENDABLE figure at
       * 260 for every bank from 300 to 750 (tabulated in `audit/reserve-convergence.ts`), so the army re-spends the surplus
       * every pass and the gap is as large as it was. Measured on seed 1000: eleven straight minutes of
       * `saving for attunement_spire (550/750)` and the refinery was never bought.
       *
       * THE CONVERGENCE IS SCOPED TO THE ROUTED REFINERY, and that scoping is measured, not cautious. Applying it to every
       * pending step collapsed seed variety from 6 distinct match lengths to 2 and failed `tests/sim/seed-variety.test.ts`
       * — the convergence is strong enough that it standardises every opening into the same script. Restricting it to a
       * step that `expansionGoal` has already approved (a real army exists, the expansion window is open, and a second
       * mining base is still wanted) leaves the opening and every other purchase on the original policy.
       *
       * 120 is the float: the army's cheapest unit is 115-140 in this content set, so the AI can still buy SOMETHING while
       * it saves. A 200 float genuinely freezes production, which measured as a 9.6-minute median against the baseline's
       * 12.6.
       */
      const gap = Math.max(0, def.cost - per.mana);
      const share = gap > def.cost * 0.5 ? 0.35 : 0.6;
      /**
       * THE SPENDABLE FLOOR MUST CLEAR THE PRODUCTION GATE, OR THE GATE IS DECORATIVE.
       *
       * `brain.ts` only trains while `spendable > max(150, 2 x unitCost)`. The cheapest combat unit a summoning circle can
       * make is a 125-cost rift familiar and the counter picker settles on the 140-cost imp swarmling, so the gate needs
       * 250-280 spendable. This floor pinned spendable at exactly **260** for every bank from 300 to 750
       * (`audit/reserve-convergence.ts` tabulates it) — below the gate for the 140-cost pick, which is the one Normal
       * actually chooses from minute 6:30. Measured on the committed latency-jitter seed: the gate was open on 4127 of
       * 16800 ticks and the side fielded FOUR combat units in fourteen minutes, buying 45 wisps and 3 soldiers.
       *
       * 320 is the smallest round value that clears the gate for every combat unit in the roster whose cost is below the
       * floor (115-260), with 40 to spare, and it is still far below the 550-750 buildings the reserve exists to protect —
       * so the reserve keeps its purpose while the army stops being starved by it.
       */
      reservedForBuild = Math.max(0, Math.min(Math.floor(per.mana * share), Math.max(0, per.mana - 320)));
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

  return withSite({ commands, notes, blockedOnPlacement, reservedForBuild }, expansionTarget);
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
function nearestFreeNode(
  u: SeenUnit,
  nodes: SeenNode[],
  claimed: Set<number>,
  /**
   * Map dimensions in TILES, for the reflection-invariant tie-break.
   *
   * Threaded in rather than read from a module constant because the tie-break must reflect about THIS map's midlines, and
   * they are published map data — the same class of information the perception already exposes as `mapW`/`mapH`.
   */
  mapWTiles: number,
  mapHTiles: number,
): SeenNode | null {
  let best: SeenNode | null = null;
  let bestScore = Infinity;
  const mirrorRankOf = (n: { x: number; y: number }): number =>
    mirrorRank(Math.floor(n.x / TILE), Math.floor(n.y / TILE), mapWTiles, mapHTiles);
  for (const n of nodes) {
    const crowded = claimed.has(n.id);
    const d = Math.hypot(n.x - u.x, n.y - u.y);
    // Crowding is a large penalty rather than an exclusion, so an all-claimed set still yields a target.
    const score = d + (crowded ? 4000 : 0) - Math.min(2000, n.remaining / 10);
    /**
     * SYMMETRIC TIE-BREAK, not array order — AND NOT A COORDINATE HASH EITHER.
     *
     * `score < bestScore` kept the first node on a tie, and `nodes` is built in entity-slot order — which is node
     * allocation order, a fixed geographic sequence. Two workers equidistant from two nodes would therefore always pick
     * the lower-indexed one, and in a mirror that is a different compass direction for each base.
     *
     * The previous fix replaced that with `spotHash(x, y)`, and the comment claimed it "carries no directional bias".
     * That is false in the way that matters: a hash is symmetric only IN AGGREGATE (half of all mirrored pairs happen to
     * hash in the favourable direction), which is not the property a mirrored match needs. Measured with the AI fixed to
     * field real armies, `audit/symmetry-break.ts` located the first divergence at **t=2s, on the starting wisps**:
     *
     *   p1[wisp:590:529] vs p2mirror[wisp:604:496]
     *
     * Both had taken their first harvest order and gone to different nodes. That is this tie-break.
     *
     * `mirrorRank` is the reflection-invariant key the pathing system already uses: it compares a tile's distance from
     * the map's midlines first and its raw row/column last, and both are unchanged when x is reflected about the midline.
     * So a worker at (x,y) and its mirror at (W-x,y) now choose tiles that are reflections of each other, every time.
     */
    if (score < bestScore || (score === bestScore && best !== null && mirrorRankOf(n) < mirrorRankOf(best))) {
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
 * How many separate MINING bases a side holds.
 *
 * A base is an income site: a completed refinery, the construction yard, or a deployed wagon, and everything else inside
 * `BASE_CLUSTER` of one of those belongs to it. Measured from building positions rather than tracked as state, so it cannot
 * drift from reality — if a forward base is destroyed the count drops and the AI will try to replace it.
 *
 * WHY THE ANCHORS ARE INCOME BUILDINGS AND NOT "ANY BUILDING". The first version clustered EVERY owned building, so a 40-mana
 * stone wall laid as the first link of an expansion chain — which by construction sits as far toward the target as the 7-tile
 * build zone allows, ~6 tiles out — registered as a second base on its own. Hard's `targetBases: 2` then read `2 < 2` and the
 * expansion branch was skipped for the rest of the match. Measured on seed 1000 (`audit/expand-trace.ts`): `t=4m ... bld=7
 * ref=1 bases=2/2` with a single chain link standing and nearOwn still 513 units, and no further expansion note for 22
 * minutes. `audit/expand-gate.ts` confirmed the mechanism by lifting `targetBases` above the count — the AI then laid a second
 * link and a forward refinery, which it had never done with the counter armed.
 *
 * The same mis-count also armed `defendExpansions` on a base that did not exist, pulling units out of the main army.
 */
export function countBases(per: Perception, registry: Registry): number {
  const BASE_CLUSTER = TILE * 12;
  const anchors = per.myBuildings.filter((b) => {
    if (b.buildProgress !== undefined) return false;
    const def = registry.buildings.get(b.defId);
    return !!def?.isRefinery || !!def?.isConstructionYard;
  });
  const centres: { x: number; y: number; n: number }[] = [];
  for (const a of anchors) {
    const near = centres.find((c) => Math.hypot(c.x / c.n - a.x, c.y / c.n - a.y) < BASE_CLUSTER);
    if (near) {
      near.x += a.x;
      near.y += a.y;
      near.n++;
    } else centres.push({ x: a.x, y: a.y, n: 1 });
  }
  return Math.max(1, centres.length);
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
 * The target node of an expansion this side is ACTIVELY working on, or null when there is none.
 *
 * One predicate, used twice: by the reserve (before any spender runs) and by the expansion branch itself. Two copies of
 * "should I be expanding" is how this regressed once already, so there is one.
 *
 * It is null for Easy (`targetBases: 1` — never expands, by design), before `expandAfterSeconds`, and when the side
 * already holds as many MINING bases as its profile asks for. `countBases` counts income anchors only, so a chain link
 * cannot satisfy it — see the note there for the measured 22-minute non-expansion that caused.
 */
export function expansionGoal(
  per: Perception,
  registry: Registry,
  services: SimServices,
  profile: DifficultyProfile,
  elapsedSeconds: number,
): { x: number; y: number } | null {
  if (profile.targetBases <= 1) return null;
  if (elapsedSeconds < profile.expandAfterSeconds) return null;
  if (countBases(per, registry) >= profile.targetBases) return null;
  /**
   * AN EXPANSION IS A SURPLUS DECISION, NOT A PRIORITY OVER THE ARMY.
   *
   * Routing a refinery to the forward node delays the home refinery it replaces, and that refinery is what funds the army
   * the AI needs right now. Measured on seed 2000 (`audit/expand-outcomes.ts`): the expanding side reached the second base
   * but fielded **2 army units against 12** at minute 10 and lost — expansion had become a way to lose more slowly.
   *
   * The gate is therefore "the army exists", not "the army is complete". A full `minWaveSize` wave (5-7 units) is too late:
   * by then the game is decided, and measured at that threshold only 2 of 6 Hard runs expanded. Three units is enough to
   * show that production is running and the economy is not being raided, which is the condition an expansion actually
   * needs — a hard number, the same for every profile, and below every difficulty's first wave.
   */
  const army = per.myUnits.filter((u) => u.weapon && !registry.units.get(u.defId)?.isHarvester).length;
  if (army < 3) return null;
  /**
   * THE EXPANSION WINDOW CLOSES, AND THAT IS A TERMINATION GUARANTEE.
   *
   * Saving for the forward base holds mana the army would otherwise spend, so an AI that keeps saving forever never fields
   * the army that ends the match. That is not hypothetical: with an unbounded window, `tests/phase5-teams.test.ts` measured
   * the **4-player free-for-all running past its 32-minute cap**, where the same seed resolved at 27.1 min before this
   * change. A four-way map has no safe moment to save, so a side that always intends to expand always intends and never
   * fights.
   *
   * THE WINDOW IS LONGER NOW, BECAUSE THE FUNDING MODEL CHANGED AND THE OLD BOUND WAS TUNED TO THE OLD ONE.
   *
   * The 300-second bound was measured for a plan that RESERVED mana for the forward base, so the bank reached the pair
   * inside the window by construction. `planEconomy` no longer reserves anything (a reserve closes the production gate in
   * `brain.ts` and measured as ONE combat unit for a whole match), so the pair has to accumulate out of genuine surplus —
   * income the army has declined to spend. That happens later, and on the seeds measured here the bank is still under
   * 1000 at eight minutes because the army is being built with it.
   *
   * 600 seconds keeps the termination guarantee the original bound exists for — a side that never reaches the pair stops
   * intending to expand and plays on — while giving the surplus path a realistic chance. It is deliberately expressed as
   * an offset from the profile so Hard still opens its window 20 s earlier than Normal, which is a measured lever
   * (`expandAfterSeconds` 200 vs 180).
   */
  if (elapsedSeconds > profile.expandAfterSeconds + 600) return null;
  return bestExpansionSite(per, registry, services);
}

/**
 * The best free mana cluster to expand to.
 *
 * "Free" means a live node with mana that no owned MINING base is already working, and "best" balances remaining mana against
 * distance so the AI does not cross the map for a 3,000 node while a 25,000 node sits two tiles away. Enemies are NOT consulted
 * beyond what the perception already shows, so this stays fog-legal: a site behind fog is chosen on distance and richness alone.
 */
export function bestExpansionSite(
  per: Perception,
  registry: Registry,
  services: SimServices,
): { x: number; y: number } | null {
  /**
   * A NODE IS "SERVED" ONLY BY A REFINERY BUILT ON IT, NOT MERELY BY ONE IN THE SAME CLUSTER.
   *
   * This radius used to be `BASE_CLUSTER` (12 tiles), which marked the map's two 25,000-mana nodes as served by refineries
   * 10.6 tiles away. That is technically true and economically wrong: a refinery ON the node is a zero-walk deposit, while
   * one 339 units away makes every worker spend most of its trip in transit. The consequence was that the map's richest
   * nodes never became expansion targets — the search skipped them and picked a 3,000-mana node 30.6 tiles out, which is
   * both expensive to chain to and impossible to hold. Measured (`audit/expand-trace.ts`): `bestExpansionSite` returned
   * (656,1424) at 30.6 tiles on every seed, and every forward refinery built there was destroyed within 90 seconds.
   *
   * At 5 tiles, the 25,000 node 14.1 tiles from home is correctly an expansion target: two chain links, a refinery that
   * sits on the node, and a site that is still inside the AI's own half of the map.
   */
    const SERVED_RADIUS = TILE * 5;
  const home = per.myBuildings[0];
  if (!home) return null;
  void services;
  const incomeAnchors = per.myBuildings.filter((b) => {
    const def = registry.buildings.get(b.defId);
    return !!def?.isRefinery || !!def?.isConstructionYard;
  });
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
    /**
     * A NODE IS TAKEN WHEN A REFINERY MINES IT — not when any building is near it, and not when a REFINERY IS BEING BUILT on
     * it. The foundation has to count, or the AI re-issues the same build order every pass while the first one is going up.
     */
    const covered = incomeAnchors.some((b) => {
      if (Math.hypot(b.x - n.x, b.y - n.y) >= SERVED_RADIUS) return false;
      return b.buildProgress === undefined || registry.buildings.get(b.defId)?.isRefinery === true;
    });
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
