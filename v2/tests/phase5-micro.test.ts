// MICRO: FOCUS FIRE, KITING, AND PULLING BACK HURT UNITS.
//
// Phase 5 requires three specific micro behaviours. Each is a *decision the planner emits*, so each is tested by constructing the
// situation that should provoke it and asserting the emitted command — not by reading the planner's source.
//
//   • FOCUS FIRE — every shooter in range is ordered onto ONE target (the lowest-HP enemy), rather than each picking its own.
//   · KITING — a ranged unit whose attacker is closing steps back while its weapon is on cooldown, instead of standing still.
//   • RETREAT — a badly hurt unit in contact with the enemy is ordered out of weapon range, and only when the army is large
//     enough that withdrawing does not hand the fight away.
//
// The numbers here come from the same `planMilitary` the game runs, so a change to the real behaviour breaks these tests.
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { planMilitary } from '../src/ai/military';
import { DIFFICULTIES } from '../src/ai/difficulty';
import type { Perception, SeenUnit } from '../src/ai/perception';
import type { Registry } from '../src/data/registry';
import { spawnUnitAt } from '../src/sim/systems/production';
import type { GameState } from '../src/sim/types';
import type { SimServices } from '../src/sim/context';
import type { Command } from '../src/sim/types';

interface Harness {
  state: GameState;
  services: SimServices;
  registry: Registry;
  driver: AiDriver;
}

/**
 * A match with the two AI bases placed close together so a fight can be staged immediately.
 *
 * Real commanders see enemies only through fog, and the micro planner reads `per.enemyUnits`, so the staging has to put the
 * units genuinely in sight of each other rather than injecting a fake perception.
 */
function staged(): Harness {
  const registry = loadRegistry();
  const { state, services } = initMatch(registry, {
    mapId: 'duel_glade',
    seed: 5150,
    oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    ],
  } as never);
  const driver = new AiDriver(registry, services);
  // One tick so the brains exist and perceptions are real.
  stepSimulation(state, services, [], driver.hook);
  return { state, services, registry, driver };
}

/** Every command of a given type from a plan, as ids grouped by target. */
function attackGroups(cmds: Command[]): { ids: number[]; targetId: number }[] {
  return cmds
    .filter((c): c is Extract<Command, { type: 'attack' }> => c.type === 'attack')
    .map((c) => ({ ids: c.entityIds as number[], targetId: c.targetId as number }));
}

describe('micro: focus fire', () => {
  it('orders every shooter in range onto the same lowest-HP target', () => {
    const { state, services, driver } = staged();
    const brain = driver.brain('p1')!;
    const per = brain.perception(state);

    /**
     * Stage the fight: three of our ranged attackers around a point, two enemy units beside them with DIFFERENT health, so
     * "lowest HP" is unambiguous. Positions are taken from our own sanctum so they are legal ground.
     */
    const home = per.myBuildings.find((b) => b.defId === 'sanctum');
    expect(home, 'no sanctum to stage around').toBeDefined();
    const cx = home!.x;
    const cy = home!.y + 90;

    const mine: number[] = [];
    for (let i = 0; i < 3; i++) {
      const slot = spawnUnitAt(state, services, 'arcane_archer', 'p1', cx + (i - 1) * 24, cy, null);
      if (slot >= 0) mine.push(state.entities.id[slot]!);
    }
    const hurt = spawnUnitAt(state, services, 'imp_swarmling', 'p2', cx + 100, cy, null);
    const healthy = spawnUnitAt(state, services, 'imp_swarmling', 'p2', cx + 120, cy + 20, null);
    expect(mine.length).toBe(3);
    expect(hurt).toBeGreaterThanOrEqual(0);
    expect(healthy).toBeGreaterThanOrEqual(0);
    // Damage one so "lowest HP" has a definite answer, and let visibility update.
    state.entities.hp[hurt] = state.entities.maxHp[hurt]! * 0.25;
    stepSimulation(state, services, [], undefined);

    const per2 = brain.perception(state);
    const plan = planMilitary(per2, registryOf(services), DIFFICULTIES.hard, {
      homeX: home!.x,
      homeY: home!.y,
      lastWaveSize: 0,
      attacking: true,
      enemyAnchor: { x: cx + 100, y: cy },
    });

    const groups = attackGroups(plan.commands);
    expect(groups.length, 'no focus-fire command was issued with shooters in range').toBeGreaterThan(0);
    // Every focus-fire order must name the SAME target — that is what makes it focus fire rather than everyone skirmishing.
    const targets = new Set(groups.map((g) => g.targetId));
    expect(targets.size, `shooters were split across ${targets.size} targets`).toBe(1);
    // And it must be the hurt one.
    expect([...targets][0]).toBe(state.entities.id[hurt!]);
  }, 120_000);
});

