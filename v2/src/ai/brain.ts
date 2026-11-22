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
   * Army size the AI must reach before launching the next wave, set when a wave is wiped out.
   *
   * Zero during a normal game. It exists so a failed wave cannot be immediately followed by another, smaller one — see the
   * note in the wave lifecycle for the measured 58-wave dribble this prevents.
   */
  regroupUntil: number;
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
  /** Total HP across known enemy structures on the previous pass. A DROP means our damage is landing. */
  enemyStructureHp: number;
  /**
   * Consecutive passes with no enemy structure damaged AND no structure destroyed.
   *
   * Distinct from `passesWithoutProgress`, which also counts passes with no enemy visible at all. This one only measures
   * "an assault that is achieving nothing", which is the condition that should recall a wave.
   */
  passiveProgress: number;
  /**
   * Where the search has already been sent, as coarse tile stamps.
   *
   * `nextUnexplored` ranks candidates by how likely a base is there (start locations, then node clusters, then
   * unexplored ground), which means the same high-value candidate stays top-ranked until it is actually explored. If
   * its destination turns out to be unreachable, or the army is re-tasked before arriving, the search re-picks it
   * forever and never looks anywhere else. The ledger records each destination at the moment it is chosen, and a
   * candidate within `LEDGER_RADIUS` of a stamp is skipped in favour of the next one — so the search sweeps a
   * SEQUENCE of objectives rather than oscillating around a single one.
   *
   * It only ever stores destinations the AI itself picked, so it is not a record of hidden information.
   */
  scoutLedger: { tx: number; ty: number }[];
  /**
   * The search objective the army is currently committed to, so it is not re-chosen every decision pass.
   *
   * `nextUnexplored` re-ranks candidates by likelihood, so the same top candidate is produced until it is actually
   * explored. That is correct for choosing, but it must not be a NEW order every pass: re-issuing an `attackMove` to
   * the same point restarts pathing and the army never arrives (measured earlier — that exact bug froze exploration at
   * 2029 of 11264 tiles). Keeping the objective here lets the planner emit an order only when the target changes.
   *
   * `expiresAt` retires an objective that has been held too long, which covers the case where its destination is
   * unreachable: the ledger stamp then pushes the search on to the next candidate instead of retrying forever.
   */
  scoutTarget: { x: number; y: number; expiresAt: number } | null;
  /**
   * This player's own production-pass counter, for the producer round-robin.
   *
   * Deliberately NOT the shared match tick: see the note at its use site. A per-player counter keeps the rotation local
   * so two players in the same match do not step through their producer lists in lockstep.
   */
  produceTick: number;
}


/**
 * Hard ceiling on how long a wave stays "in flight", in DECISION passes.
 *
 * This is counted in `decide()`, not in `tick()`. It used to be incremented every simulation tick while being documented
 * as passes, so `120` expired in six seconds instead of two minutes and every wave was cancelled mid-march. Measured proof
 * of the old behaviour: `waveAge` reached **15600** in a 13-minute match, which is one increment per tick at 20 Hz.
 *
 * Two minutes at Normal's 1 s cadence: long enough to cross the map, fight, and come back; short enough that a wave that
 * neither wins nor dies still hands control back so the next one can launch.
 */
const WAVE_MAX_PASSES = 120;

/**
 * Decision passes without any enemy building lost before the AI stops trading and commits everything.
 *
 * At Normal's 1 s cadence this is 90 s of no progress, which a healthy match never reaches: waves land, buildings fall,
 * and the counter resets. Reaching it means a genuine grind at the unit cap.
 */
const STALEMATE_PASSES = 90;

/**
 * Hard escalation deadline, in sim seconds.
 *
 * The stalemate counter can only fire while both sides still have something to spend — and the map does NOT: duel_glade
 * authors 127,000 mana but `manaNodeCapacity` clamps every node to 12,000 (a v1 parity constant), so the whole match
 * economy is 75,000 mana and both AI economies are mined dry at minute 15. Measured: from minute 15 to minute 30 both
 * players sat frozen at 47 entities and 95 mana, producing nothing, because there was nothing left to mine and neither
 * would commit the army it already had.
 *
 * So termination needs a bound that does not depend on income. Past this point both sides treat the match as decided and
 * commit everything they have — no wave-size gate, no retreat, no saving. It is a sim-time constant rather than a
 * wall-clock one so replays stay deterministic, and it sits above the 20-minute target so a healthy match always ends on
 * its own merits first.
 */
