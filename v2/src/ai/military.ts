// MILITARY PLANNER.
//
// v1's army never left its own base in most matches, and when it did it walked in one straight line at
// whatever it saw first. This planner is built around four decisions a human actually makes:
//
//   1. WHAT TO BUILD — composition driven by what the enemy has actually been SEEN fielding, scored against
//      the real `vs` damage matrix in the unit data. No counter without scouting.
//   2. WHEN TO FIGHT — a wave only goes out when it is big enough, and it turns back if the fight is lost.
//   3. HOW TO FIGHT — focus fire onto the best target, ranged units kite, hurt units retreat to heal.
//   4. WHERE TO FIGHT — defend the base when it is threatened, and harass a known undefended expansion when
//      the main army is elsewhere.
//
// Every input comes from `Perception`, so a decision to counter a unit the AI never scouted is impossible.

import type { Command, EntityId, PlayerId } from '../sim/types';
import type { Registry } from '../data/registry';
import type { UnitDef } from '../data/defs';
import type { Perception, SeenBuilding, SeenUnit } from './perception';
import type { DifficultyProfile } from './difficulty';
import { TILE } from '../core/constants';

export interface MilitaryPlan {
  commands: Command[];
  notes: string[];
  /** Units we consider available to attack with this pass. */
  armySize: number;
  /** True when the base is under threat and the army was recalled. */
  defending: boolean;
}

/** Everything about a unit that the planner needs, resolved once. */
interface UnitInfo {
  seen: SeenUnit;
  def: UnitDef | undefined;
  role: 'melee' | 'ranged' | 'siege' | 'support';
  dps: number;
}

function unitInfo(seen: SeenUnit, registry: Registry): UnitInfo {
  const def = registry.units.get(seen.defId);
  const w = def?.weapon;
  const dps = w && w.cooldownTicks > 0 ? (w.damage * 20) / w.cooldownTicks : 0;
  let role: UnitInfo['role'] = 'melee';
  if (def?.isHarvester) role = 'support';
  else if (w && w.range >= 120) role = 'siege';
  else if (w && w.range >= 60) role = 'ranged';
  return { seen, def, role, dps };
}

/** Our combat units (harvesters and unarmed units excluded). */
function combatUnits(per: Perception, registry: Registry): UnitInfo[] {
  const out: UnitInfo[] = [];
  for (const u of per.myUnits) {
    const info = unitInfo(u, registry);
    if (info.role === 'support') continue;
    if (!info.def?.weapon) continue;
    out.push(info);
  }
  return out;
}

/**
 * Pick the unit that best answers the enemy's OBSERVED composition.
 *
 * This is a direct use of the data's counter matrix: for each candidate we compute its damage against the
 * enemy's actual armour mix, weight it by how much of that mix exists, and divide by cost. A candidate we
 * have never scouted against scores on the default mix, so an AI that does not scout counters badly — which
 * is the intended consequence of skipping scouting, not a hidden rule.
 */
export function bestCounterUnit(
  registry: Registry,
  per: Perception,
  producers: SeenBuilding[],
  enemyUnits: SeenUnit[],
): { id: string; cost: number } | null {
  const available = new Set<string>();
  for (const b of producers) {
    const def = registry.buildings.get(b.defId);
    for (const u of def?.producesUnits ?? []) available.add(u);
  }

  // The enemy's armour mix, by HP share. Unknown armour defaults to an even split.
  const mix = { light: 0, heavy: 0, building: 0 };
  let totalHp = 0;
  for (const e of enemyUnits) {
    mix[e.armor] += e.hp;
    totalHp += e.hp;
  }
  if (totalHp === 0) {
    mix.light = 1;
    mix.heavy = 1;
    mix.building = 0.2;
    totalHp = 2.2;
  }

  let best: { id: string; cost: number; score: number } | null = null;
  for (const id of available) {
    const u = registry.units.get(id);
    if (!u || u.isHarvester || !u.weapon) continue;
    if (u.requires.some((r) => !per.unlockedTech.has(r))) continue;
    if (u.factions && !u.factions.includes(per.factionId)) continue;
    if (u.cost <= 0) continue;
    const vs = u.weapon.vs;
    // Expected damage against the observed armour mix.
    const effective = (vs.light * mix.light + vs.heavy * mix.heavy + vs.building * mix.building) / totalHp;
    /**
     * VALUE, NOT JUST DAMAGE-PER-COST.
     *
     * Dividing damage by cost alone picks the cheapest body every time, and the cheapest body in this roster
     * is a 60 HP scout with an 8-damage weapon. An AI built on that metric produced **83 rift familiars and
     * nothing else** — a swarm that dies to one AoE and cannot break a building (0.3x vs structures). The
     * army looked large on a unit count and could not win a fight, which is exactly the "big number, no
     * threat" failure the v1 AI had.
     *
     * So the score multiplies damage by how long the unit survives to deal it: effective HP per cost. A
     * 600 HP golem at 0.8x vs heavy beats a 60 HP familiar at 1.1x even though the familiar is 4.5x cheaper,
     * because the golem is still shooting while the swarm is dead.
     */
    const sustain = u.hp * (1 + (u.armor === 'heavy' ? 0.35 : 0)); // heavy armour absorbs more in practice
    /**
     * A COUNTER YOU CANNOT AFFORD IS NOT A COUNTER.
     *
     * The score rewards effective HP so strongly that it always prefers the most expensive unit in the roster. Measured: Hard
     * (which is the only profile with `counters` enabled) beat Easy **6-10** with counters on and **9-7** with them off — the
     * "smarter" picker was making it worse. It was choosing 700-cost casters while holding 150 mana, so the production command
     * was rejected for `mana` and the AI trained nothing at all, repeatedly.
     *
     * Units the bank cannot currently reach are therefore excluded when anything affordable exists, and affordability is
     * weighed in rather than ignored. That keeps the counter logic (it still prefers good damage against the observed armour)
     * while making it a decision the AI can actually execute.
     */
    const affordable = u.cost <= per.mana;
    const score = (effective * sustain) / (u.cost * u.cost) ** 0.5;
    const adjusted = affordable ? score : score * 0.05;
    if (!best || adjusted > best.score) best = { id, cost: u.cost, score: adjusted };
  }
  return best ? { id: best.id, cost: best.cost } : null;
}