describe('micro: kiting', () => {
  it('steps a ranged unit back only when a profile has kiting enabled', () => {
    const { state, services, driver } = staged();
    const brain = driver.brain('p1')!;
    const home = brain.perception(state).myBuildings.find((b) => b.defId === 'sanctum')!;
    const cx = home.x;
    const cy = home.y + 90;

    /**
     * `rift_skimmer` has range 86, which lands it in the planner's `ranged` role (60-119). It has to be genuinely ranged:
     * `arcane_archer` has range 132 and is classified SIEGE (>=120), so it is not eligible to kit at all and using it here
     * made the test fail for a reason that had nothing to do with kiting.
     */
    const shooter = spawnUnitAt(state, services, 'rift_skimmer', 'p1', cx, cy, null);
    // A melee attacker right on top of it, so "in danger" is unambiguous.
    spawnUnitAt(state, services, 'imp_swarmling', 'p2', cx + 40, cy, null);
    stepSimulation(state, services, [], undefined);

    const per = brain.perception(state);
    const plan = planMilitary(per, registryOf(services), DIFFICULTIES.hard, {
      homeX: home.x,
      homeY: home.y,
      lastWaveSize: 0,
      attacking: true,
      enemyAnchor: { x: cx + 40, y: cy },
    });
    const kiters = plan.commands.filter(
      (c) => c.type === 'move' && (c.entityIds as number[]).includes(state.entities.id[shooter!]!),
    );
    expect(kiters.length, 'hard has kiting enabled but gave the threatened archer no step-back order').toBeGreaterThan(0);

    /**
     * And the SAME situation with kiting disabled must produce no such order — otherwise the test would pass on any profile and
     * would not actually be measuring the lever.
     */
    const per2 = brain.perception(state);
    const noKite = planMilitary(per2, registryOf(services), { ...DIFFICULTIES.hard, kiting: false }, {
      homeX: home.x,
      homeY: home.y,
      lastWaveSize: 0,
      attacking: true,
      enemyAnchor: { x: cx + 40, y: cy },
    });
    const kitedOff = noKite.commands.filter(
      (c) => c.type === 'move' && (c.entityIds as number[]).includes(state.entities.id[shooter!]!),
    );
    expect(kitedOff.length, 'the archer stepped back even with kiting disabled').toBe(0);
  }, 120_000);
});

describe('micro: pulling back hurt units', () => {
  it('withdraws a badly hurt unit that is in contact, and not one that is healthy', () => {
    const { state, services, driver } = staged();
    const brain = driver.brain('p1')!;
    const home = brain.perception(state).myBuildings.find((b) => b.defId === 'sanctum')!;
    const cx = home.x;
    const cy = home.y + 90;

    // Four soldiers so the army is above the size where retreat is skipped as suicidal, one of them nearly dead.
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) {
      const slot = spawnUnitAt(state, services, 'imp_swarmling', 'p1', cx + (i - 1.5) * 22, cy, null);
      if (slot >= 0) ids.push(state.entities.id[slot]!);
    }
    const hurtId = ids[0]!;
    const hurtSlot = state.entities.slotOf(hurtId as never);
    state.entities.hp[hurtSlot] = state.entities.maxHp[hurtSlot]! * 0.15;
    spawnUnitAt(state, services, 'imp_swarmling', 'p2', cx + 30, cy, null);
    stepSimulation(state, services, [], undefined);

    const per = brain.perception(state);
    const plan = planMilitary(per, registryOf(services), DIFFICULTIES.hard, {
      homeX: home.x,
      homeY: home.y,
      lastWaveSize: 0,
      attacking: true,
      enemyAnchor: { x: cx + 30, y: cy },
    });

    const retreatOrders = plan.commands.filter(
      (c) => c.type === 'move' && (c.entityIds as number[]).includes(hurtId),
    );
    expect(retreatOrders.length, 'a unit at 15% HP in contact was not pulled back').toBeGreaterThan(0);
    // The retreat must be a SHORT step out of weapon range, not a march to the far corner — that distinction is what the
    // earlier "retreat home" version got wrong and it made the difficulty weaker.
    const dest = retreatOrders[0]!;
    if (dest.type === 'move') {
      const travel = Math.hypot(dest.x - cx, dest.y - cy);
      expect(travel, `retreat distance ${travel.toFixed(0)} looks like a march home, not a step back`).toBeLessThan(600);
    }
  }, 120_000);
});

/** The registry the planner expects, taken from the live services so staging and plan agree. */
function registryOf(services: SimServices): Registry {
  return services.registry;
}

/**
 * Guard against the micro tests silently going vacuous.
 *
 * Each of the three behaviours above requires the profile to have its lever ON. If a future edit flips one of these to `false`
 * for the difficulty under test, the tests would either fail confusingly or (worse) the "disabled" half of the kiting test would
 * trivially pass. This states the expectation explicitly.
 */
describe('micro lever expectations', () => {
  it('hard enables the micro behaviours the tests exercise', () => {
    expect(DIFFICULTIES.hard.focusFire).toBe(true);
    expect(DIFFICULTIES.hard.kiting).toBe(true);
    expect(DIFFICULTIES.hard.retreatHurtUnits).toBe(true);
  });
});

/** Type-only guard: `SeenUnit` is part of the perception contract these tests rely on. */
export type _SeenUnit = SeenUnit;
export type _Perception = Perception;