const DESPERATION_SECONDS = 20 * 60;

/**
 * How long one search objective is held before the search gives up on it and moves on, in sim seconds.
 *
 * A cross-map march on `duel_glade` takes roughly 60-90 seconds, so this allows several attempts at the same
 * objective (in case the army is intercepted) while still guaranteeing that an unreachable destination cannot consume
 * the rest of the match. Combined with the scout ledger — which marks each objective the moment it is chosen — this is
 * what makes the search a sequence rather than an oscillation.
 */
const SEARCH_OBJECTIVE_SECONDS = 75;

export interface BrainTickResult {
  commands: Command[];
  notes: string[];
  perception: Perception | null;
}

export class AiBrain {
  readonly profile: DifficultyProfile;
  /**
   * Seeded opening variant for this match.
   *
   * Derived from the match seed ALONE so it is reproducible (same seed, same opening) and, critically, symmetric: every
   * player in a given match draws the same variant. Hashing the player id in here (as this did originally) made mirror
   * opponents play *different* openings against each other, which is a structural first-player advantage no amount of
   * average-strength balancing can remove: `audit/variant-bias.ts` measured the variants at equal strength head-to-head
   * (4-4, 4-4, 4-4 after equalisation) but `audit/pairs.ts` still showed the better-drawing slot winning. Variety across
   * matches is preserved because the seed still varies.
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
    regroupUntil: 0,
    passesWithoutProgress: 0,
    enemyBuildingsLost: 0,
    enemyStructureHp: 0,
    passiveProgress: 0,
    scoutLedger: [],
    scoutTarget: null,
    produceTick: 0,
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



    // First tick of the match: choose the opening variant from the seed.
    if (this.variantSeed !== state.seed) {
      this.variantSeed = state.seed;
      let h = (state.seed >>> 0) ^ 0x9e3779b9;
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
      /**
       * The final fold must be coerced UNSIGNED before the modulo.
       *
       * `h ^ (h >>> 16)` is a bitwise XOR, so its result is a SIGNED 32-bit int and can be negative. `% 3` on a negative
       * number is negative in JavaScript, which produced variants of -2 and -1 — values `openingFor` has no branch for, so
       * they silently fell through to the base order. Measured: `audit/variant-h2h.ts` reported "variant -2 = seed 2",
       * meaning a third of the seed space was quietly playing variant 0 while the mirror analysis assumed three distinct
       * variants were being compared.
       */
      this.openingVariant = ((h ^ (h >>> 16)) >>> 0) % 3;
    }

    if (this.memory.cooldown > 0) {
      this.memory.cooldown -= 1;
      return { commands: [], notes: [], perception: per };
    }
    this.memory.cooldown = this.profile.decisionInterval;

    return this.decide(state, per);
  }

  private decide(state: import('../sim/types').GameState, per: Perception): BrainTickResult {
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
      /**
       * A SCOUTED BUILDING DOES NOT EXPIRE.
       *
       * `GHOST_TRUST_TICKS` was meant to stop an army chasing a building that had since been destroyed. But a building
       * cannot move, and ghosts are pruned by the sim the moment their tile is re-seen and found empty — so the ghost
       * list is already accurate. Expiring the anchor on a timer threw away knowledge the AI had legitimately earned:
       * measured on seed 1035 at 28 sim-minutes, p1 had **23 army units and 4 known enemy buildings** while
       * `enemyAnchor === null` and `attacking === false`, so it never attacked again and the match ran out the clock.
       *
       * The anchor now persists while a ghost exists. `passesWithoutProgress` still detects a grind, and the wave
       * lifecycle still ends a wave that achieves nothing, so there is no risk of an army marching forever at rubble: it
       * arrives, finds nothing, the sim prunes the ghost, and the search sweep takes over.
       */
      this.memory.enemyAnchor = { x: ghost.x, y: ghost.y };
      this.memory.anchorAge = 0;
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

    /**
     * STALEMATE DETECTION.
     *
     * Progress is an enemy building disappearing. Two AIs that both sit at the 90-unit cap trade waves forever without
     * either side making progress — measured on two of four seeds, both locked at 90 units and 11 buildings after 32
     * sim-minutes with no winner. When nothing has changed for long enough, the AI stops trading and commits everything.
     */
    /**
     * Count remembered buildings, NOT `live || damaged`.
     *
     * The previous expression only counted buildings currently in sight or already hurt. The moment a scout walked away
     * and the ghost expired, that count fell to 0 — below the high-water mark — which reset the counter on the very
     * next pass. Measured consequence: an AI pinned at 22 of 43 army for 30 minutes with `passesWithoutProgress === 0`
     * and zero waves, i.e. the breaker could never fire. Ghosts persist in `per.enemyBuildings` until the sim prunes
     * them, so their count is stable across vision loss and is the right progress signal.
     */
    /**
     * COUNT MEANINGFUL STRUCTURES, NOT CHAIN SCAFFOLDING.
     *
     * The progress signal was `enemyBuildings.length`, which includes `stone_wall` — the cheap 40-mana blocks expansion uses to
     * bridge the build zone. Destroying one registered as "progress", resetting the counter, so an AI whose army was chewing through
     * scaffolding never escalated. Measured in the 2v2: `b1` had 39 army against `a1`'s 11 and sat at `passes = 0` forever because it
     * kept killing walls, while `a1`'s real base — 10 buildings — was never found. The match ran past 75 minutes.
     *
     * Only structures that matter are counted, so chewing on walls cannot masquerade as winning.
     */
    const enemyAlive = per.enemyBuildings.filter((b) => b.defId !== 'stone_wall').length;
    /**
     * HP LANDING IS PROGRESS, NOT JUST A KILL.
     *
     * This counted only DESTROYED buildings. A wave that had broken into the enemy base and ground the sanctum from 4000 to
     * 850 hp registered no progress at all, because nothing had died yet — so the wave timed out and was recalled, the
     * defender rebuilt, and the same half-finished assault was repeated. Measured on seed 1000 at 26 sim-minutes: p1 held 19
     * army inside p2's base with the sanctum at 850/4000 and three sentries still standing, and the match still would not
     * end.
     *
     * Damage on a real structure is unambiguous evidence that the wave is doing its job, so a drop in total enemy
     * structure HP also resets the no-progress counter. Walls are excluded for the same reason they are excluded above:
     * chewing scaffolding must not read as winning.
     */
    const enemyStructureHp = per.enemyBuildings
      .filter((b) => b.defId !== 'stone_wall')
      .reduce((a, b) => a + Math.max(0, b.hp), 0);
    const hpDropped = this.memory.enemyStructureHp > 0 && enemyStructureHp < this.memory.enemyStructureHp;
    this.memory.enemyStructureHp = enemyStructureHp;
    if (enemyAlive < this.memory.enemyBuildingsLost || hpDropped) {
      this.memory.passesWithoutProgress = 0;
      this.memory.passiveProgress = 0;
    } else {
      this.memory.passesWithoutProgress += 1;
      this.memory.passiveProgress += 1;
    }
    this.memory.enemyBuildingsLost = Math.max(this.memory.enemyBuildingsLost, enemyAlive);

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
      allIn:
        this.memory.passesWithoutProgress >= STALEMATE_PASSES ||
        elapsedSeconds >= DESPERATION_SECONDS,
      /**
       * Do not launch the next wave until the army has regrown past the size that failed. `allIn` overrides this: once the
       * game is decided the AI commits regardless, so a regroup order can never strand it.
       */
      regroupUntil:
        this.memory.passesWithoutProgress >= STALEMATE_PASSES || elapsedSeconds >= DESPERATION_SECONDS
          ? 0
          : this.memory.regroupUntil,
      enemyAnchor: this.memory.enemyAnchor,
      /**
       * WHERE TO GO WHEN WE KNOW OF NO ENEMY BUILDING AT ALL.
       *
       * This is the last real non-termination cause, and it is a scouting failure rather than a combat one. Measured on
       * seed 1014: after 26 sim-minutes `per.enemyBuildings` was EMPTY — p1 had never once seen an enemy structure — so
       * `pickAttackTarget` fell through to "last known enemy position", which was a stale sighting of a mobile unit in
       * open ground at (3350, 1836). The army marched there, arrived, went idle with no orders, and the re-task loop sent
       * it to the same empty spot again: notes read `re-tasking 8 idle unit(s) to close on last known enemy position`
       * forever, 38 units idle, enemy buildings at FULL health 8900/8900, and zero building damage in the whole match.
       *
       * The fix is to send the army to unexplored ground instead. `nextUnexplored` reads only `exploredTiles`, which is
       * the acting player's own revealed map, so this stays fog-legal — the AI is not peeking at where the base is, it is
       * sweeping the map with its army because it does not know. Farthest-first, so the army crosses the map toward the
       * far corner where an RTS start position actually is.
       *
       * Keyed on "no enemy BUILDING known", not "no anchor": the stall case had a perfectly good anchor — a stale sighting
       * of a mobile unit — which is exactly what made it a phantom destination.
       */
      /**
       * SWEEP WHEN NO REAL STRUCTURE IS KNOWN — not merely when no building at all is.
       *
       * The condition was `enemyBuildings.length === 0`, so scouting a single 40-mana stone wall counted as "we know where they live"
       * and switched the search off. Measured in the 2v2: `b1` had **39 army units** and its only known enemy building was a wall at
       * (688,912); with the sweep disabled it never found `a1`'s ten-building base, explored only 69% of the map, and the match ran past
       * 75 minutes while it chewed scaffolding.
       */
      /**
       * SWEEP UNLESS A LIVE, REAL STRUCTURE IS KNOWN.
       *
       * Two conditions, and both were missing at some point in this investigation:
       *
       *   • `b.live` — a GHOST is a remembered building we have lost sight of. It may have been destroyed long ago, so it
       *     cannot justify calling off the search. Measured on seed 2001 at 27 sim-minutes, `p4` held 23 army and its only
       *     remembered structures were four dead walls, all `live=false`, so it never swept and never visited either real
       *     sanctum.
       *   • not a wall — a `stone_wall` is a 40-mana build-zone extender, not a base. Treating one as "base located" was
       *     the 75-minute 2v2 defect.
       *
       * `knowsEnemyBase` in `planMilitary` mirrors this predicate exactly, so the two planners cannot disagree again.
       */
      searchTarget:
        per.enemyBuildings.filter((b) => b.live && b.defId !== 'stone_wall').length === 0
          ? this.searchObjective(per)
          : null,
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
      // The regroup obligation is discharged by actually attacking.
      this.memory.regroupUntil = 0;
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
      /**
       * A WINNING WAVE MUST NOT TIME OUT — THIS WAS THE LAST TERMINATION BUG.
       *
       * `beenOutLongEnough` ended a wave purely on elapsed passes, with no regard for whether the wave was winning. So a
       * wave that had broken into the enemy base and was killing it was recalled to "regroup" two minutes after it set
       * out, the defender rebuilt behind its static defences, and the whole cycle repeated. Measured on seed 1000 at 30
       * sim-minutes: p1 held **19 army against p2's 2** and its own note stream read `wave of 19 attacking Sanctum`,
       * then `wave timed out, regrouping`, over and over — a won game that could not be finished, which is exactly the
       * failure the 39-army 2v2 exhibited.
       *
       * A wave is now judged on OUTCOME before it is judged on TIME. It has clearly succeeded while the enemy is
       * materially outnumbered on the field, and the recall is suppressed until that stops being true. An attack that is
       * merely stalled (equal armies, no kills) still times out, so passivity is not rewarded and a genuine stalemate
       * still hands control back.
       */
      const enemyArmyNow = per.enemyUnits.filter((u) => u.weapon && !this.registry.units.get(u.defId)?.isHarvester).length;
      const winning = this.memory.attacking && enemyArmyNow <= Math.max(2, Math.floor(armyNow * 0.5));
      /**
       * A wave also counts as winning once it has actually reduced the enemy's building count, because that is the only
       * thing that ends a match: an army sitting on the enemy base killing structures must keep going even if the enemy
       * still has a comparable army elsewhere.
       */
      const razingBase = this.memory.passiveProgress < WAVE_MAX_PASSES;
      const beenOutLongEnough = this.memory.waveAge >= WAVE_MAX_PASSES && !winning && !razingBase;
      if (lostMostOfIt || beenOutLongEnough) {
        this.memory.attacking = false;
        /**
         * A WAVE THAT DIED MUST BE REPLACED BEFORE THE NEXT ONE GOES.
         *
         * `lastWaveSize` was overwritten with whatever the army happened to be, and the wave gate then compared against it.
         * After a wipe the army is near zero, so `required` collapses to `minWaveSize`, and the very next pass launched
         * whatever single unit existed. Measured on seed 1000 (normal vs easy): p1 issued **58 waves** while its opponent
         * issued ONE, and p2 finished with 205 army units against p1's 58. The AI was not attacking, it was dribbling its
         * army away one squad at a time.
         *
         * A failed wave now commits the AI to REBUILDING to the size that failed before it tries again. The threshold only
         * ever grows on failure, so the AI either masses a force that can succeed or escalates into the all-in path.
         */
        if (lostMostOfIt) {
          /**
           * REGROUPING MUST DEMAND A BIGGER ARMY THAN THE ONE THAT JUST DIED.
           *
           * This used `lastWaveSize = max(lastWaveSize, armyNow)` and then set the regroup threshold to that value — but
           * `armyNow` is the POST-LOSS count, so a wave of 9 that died down to 2 set the threshold to 2, and the AI
           * immediately re-attacked with the same 2 units. Measured on seed 1000 between 8.5 and 10 minutes: `attacking`
           * flipped true, wave "ended" after one pass, re-attacked with 2, and repeated — the army never grew because it was
           * permanently walking into a defended base in pairs.
           *
           * The committed size of the failed wave is what must be rebuilt, and the threshold is that size plus a margin so
           * it is never satisfied by the wreckage of the attempt itself.
           */
          const committed = Math.max(this.memory.lastWaveSize, armyNow);
          this.memory.lastWaveSize = committed;
          this.memory.regroupUntil = Math.max(this.memory.regroupUntil, committed + 2);
        }
        notes.push(lostMostOfIt ? 'wave spent, regrouping' : 'wave timed out, regrouping');
      }
    }

    // ---- production: army units, countering what we have SEEN.
    const producers = per.myBuildings.filter((b) => {
      if (b.buildProgress !== undefined) return false;
      const d = this.registry.buildings.get(b.defId);
      return !!d?.producesUnits?.length;
    });
    /**
     * A PLACEMENT FAILURE MUST NOT STOP UNIT PRODUCTION.
     *
     * This gate used to be `producers.length > 0 && !econ.blockedOnPlacement`, so the moment the economy could not find a legal
     * tile for its NEXT BUILDING, the AI stopped training army units too. Those are unrelated capabilities: a crowded base with
     * three summoning circles standing can still train units perfectly well.
     *
     * In a 1v1 the base usually has room, so this was invisible. In a 4-player free-for-all every player crowds the same node
     * clusters and placement fails often, and the effect was total: measured on seed 2001 at 24 sim-minutes, all four players
     * sat on 6-10 buildings with large banks and almost no army —
     *
     *   p4: 620 mana, 10 workers, 2 army
     *   p2: 150 mana, 6 workers, 7 army
     *
     * — and none of them could ever build the force that would end the match, so all four survived to the 30-minute cap.
     *
     * Production is now gated on having a producer and on the bank, never on whether a building site exists.
     */
    if (producers.length > 0) {
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
        /**
         * ROUND-ROBIN ACROSS PRODUCERS, COUNTED FROM THIS PLAYER'S OWN PASSES.
         *
         * This used `producers[per.tick % producers.length]`, and `per.tick` is the shared match tick — the same number for
         * every player in the match. Two players with the same number of producers therefore picked the SAME index on
         * every pass, and since producers are ordered by building id (allocation order), that index resolved to a
         * different position within each player's base. The two sides then preferred different buildings in their own
         * lineup, which is a per-player production pattern driven by nothing but the clock.
         *
         * A per-player counter keeps the intent — "rotate, so no producer sits idle" — without making the rotation a
         * function of shared state.
         */
        this.memory.produceTick += 1;
        const b = producers[this.memory.produceTick % producers.length]!;
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
          const isWorker = this.registry.units.get(watch.defId)?.isHarvester === true;
          /**
           * A WORKER IS NEVER PARKED ON A WATCH.
           *
           * `pickScouts` uses a harvester when there is no spare soldier, and this watch order was re-issued every pass
           * while the worker sat more than 260 units from the anchor, with no timeout. If the anchor is somewhere the worker
           * cannot stand, it is pinned for the rest of the match.
           *
           * Measured on seed 1035 (hard vs normal), which ran the full 30 minutes: p2 was down to ONE harvester holding
           * `move` to (128, 2688) while sitting at (140, 2686) -- already there, never "arriving" because its formation slot
           * was unreachable. Carry stayed 0, income was zero, and with 13 live mana nodes on the map it could never buy
           * another worker. The economy could not recover and the match could not end.
           *
           * Once the base is located the watch has served its purpose, so a worker is simply released back to harvesting.
           * Soldiers keep the watch; holding position costs them nothing.
           */
          /**
           * A WATCH MUST NOT COMPETE WITH THE WAVE FOR THE SAME UNIT.
           *
           * This emitted `move` to the enemy anchor while the military planner emitted `attackMove` to the same place on the
           * same unit, in the SAME decision pass. The two orders cancel, the unit never moves, and because both are re-issued
           * every pass it never will. Measured on seed 1035 at 20 sim-minutes, verbatim from the command stream:
           *
           *   tick 24087: attackMove p1 [38] -> 3552,512   AND   move p1 [38] -> 3632,464
           *   tick 24108: move p1 [38] -> 3632,464
           *   tick 24129: attackMove p1 [38] -> 3552,512   AND   move p1 [38] -> 3632,464
           *
           * One unit, two destinations, alternating forever. The scout must only take a unit the army is NOT using, which
           * means a watch requires spare units beyond the wave requirement.
           */
          const combatCount = per.myUnits.filter((u) => u.weapon && !this.registry.units.get(u.defId)?.isHarvester).length;
          const spareForWatch = combatCount > Math.max(1, this.profile.minWaveSize);
          if (!isWorker && spareForWatch && Math.hypot(watch.x - ax, watch.y - ay) > 260) {
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
          const target = this.searchObjective(per);
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
    /**
     * NEVER DRAFT A WORKER THE ECONOMY CANNOT SPARE.
     *
     * Scouting with one worker is right early, when there is no soldier to send. But the draft had no floor, so once the
     * worker count fell the AI kept sending its last worker across the map to be killed. Measured on seed 1000 (mirror):
     * p1 workers died at (2057,649) and (511,1547) — 1600 and 1100 units from a base at (464,464) — and the line went
     * 7 -> 3 -> 1 -> 0 by minute 6, taking the economy with it. p2, whose scout survived, kept all seven.
     *
     * A worker is only drafted while at least four remain, which is enough to keep income alive if the scout dies.
     */
    const workerCount = per.myUnits.filter((u) => this.registry.units.get(u.defId)?.isHarvester === true).length;
    const mayDraftWorker = workerCount >= 4;
    const ranked: { u: SeenUnit; speed: number; harvester: boolean }[] = [];
    for (const u of per.myUnits) {
      const def = this.registry.units.get(u.defId);
      if (!def) continue;
      if (def.isHarvester === true && !mayDraftWorker) continue;
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
  /**
   * The army's current search objective, held stable across decision passes.
   *
   * Returns a destination and records it in the ledger the first time it is chosen. The objective is kept until it is
   * reached (which reveals ground), until it expires, or until a real enemy structure is found — at which point the
   * normal wave logic takes over and the search stops entirely. Only re-chosen when it changes, so the planner does not
   * restart the army's pathing every pass.
   */
  private searchObjective(per: Perception): { x: number; y: number } | null {
    const now = per.tick;
    const held = this.memory.scoutTarget;

    // Arrived (or near enough that walking further would not reveal anything new): rotate to the next objective.
    const arrived =
      held !== null &&
      (Math.hypot((per.myUnits[0]?.x ?? 0) - held.x, (per.myUnits[0]?.y ?? 0) - held.y) < TILE * 3 ||
        per.exploredTiles.has(Math.floor(held.y / TILE) * per.mapW + Math.floor(held.x / TILE)));

    if (held && !arrived && now < held.expiresAt) return { x: held.x, y: held.y };

    const next = nextUnexplored(per, this.memory.scoutLedger);
    if (!next) {
      this.memory.scoutTarget = null;
      return null;
    }
    /**
     * STAMP THE OBJECTIVE BEFORE LOOKING FOR THE NEXT ONE.
     *
     * The stamp is what guarantees forward progress: with this candidate marked, the next call to `nextUnexplored`
     * skips it and proposes the one after it, so a chain of objectives is walked even if the army is pulled away
     * before any of them is reached. Bounded so a long match cannot grow the ledger without limit.
     */
    this.memory.scoutLedger.push({ tx: Math.floor(next.x / TILE), ty: Math.floor(next.y / TILE) });
    if (this.memory.scoutLedger.length > 96) this.memory.scoutLedger.shift();
    this.memory.scoutTarget = { x: next.x, y: next.y, expiresAt: now + SEARCH_OBJECTIVE_SECONDS * 20 };
    return next;
  }

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
function nextUnexplored(
  per: Perception,
  ledger?: readonly { tx: number; ty: number }[],
): { x: number; y: number } | null {
  if (per.exploredTiles.size >= per.mapW * per.mapH) return null;
  const from = per.myBuildings[0] ?? per.myUnits[0];
  const cx = from ? Math.floor(from.x / TILE) : Math.floor(per.mapW / 2);
  const cy = from ? Math.floor(from.y / TILE) : Math.floor(per.mapH / 2);

  /**
   * SYSTEMATIC SEARCH: START LOCATIONS, THEN NODE CLUSTERS, THEN WHATEVER IS LEFT.
   *
   * "Head for the farthest unexplored ground" is a heuristic, not a search plan. It treats every unseen tile as equally
   * likely to hold an enemy base, which is false: a base is at a start location, or failing that beside mana, because
   * every economy in this game must mine. That difference is what leaves an AI wandering: measured in the 2v2, `b1`
   * explored 7,805 of 11,264 tiles over 75 minutes while holding 39 army units and never found `a1`'s ten-building base,
   * because nothing told it the four places a base could be.
   *
   * So candidates are ranked by "how likely is a base here", with distance only breaking ties:
   *
   *   1. an UNSEEN START LOCATION — the single highest-value place to look, and the first thing a human checks;
   *   2. an UNSEEN NODE CLUSTER — a base must sit by mana, so a node nobody has looked at is the next best bet
   *      (a large cluster is worth more than a lone node, and a far one is more likely to be the enemy's, since our
   *      own expansion already covers the nearby ones);
   *   3. otherwise the farthest mostly-unexplored block, which is the old behaviour and now only the fallback.
   *
   * Every candidate is checked against the `ledger`, which remembers where the scout has ALREADY been sent, so the
   * search cannot re-pick the same spot forever when its destination turns out to be unreachable or already covered
   * by the time the army arrives. The ledger is a set of visit stamps on a coarse world grid, supplied by the brain
   * and never derived from hidden state.
   *
   * Legality: start locations, node positions and terrain are all published map data (the lobby shows starts before the
   * match, and nodes are already exposed in full through `per.nodes`). Whether an enemy is actually AT one is still
   * discovered through fog like anything else.
   */
  const LEDGER_RADIUS = 6; // tiles: a candidate within this many tiles of a stamp counts as visited
  const visited = (tx: number, ty: number): boolean => {
    if (!ledger) return false;
    return ledger.some((v) => Math.abs(v.tx - tx) <= LEDGER_RADIUS && Math.abs(v.ty - ty) <= LEDGER_RADIUS);
  };
  /** Is a world point already revealed? A candidate we can already see is not worth walking to. */
  const revealed = (wx: number, wy: number): boolean => {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= per.mapW || ty >= per.mapH) return true;
    return per.exploredTiles.has(ty * per.mapW + tx);
  };
  /** Nearest walkable tile to a world point, so a candidate on a cliff is still usable. */
  const walkableNear = (wx: number, wy: number): { x: number; y: number } | null => {
    const tx0 = Math.floor(wx / TILE);
    const ty0 = Math.floor(wy / TILE);
    for (let r = 0; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = tx0 + dx;
          const ty = ty0 + dy;
          if (tx < 0 || ty < 0 || tx >= per.mapW || ty >= per.mapH) continue;
          if (!per.tileWalkable(tx, ty)) continue;
          return { x: tx * TILE, y: ty * TILE };
        }
      }
    }
    return null;
  };

  // ---- 1. unseen start locations, nearest first (they are all equally likely to be the enemy's)
  let bestStart: { x: number; y: number; d: number } | null = null;
  for (const s of per.landmarks.starts) {
    if (revealed(s.x, s.y) || visited(Math.floor(s.x / TILE), Math.floor(s.y / TILE))) continue;
    // Our own start is not a candidate: we know exactly what is there.
    if (from && Math.hypot(s.x - from.x, s.y - from.y) < TILE * 10) continue;
    const spot = walkableNear(s.x, s.y);
    if (!spot) continue;
    const d = Math.hypot(spot.x - cx * TILE, spot.y - cy * TILE);
    if (!bestStart || d < bestStart.d) bestStart = { ...spot, d };
  }
  if (bestStart) return { x: bestStart.x, y: bestStart.y };

  // ---- 2. unseen node clusters, scored by cluster size then distance from home
  let bestNode: { x: number; y: number; score: number } | null = null;
  for (const n of per.landmarks.nodes) {
    if (revealed(n.x, n.y) || visited(Math.floor(n.x / TILE), Math.floor(n.y / TILE))) continue;
    const spot = walkableNear(n.x, n.y);
    if (!spot) continue;
    let cluster = 0;
    for (const m of per.landmarks.nodes) if (Math.hypot(m.x - n.x, m.y - n.y) <= TILE * 10) cluster++;
    const d = Math.hypot(spot.x - cx * TILE, spot.y - cy * TILE);
    // Prefer a big cluster, and among those prefer the one furthest from home (our own neighbourhood is already ours).
    const score = cluster * 1000 + d * 0.001;
    if (!bestNode || score > bestNode.score) bestNode = { ...spot, score };
  }
  if (bestNode) return { x: bestNode.x, y: bestNode.y };

  /**
   * 3. FALLBACK: THE FARTHEST MOSTLY-UNEXPLORED BLOCK.
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
      /**
       * THE DESTINATION MUST BE GROUND A UNIT CAN STAND ON.
       *
       * A block's centre is often a cliff or a wall tile, and `attackMove` to an unwalkable point can never be satisfied:
       * the flow field has no route, steering and separation cancel out, and the unit oscillates in place a few units from
       * the goal forever. Measured on seed 1007 at 30 sim-minutes: armies frozen in a 4-5 unit loop around (3725, 2464)
       * with a valid order to (3712, 2432), map coverage stuck at 4936/11264 tiles, `knownEnemyBld = 0` for BOTH sides,
       * and neither AI ever attacking.
       *
       * Search the block for walkable ground instead of assuming the centre is usable, and skip the block entirely if it
       * contains none.
       */
      let bxC = bx + STRIDE / 2;
      let byC = by + STRIDE / 2;
      if (!per.tileWalkable(bxC, byC)) {
        let found = false;
        for (let ty = by; ty < by + STRIDE && !found; ty++) {
          for (let tx = bx; tx < bx + STRIDE && !found; tx++) {
            if (!per.tileWalkable(tx, ty)) continue;
            bxC = tx;
            byC = ty;
            found = true;
          }
        }
        if (!found) continue;
      }
      if (visited(bxC, byC)) continue;
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