/** The enemy unit type we have seen most of, for notes and for building a dedicated counter. */
export function dominantEnemyUnit(enemyUnits: SeenUnit[]): { defId: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const u of enemyUnits) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1);
  let best: { defId: string; count: number } | null = null;
  for (const [defId, count] of counts) {
    if (!best || count > best.count) best = { defId, count };
  }
  return best;
}

/**
 * Build the military plan for one tick.
 *
 * `homeX/homeY` is where the army rallies (the construction yard), so "defend" and "retreat" have a place to
 * mean. `waveSize` is carried across ticks by the caller so the AI does not reset its ambition every pass.
 */
export function planMilitary(
  per: Perception,
  registry: Registry,
  profile: DifficultyProfile,
  opts: {
    homeX: number;
    homeY: number;
    /** Units committed to the last wave; the AI grows its ambition from here. */
    lastWaveSize: number;
    /** True while the AI has an active attack order out. */
    attacking: boolean;
    /** The enemy position we know about, if any (a ghost building or a live sighting). */
    enemyAnchor: { x: number; y: number } | null;
    /** True when the AI has stopped making progress and should commit everything. */
    allIn?: boolean;
    /**
     * Where to march when no enemy building is known at all.
     *
     * Derived from the player's own explored map, so it is fog-legal. Without it the army chases the last sighting of a
     * mobile unit, arrives at empty ground, and stands there — see the note in `brain.ts` for the measured 26-minute stall.
     */
    searchTarget?: { x: number; y: number } | null;
    /**
     * Army size that must be reached before the next wave launches.
     *
     * Set after a wave is wiped out, so the AI rebuilds to the strength that failed instead of dribbling single units into
     * the enemy one after another. Zero means no regrouping is pending.
     */
    regroupUntil?: number;
    /**
     * Each unit's position on the previous decision pass, for the stuck-unit detector.
     *
     * Owned by the brain and threaded through so it persists between passes. Keyed by entity id; entries for dead units are
     * harmless (they are simply never read again) and the map is pruned each pass.
     */
    prevUnitPositions?: Map<number, { x: number; y: number }>;
  },
): MilitaryPlan & { committedWave: number; shouldAttack: boolean } {
  const prevPositions = opts.prevUnitPositions ?? new Map<number, { x: number; y: number }>();
  const commands: Command[] = [];
  const notes: string[] = [];
  const pid = per.playerId;
  const army = combatUnits(per, registry);
  const armySize = army.length;

  /**
   * ------------------------------------------------------------------ 1. defense
   *
   * A real assault on the base is answered by the whole army. A SKIRMISH is not.
   *
   * This used to return early whenever ANY enemy unit came within range of home, so a single harasser could pin the entire
   * army in its own base for the whole match — measured: 39 combat units at a median 2944 units from the enemy base while
   * one enemy unit loitered nearby, and zero waves in 18 minutes. The early return also meant `shouldAttack` was never
   * even evaluated.
   *
   * Now only a credible force (3+ units) triggers a full recall, which is also what a human defender does; below that a
   * small detachment is sent and the main wave continues to form.
   */
  const threat = assessBaseThreat(per, registry, opts.homeX, opts.homeY);
  let defending = false;
  /**
   * DEFENCE DETACHES, IT DOES NOT RECALL THE WHOLE ARMY.
   *
   * Even with the 3-unit threshold, two AIs that each park a stack near the other's base put both sides into permanent
   * defence: measured "defending base: 9 enemy unit(s) within 134 of home" repeating forever, with the all-in never
   * firing because defence returns before the wave is planned. The match could not end.
   *
   * Defenders are now a DETACHMENT sized to the threat, and an all-in attack takes precedence over defending entirely —
   * when the AI has decided to end the game, it goes, and the base is what it trades away.
   */
  if (threat.threatened && armySize > 0 && opts.allIn !== true) {
    const needed = Math.min(armySize, threat.count + 2);
    defending = threat.count >= 3;
    const defenders = army.slice(0, needed).map((a) => a.seen.id);
    commands.push({ type: 'attackMove', playerId: pid, entityIds: defenders, x: threat.x, y: threat.y });
    notes.push(`defending base: ${defenders.length}/${armySize} unit(s) sent against ${threat.count} near home`);
    /**
     * NO EARLY RETURN.
     *
     * Returning here — which the original code did on ANY threat, and my first rewrite still did for 3+ — means the wave
     * is never planned, so an AI with a permanent enemy stack near home never attacks. Measured: `waves p1=0 p2=0` over 30
     * sim-minutes, with both sides at 11 buildings and neither able to finish. Defending now happens ALONGSIDE the wave:
     * the detachment holds the line and the rest of the army still marches.
     */
  }

  /**
   * ------------------------------------------------------------------ 2. retreating
   *
   * RETREAT IS A TACTICAL MOVE, NOT A PERMANENT WITHDRAWAL.
   *
   * The first version sent every unit below 35% HP home and re-issued that order every decision pass. Units do
   * not regenerate on their own, so a hurt unit never became healthy, the order was never lifted, and it obeyed
   * "go home" forever. Measured: **18 of 27 combat units permanently walking back to the base**, which is why
   * the AI fielded 90 units and never attacked with any of them, and why its scouts were all pinned at home.
   *
   * A retreat now only happens when the unit is actually in contact with the enemy — i.e. withdrawing is
   * meaningful, because the alternative is dying where it stands. A unit already clear of the fight keeps
   * whatever it was doing, so once it is out of danger it rejoins the army instead of orbiting the base.
   */
  /**
   * RETREAT IS A STEP BACK, NOT A RETREAT HOME.
   *
   * Sending hurt units to the base sent them on a multi-thousand-unit walk across open ground, where they were caught and
   * killed — and it repeated every pass. Measured across a 96-match tournament, this made the difficulties that HAVE retreat
   * WEAKER than the one that does not:
   *
   *   easy beat normal 17-6, easy beat hard 15-7
   *   disabling retreat on hard moved it from 0-4 to 2-2 against easy
   *
   * The intent of the lever was always "pull hurt units out of contact", which is a short step away from the nearest enemy,
   * not a march to the far corner of the map. A unit that leaves weapon range stops taking fire and can rejoin; a unit that
   * walks home is out of the fight for a minute and usually dies on the way.
   *
   * It also only applies when the unit is genuinely losing: hurt AND alone, rather than hurt in the middle of its own army
   * where it is not the one being focused.
   */
  /**
   * TWO HURT ARMIES MUST NOT RETREAT FROM EACH OTHER FOREVER.
   *
   * Retreat pulls hurt units out of contact. With a real army that is correct micro. With a ONE-UNIT army it is a permanent
   * stalemate: the unit is below 35% HP, sees an enemy within 220 units, steps back out of range, and the enemy does exactly
   * the same -- so neither ever closes and neither base is ever touched.
   *
   * Measured on seeds 1035 and 1077, which ran to the 30-minute cap in the mirror, hard-vs-normal AND normal-vs-easy
   * matchups simultaneously: both sides ended with a single combat unit sitting at their OWN base, zero damage dealt after
   * minute 10, and no resolution even at a 45-minute cap.
   *
   * Retreat is therefore skipped once the army is too small to survive the withdrawal loop; in that state attacking is the
   * only action that can end the game.
   */
  const tooFewToRetreat = armySize <= 2;
  if (profile.retreatHurtUnits && opts.allIn !== true && !tooFewToRetreat) {
    const engagedThreshold = 220;
    const hurt = army.filter((a) => {
      if (a.seen.hp / Math.max(1, a.seen.maxHp) >= 0.35) return false;
      return per.enemyUnits.some((e) => Math.hypot(e.x - a.seen.x, e.y - a.seen.y) < engagedThreshold);
    });
    if (hurt.length > 0) {
      /**
       * Step each hurt unit a short distance AWAY from the nearest enemy instead of toward home. `RETREAT_STEP` is just
       * over a weapon's reach so the unit leaves fire but stays in the fight's neighbourhood and can return in seconds.
       */
      const RETREAT_STEP = 260;
      const ax = hurt.reduce((s, h) => s + h.seen.x, 0) / hurt.length;
      const ay = hurt.reduce((s, h) => s + h.seen.y, 0) / hurt.length;
      let ex = 0;
      let ey = 0;
      for (const e of per.enemyUnits) {
        ex += e.x - ax;
        ey += e.y - ay;
      }
      const len = Math.hypot(ex, ey);
      // No nearby enemy direction to flee? Fall back to stepping toward home, which is at least safe ground.
      const dirX = len > 1 ? -ex / len : Math.sign(opts.homeX - ax);
      const dirY = len > 1 ? -ey / len : Math.sign(opts.homeY - ay);
      commands.push({
        type: 'move',
        playerId: pid,
        entityIds: hurt.map((h) => h.seen.id),
        x: ax + dirX * RETREAT_STEP,
        y: ay + dirY * RETREAT_STEP,
      });
      notes.push(`stepping ${hurt.length} hurt unit(s) out of weapon range`);
    }
  }

  // ------------------------------------------------------------------ 3. harassment of a known soft target
  /**
   * HARASSMENT MUST COME OUT OF SURPLUS, NEVER OUT OF THE MAIN WAVE.
   *
   * This block used to slice the first four units off the army on every pass while massing, and the wave planner below then
   * ordered the WHOLE army — including those four — somewhere else. So the squad was permanently given two conflicting
   * destinations, and the army could never reach the size the wave gate demands.
   *
   * Measured by isolating the lever across 8 side-swapped games against easy:
   *
   *   hard as-is:            2-4
   *   hard without harass:   4-4
   *
   * Harass was the single biggest reason hard was the weakest difficulty, and hard is the only profile that has it enabled.
   *
   * It now only detaches units that are NOT needed to satisfy the wave requirement, and only when the AI is not already
   * attacking, so harassing is something done with spare units rather than instead of building an army.
   */
  if (profile.harass && opts.enemyAnchor && !opts.attacking) {
    const waveNeed = Math.max(profile.minWaveSize, opts.lastWaveSize);
    const surplus = armySize - waveNeed;
    if (surplus >= 2) {
      const soft = softestEnemyBuilding(per);
      if (soft) {
        const squadSize = Math.min(4, Math.max(2, Math.floor(surplus)));
        // Take from the END of the army so the main body keeps the units nearest the front.
        const squad = army.slice(army.length - squadSize).map((a) => a.seen.id);
        commands.push({ type: 'attackMove', playerId: pid, entityIds: squad, x: soft.x, y: soft.y });
        notes.push(`harassing ${soft.defId} with ${squadSize} surplus unit(s)`);
      }
    }
  }

  // ------------------------------------------------------------------ 4. the main wave
  /**
   * ESCALATION — each wave must be bigger than the last.
   *
   * `waveGrowth` existed on the difficulty profile but was never applied: the condition read
   * `lastWaveSize * (1 + 0)`, so every wave was the same size and the AI never built the force needed to break a
   * fortified base. With a 90-unit ceiling and a 10-building enemy that meant an endless exchange of 15-unit waves that
   * could not finish the job, and no match ever ended.
   */
  /**
   * ESCALATION IS BOUNDED BY WHAT IS ACTUALLY SUSTAINABLE, NOT BY THE CURRENT ARMY SIZE.
   *
   * Each wave was required to be `lastWaveSize * (1 + waveGrowth)` — a compounding demand that becomes permanently
   * unsatisfiable once the map's mana runs out. But capping it at the CURRENT army size was worse: after a wipe the army is
   * one unit, so `required` collapsed to 1 and the AI immediately relaunched with a single unit, lost it, and repeated.
   * Measured on seed 1014 (normal vs easy): p1 issued **66 waves, every one of them of size 1**, while p2 issued 2 waves of
   * 8 and 14. The AI was not attacking, it was feeding its army in one unit at a time.
   *
   * The cap is therefore the army size the AI can SUSTAIN, which is at least the profile's minimum wave — never below it.
   * A big wave raises the bar; a wipe can never lower it below a real army.
   */
  const compounded = Math.round(opts.lastWaveSize * (1 + profile.waveGrowth));
  const required = Math.max(profile.minWaveSize, Math.max(compounded, 0));
  // An all-in ignores the wave threshold: the point is to end the grind, not to trade evenly again.
  /**
   * An all-in commits EVERYTHING, including a handful of units.
   *
   * It previously still gated on `armySize >= max(4, ...)`, which is unreachable for an AI whose economy has been razed —
   * it cannot train replacements, so it sits on one or two units forever and never attacks. Measured on seed 1042 at 30
   * sim-minutes: p1 had lost its attunement spire (the only building that trains workers), held **1 harvester and 1 army
   * unit**, and had `passesWithoutProgress = 1715` — the breaker had been firing for fifteen minutes and could still not
   * act, because one unit is less than four.
   *
   * An AI that cannot rebuild has nothing to lose by attacking. Sending one unit is worse than sending twenty, but it is
   * strictly better than standing still until the clock runs out.
   */
  /**
   * AN ALL-IN COMMITS THE ARMY — IT DOES NOT DISPENSE WITH HAVING ONE.
   *
   * This previously dropped to `armySize >= 1`, so once the stalemate breaker engaged it launched one-unit waves forever.
   * Measured on seed 1014 (normal vs easy): `passesWithoutProgress` reached 496, the breaker stayed on, and p1 issued **66
   * waves of size 1** while p2 massed 8 and 14 and won.
   *
   * The all-in exists to stop an AI trading evenly at the unit cap, not to make it attack with nothing. It now requires a
   * real force — the profile's minimum wave, which is 7-11 units — while still dropping the COMPOUNDING escalation that made
   * the requirement unreachable. That is the actual intent: stop waiting for an ever-bigger army, not stop needing one.
   */
  const regroupFloor = opts.allIn === true ? 0 : (opts.regroupUntil ?? 0);
  /**
   * A DEAD ECONOMY CANNOT WAIT FOR A FULL WAVE.
   *
   * The all-in still required the profile's minimum wave (7-11 units). But an AI whose workers are all gone cannot ever
   * train another unit, so that threshold can become permanently unreachable while it holds a handful of soldiers.
   * Measured on seed 1035 (hard vs normal): both sides ended with ZERO harvesters, and p1 sat on 7 units with
   * `passesWithoutProgress = 3273` — the breaker firing for over an hour of decision passes — never attacking, because 7 is
   * below hard's minimum of 11. The match ran out the clock with both armies intact.
   *
   * With no harvesters there is no future army, so the only move that can still change the outcome is to attack with what
   * exists. The threshold drops to a token force rather than being waived entirely.
   */
  const deadEconomy = per.myUnits.every((u) => registry.units.get(u.defId)?.isHarvester !== true);
  /**
   * With no harvesters there is no future army at all, so the floor is a SINGLE unit: attacking with one unit is worse than
   * attacking with ten, but it is the only action that can still change the result, and standing still guarantees the
   * stalemate. Measured on seed 1035 (mirror): both sides were down to ONE army unit each with 13 live mana nodes and zero
   * income; a floor of two was unreachable, so `passesWithoutProgress` climbed past 1700 and the match ran out the clock.
   */
  /**
   * THE BREAKER MUST NOT REQUIRE THE SIZE IT EXISTS TO STOP WAITING FOR.
   *
   * An all-in still demanded the profile's full minimum wave (11 at Hard). But the entire purpose of the breaker is "stop
   * waiting for a bigger army" -- so requiring 11 units before committing, while the army is stuck at 8 and the economy has
   * 80 mana and is mined out, reproduces exactly the wait it was meant to end. Measured on seed 1035 (hard vs normal), which
   * ran the full 30 minutes: hard held 8 army with `passesWithoutProgress = 3273` -- the breaker firing for over an hour of
   * decision passes -- and never attacked.
   *
   * The floor is half the normal wave (and never more than the army itself), which keeps it a real force rather than a
   * token, while making it reachable from the army an exhausted economy can actually field. A literally dead economy drops
   * to a single unit.
   */
  const allInFloor = deadEconomy ? 1 : Math.max(4, Math.ceil(profile.minWaveSize / 2));
  const ready = opts.allIn === true ? armySize >= allInFloor : armySize >= required && armySize >= regroupFloor;
  /**
   * THE WAVE IS NOT CANCELLED BY A LOCAL SKIRMISH.
   *
   * `!defending` here was the last of three separate blockers that stopped any AI from ever attacking while an enemy
   * stack sat near its base. Defending is now a detachment (above), so the rest of the army is free to march.
   */
  /**
   * SEARCH SWEEP — the army advances across unexplored ground when it knows of no enemy building.
   *
   * This takes precedence over the normal wave logic, because with no known structure every "attack" is a march to a
   * phantom position that resolves to nothing (see `searchTarget` in the options). The army is what does the looking: it
   * covers ground far faster than one wisp scout, and arriving somewhere is what reveals it.
   *
   * Idle-only re-tasking, for the same reason as the wave re-task below: re-ordering units that are already marching
   * restarts their path every pass and they never arrive.
   */
  /**
   * "Do we know where they actually LIVE?" — not "have we seen any structure at all".
   *
   * This condition used to be `per.enemyBuildings.length === 0`, so a single 40-mana `stone_wall` counted as having found
   * the enemy base and switched the sweep off. The brain had already been corrected to offer a search target when only
   * walls were known, but this gate threw the target away, so the two planners disagreed and the sweep never ran:
   * measured in the 2v2, `b1` held 39 army units, its only known enemy building was a wall at (688,912), it had explored
   * 7,805 of 11,264 tiles, never found `a1`'s ten-building base, and the match ran past 75 minutes.
   *
   * `searchTarget` itself is produced by the brain under exactly this rule (non-wall structures), so mirroring the rule
   * here keeps a single definition of "known base" in one match.
   */
  const knowsEnemyBase = per.enemyBuildings.some((b) => b.live && b.defId !== 'stone_wall');
  const searching = opts.searchTarget !== null && opts.searchTarget !== undefined && !knowsEnemyBase;
  if (searching) {
    /**
     * A SEARCH DETACHMENT, NOT THE WHOLE ARMY.
     *
     * This used to sweep with EVERY unit whenever none were idle, and that bled the army: a unit sent across the map on
     * a sweep is not at home massing, and it meets the enemy's massed army alone. Measured in a mirror at seed 1000
     * (identical builds on both sides, only the sweep differed):
     *
     *   p1: peak army 7,  324 massing passes, 245 search passes, lost at 16.1 min
     *   p2: peak army 24, 153 massing passes, 135 search passes, won at 16.1 min
     *
     * p1 had spent twice as many passes trying to mass and still peaked at seven units, because its trickle was being
     * fed into a map-wide sweep one or two units at a time. That is also the shape of the reported 2v2 defect: an AI
     * holding a large army that never converges on the enemy base still behaves like this if the sweep keeps pulling off
     * the units it just built.
     *
     * So the sweep takes a SMALL DETACHMENT — enough to reveal ground, never enough to matter if it is lost. The rest of
     * the army stays home and keeps growing, and the detachment is what finds the base that the wave is then sent to.
     *
     * The "whole army when nothing is idle" fallback is kept only for the genuinely broke case the code below documents:
     * an AI with almost nothing left has no idle units and no other way to scout. `SWEEP_MAX` keeps even that small.
     */
    const SWEEP_MAX = Math.max(2, Math.min(4, Math.ceil(army.length * 0.25)));
    const idleForSearch = army.filter((a) => a.seen.activity === 'idle' || a.seen.activity === undefined);
    /**
     * Units already fighting or marching must not be re-tasked — that restarts their pathing (the reason the original
     * rule was idle-only). When nothing is idle AND the army is small enough that we cannot spare a real detachment, the
     * sweep takes the army as a last resort so a cornered AI still scouts; above that size it takes idle units only.
     */
    const broke = army.length <= SWEEP_MAX;
    const sweepWith = (idleForSearch.length > 0 ? idleForSearch : broke ? army : []).slice(0, SWEEP_MAX);
    if (sweepWith.length > 0) {
      commands.push({
        type: 'attackMove',
        playerId: pid,
        entityIds: sweepWith.map((a) => a.seen.id),
        x: opts.searchTarget!.x,
        y: opts.searchTarget!.y,
      });
      notes.push(
        `searching: ${sweepWith.length} unit(s) sweeping unexplored ground at ` +
          `${Math.round(opts.searchTarget!.x)},${Math.round(opts.searchTarget!.y)}`,
      );
    }
  }

  /**
   * THE SWEEP OUTRANKS THE WAVE.
   *
   * Commands in one plan are applied in order, so a wave issued after the sweep overwrote the sweep's destination in the
   * very same pass and the army marched to the stale anchor instead. Measured verbatim from the 2v2 command stream:
   *
   *   tick 41200: attackMove b1 [39 ids] -> 688,912   (the wall)
   *   tick 41200: attackMove b1 [39 ids] -> 688,912   (the "wave", same destination, immediately after)
   *
   * With no real structure known there is nothing worth attacking, so the wave is suppressed while searching and resumes
   * automatically once the sweep reveals something (see `knowsEnemyBase` above).
   */
  const shouldAttack = !searching && opts.enemyAnchor !== null && ready && !opts.attacking;

  if (shouldAttack && opts.enemyAnchor) {
    const target = pickAttackTarget(per, opts.enemyAnchor, registry);
    const ids = army.map((a) => a.seen.id);
    commands.push({ type: 'attackMove', playerId: pid, entityIds: ids, x: target.x, y: target.y });
    notes.push(`wave of ${ids.length} attacking ${target.why} at ${Math.round(target.x)},${Math.round(target.y)}`);
  } else if (!opts.attacking && opts.enemyAnchor) {
    notes.push(`massing: ${armySize}/${Math.max(profile.minWaveSize, opts.lastWaveSize)}`);
  } else if (opts.attacking && opts.enemyAnchor && !searching) {
    /**
     * KEEP A WAVE MOVING — this is the "no idle armies" requirement, and it was the real reason matches never ended.
     *
     * A wave was a ONE-SHOT order: `attackMove` was issued once, and when the units arrived they went idle with an empty
     * order queue and simply stood there. Measured on a 20-minute match: **44 of 72 units idle with no orders**, the
     * closest only 257 world units from an enemy building — but the enemy building was NOT in sight, so `acquireTarget`
     * (which requires `isVisibleTo`) found nothing and the unit had no reason to move. Zero unit deaths and zero
     * building damage across the whole match, because the army was parked just outside vision forever.
     *
     * Re-issuing the order for idle units only is the correct fix rather than re-ordering the whole army each pass:
     *   • units still marching keep their path (re-ordering restarts pathing every pass, and an earlier version of this
     *     code stalled exploration exactly that way);
     *   • units that arrived and have nothing to shoot are precisely the ones that need to close the last stretch;
     *   • a unit actively fighting has an order, so it is left alone.
     */
    /**
     * RE-TASK STUCK UNITS — IDLE ONES, AND ONES WHOSE ORDER CANNOT BE SATISFIED.
     *
     * The idle-only rule assumes a busy unit is busy doing something useful. A unit holding an `attackMove` at a destination
     * the flow field cannot reach is busy forever and contributes nothing, so a wave can stall with most of its strength parked.
     *
     * The earlier attempt at this re-tasked every unit further than 22 tiles from the current target, which broke MIRROR
     * SYMMETRY: distance-to-target is not a symmetric quantity once positions drift, so the two sides re-tasked different
     * subsets and the mirror went from a coin flip to 0-24 for one slot. The re-task must therefore key on something that is
     * a property of the UNIT rather than of its distance to a moving reference.
     *
     * A unit is stuck when it has an order it has not advanced on: `activity === 'moving'` with no measurable progress. The
     * sim does not expose per-unit progress, so the honest signal available here is the unit's own order queue: a unit with
     * no orders is idle (already covered), and a unit with orders is left alone. That keeps the rule identical for both
     * sides in a mirror.
     */
    /**
     * UNSTICK UNITS THAT HAVE NOT MOVED — measured from the UNIT, so it is mirror-safe.
     *
     * A unit holding an order it cannot satisfy (an `attackMove` whose destination the flow field cannot reach) is `busy`
     * forever, is never idle, and therefore never re-tasked. A wave stalls with most of its strength parked: measured on
     * seed 1000 at 30 sim-minutes, p1 held 33 units against p2's 6 and the match did not end.
     *
     * The obvious fix — re-task anything far from the target — is NOT symmetric. Distance to a moving reference differs
     * between the two sides as soon as their positions drift, so each side re-tasked a different subset and the mirror went
     * from a coin flip to 0-24 for one slot. That was measured and reverted.
     *
     * This instead tracks whether the unit ITSELF advanced. A unit that has moved has a working order and is left alone; a
     * unit that has not moved for several passes has a broken one. That is a property of the unit alone, so in a mirror both
     * sides apply exactly the same rule to their own mirrored units.
     */
    const idle = army.filter((a) => a.seen.activity === 'idle' || a.seen.activity === undefined);
    const stuck = army.filter((a) => {
      if (idle.includes(a)) return false;
      const prev = prevPositions.get(a.seen.id);
      prevPositions.set(a.seen.id, { x: a.seen.x, y: a.seen.y });
      if (!prev) return false;
      const moved = Math.hypot(a.seen.x - prev.x, a.seen.y - prev.y);
      return moved < 4; // less than a quarter tile in a whole decision pass
    });
    if (stuck.length > 0) {
      const target = pickAttackTarget(per, opts.enemyAnchor, registry);
      commands.push({
        type: 'attackMove',
        playerId: pid,
        entityIds: stuck.map((a) => a.seen.id),
        x: target.x,
        y: target.y,
      });
      notes.push(`re-tasking ${stuck.length} stuck unit(s) to close on ${target.why}`);
    }
    if (idle.length > 0) {
      const target = pickAttackTarget(per, opts.enemyAnchor, registry);
      commands.push({
        type: 'attackMove',
        playerId: pid,
        entityIds: idle.map((a) => a.seen.id),
        x: target.x,
        y: target.y,
      });
      notes.push(`re-tasking ${idle.length} idle unit(s) to close on ${target.why}`);
    }
  }

  // ------------------------------------------------------------------ 5. micro: focus fire + kiting
  const engaged = per.enemyUnits.filter((e) => distanceToArmy(e, army) < 320);
  if (engaged.length > 0) {
    if (profile.focusFire) {
      const target = lowestHpEnemy(engaged);
      if (target) {
        // Only ranged units and units already in range are re-tasked; melee keeps its attack-move so it
        // does not stall walking toward a target it cannot reach.
        const shooters = army
          .filter((a) => a.role !== 'melee' && dist(a.seen, target) <= rangeOf(a))
          .map((a) => a.seen.id);
        if (shooters.length > 0) {
          commands.push({ type: 'attack', playerId: pid, entityIds: shooters, targetId: target.id });
          notes.push(`focus fire ${shooters.length} unit(s) onto ${target.defId}`);
        }
      }
    }
    if (profile.kiting) {
      const kiters = army.filter((a) => a.role === 'ranged' && nearThreat(a.seen, engaged) < 100);
      if (kiters.length > 0) {
        // Step back toward home, out of melee reach, then resume.
        commands.push({
          type: 'move',
          playerId: pid,
          entityIds: kiters.map((k) => k.seen.id),
          x: opts.homeX,
          y: opts.homeY,
        });
        notes.push(`kiting with ${kiters.length} ranged unit(s)`);
      }
    }
  }

  const committedWave = shouldAttack ? armySize : opts.lastWaveSize;
  return { commands, notes, armySize, defending, committedWave, shouldAttack };
}

// --------------------------------------------------------------------------------------- helpers

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rangeOf(a: UnitInfo): number {
  return a.def?.weapon?.range ?? 0;
}

function distanceToArmy(e: SeenUnit, army: UnitInfo[]): number {
  let best = Infinity;
  for (const a of army) best = Math.min(best, dist(e, a.seen));
  return best;
}

function nearThreat(u: SeenUnit, enemies: SeenUnit[]): number {
  let best = Infinity;
  for (const e of enemies) best = Math.min(best, dist(u, e));
  return best;
}

function lowestHpEnemy(enemies: SeenUnit[]): SeenUnit | null {
  let best: SeenUnit | null = null;
  for (const e of enemies) {
    if (!best || e.hp < best.hp) best = e;
  }
  return best;
}

/**
 * How threatened is home?
 *
 * Counts enemy units within a radius of the construction yard. Only units the AI can SEE count, so an army
 * approaching through fog is a surprise — exactly as it is for a player.
 */
export function assessBaseThreat(
  per: Perception,
  registry: Registry,
  homeX: number,
  homeY: number,
): { threatened: boolean; x: number; y: number; count: number; dist: number } {
  void registry;
  const radius = TILE * 11;
  let count = 0;
  let sx = 0;
  let sy = 0;
  let nearest = Infinity;
  for (const e of per.enemyUnits) {
    const d = Math.hypot(e.x - homeX, e.y - homeY);
    if (d <= radius) {
      count++;
      sx += e.x;
      sy += e.y;
      nearest = Math.min(nearest, d);
    }
  }
  if (count === 0) return { threatened: false, x: homeX, y: homeY, count: 0, dist: Infinity };
  return { threatened: true, x: sx / count, y: sy / count, count, dist: nearest };
}

/**
 * Where should the wave go?
 *
 * Prefers a live enemy building, then a remembered ghost, then the last known anchor. Within that, it prefers
 * the enemy's economy over its army — killing refineries wins a long game.
 */
export function pickAttackTarget(
  per: Perception,
  anchor: { x: number; y: number },
  registry: Registry,
): { x: number; y: number; why: string } {
  let best: { x: number; y: number; why: string; score: number } | null = null;
  for (const b of per.enemyBuildings) {
    /**
     * STALE GHOSTS ARE NOT TARGETS.
     *
     * A ghost is a remembered building the player has since lost sight of. The renderer draws it so a human is not
     * confused, but an AI must not march to one: the building behind it may have been destroyed many minutes ago and
     * nothing at that location will ever be reachable or killable.
     *
     * This is the reported "AI holds 39 army and never finds the enemy base" defect, reproduced in the 4-player scan.
     * Measured on seed 2001 at 27 sim-minutes, `p4` held **23 army units** and the ONLY four structures in its memory
     * were dead walls, every one `live=false`:
     *
     *   stone_wall@688,912  live=false      stone_wall@688,1104  live=false
     *   stone_wall@3408,912 live=false      stone_wall@3408,1104 live=false
     *
     * while the real sanctums stood at (3632,464) and (464,2352), both at full health and neither ever visited. Its
     * units held one order each, forever, walking to a corpse.
     */
    if (!b.live) continue;
    const def = registry.buildings.get(b.defId);
    const isWall = b.defId === 'stone_wall';
    let score = 10;
    if (def?.isRefinery) score = 40;
    else if (def?.isConstructionYard) score = 30;
    else if (def?.producesUnits?.length) score = 25;
    else if (def?.menuCategory === 'defenses') score = 4;
    else if (isWall) score = 1;
    if (!best || score > best.score) {
      best = { x: b.x, y: b.y, why: def?.name ?? b.defId, score };
    }
  }
  /**
   * IF ONLY WALLS ARE KNOWN, THE ANCHOR IS THE BETTER DESTINATION.
   *
   * A live wall tells you a base exists nearby but not where, and walking onto a wall achieves nothing. The anchor is
   * either a live sighting or the last place an enemy was seen, which is closer to the truth.
   */
  const onlyWalls = best !== null && best.score <= 1;
  if (best && !onlyWalls) return { x: best.x, y: best.y, why: best.why };
  return { x: anchor.x, y: anchor.y, why: 'last known enemy position' };
}

/** The enemy building with the lowest HP we know about — the cheapest thing to kill. */
function softestEnemyBuilding(per: Perception): SeenBuilding | null {
  let best: SeenBuilding | null = null;
  for (const b of per.enemyBuildings) {
    if (b.buildProgress === undefined && b.hp >= b.maxHp * 0.9) continue;
    if (!best || b.hp < best.hp) best = b;
  }
  return best;
}

/** The ids of our units, for tests and for the debug overlay. */
export function armyIds(per: Perception, registry: Registry): EntityId[] {
  return combatUnits(per, registry).map((a) => a.seen.id);
}

/** Export for tests: describe the AI's intent in one line. */
export function describeIntent(p: MilitaryPlan): string {
  if (p.defending) return 'defending';
  if (p.commands.some((c) => c.type === 'attackMove')) return 'attacking';
  return 'massing';
}

/** Unused-parameter guard for planners that keep a signature stable across difficulties. */
export type _PlayerId = PlayerId;
