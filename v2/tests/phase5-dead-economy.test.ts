// THE DEAD ECONOMY CANNOT BE REACHED FROM A NORMAL START.
//
// The failure this guards against was measured, not imagined: a side with **zero harvesters and 155 mana** against a 200-cost
// worker, owning two attunement spires and nothing sellable. With no workers there is no income, so it could never afford the
// worker that would restore its income, and it stayed exactly 45 mana short for the rest of the match while its opponent sat on
// 111,700 untouched map mana. The game could not resolve.
//
// Two things prevent it now, and this file tests both:
//
//   1. THE WORKER RESERVE — while a side holds fewer than two harvesters it never commits its last worker's worth of mana, so it
//      cannot spend itself into the state.
//   2. THE SANCTUM TRICKLE — a passive 1 mana/s per held HQ, which funds one worker in about 3.3 minutes. This is the floor under
//      a DISASTER: if a raid kills the whole worker line, income returns slowly instead of never.
//
// The reserve alone cannot fix an economy already at zero workers (there is nothing left to reserve), which is exactly why the
// trickle was added — and why both are asserted here rather than only the one that was easy to test.
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { planEconomy } from '../src/ai/economy';
import { profileFor } from '../src/ai/difficulty';
import { KIND_UNIT } from '../src/sim/entity-store';

const TICK_HZ = 20;

describe('the zero-worker deadlock is unreachable', () => {
  it('the sanctum trickle funds a worker from a dead economy', () => {
    /**
     * Stage the exact dead state: no harvesters, mana below the worker cost, an HQ still standing.
     *
     * If the trickle works, the bank must climb past the worker cost within a bounded time. This is the property that makes the
     * deadlock impossible — without it the bank is frozen and nothing can change.
     */
    const registry = loadRegistry();
    const workerCost = registry.unit('wisp').cost;
    const { state, services } = initMatch(registry, {
      mapId: 'duel_glade',
      seed: 24680,
      oneSuperweaponPerPlayer: false,
      players: [
        { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
        { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
      ],
    } as never);

    // Remove p1's harvesters and set the bank to the measured dead value.
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
      if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
      if (registry.units.get(state.entities.extras[s]!.defId)?.isHarvester) state.entities.kill(s);
    }
    state.players[0]!.mana = 155;
    expect(state.players[0]!.mana).toBeLessThan(workerCost);

    const startMana = state.players[0]!.mana;
    // Ten minutes is far longer than the ~3.3 minutes the trickle needs, and short enough to keep the test cheap.
    for (let t = 0; t < 10 * 60 * TICK_HZ && !state.ended; t++) stepSimulation(state, services, [], undefined);

    expect(state.players[0]!.mana, 'the bank never grew, so the deadlock is still reachable').toBeGreaterThan(startMana);
    expect(
      state.players[0]!.mana,
      `bank only reached ${state.players[0]!.mana} after 10 min; the trickle must fund a ${workerCost}-mana worker`,
    ).toBeGreaterThanOrEqual(workerCost);
  }, 300_000);

  it('the AI never spends below one worker while short on harvesters', () => {
    /**
     * THE RESERVE, asserted directly on the planner rather than inferred from a match.
     *
     * With fewer than two harvesters, whatever else the planner decides, the mana it leaves available to spend must never drop
     * below the cost of a worker it cannot then afford. This is the rule that stops a side spending itself into the dead state.
     */
    const registry = loadRegistry();
    const { state, services } = initMatch(registry, {
      mapId: 'duel_glade',
      seed: 24681,
      oneSuperweaponPerPlayer: false,
      players: [
        { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
        { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
      ],
    } as never);
    const driver = new AiDriver(registry, services);
    // Let the opening run so there is a real base to plan against.
    for (let t = 0; t < 40 * TICK_HZ; t++) stepSimulation(state, services, [], driver.hook);

    // Strip the worker line so the reserve rule is in effect.
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
      if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
      if (registry.units.get(state.entities.extras[s]!.defId)?.isHarvester) state.entities.kill(s);
    }
    // Give it a bank worth protecting.
    state.players[0]!.mana = 600;

    const brain = driver.brain('p1')!;
    const per = brain.perception(state);
    const workerCost = registry.unit('wisp').cost;
    const plan = planEconomy(state, per, registry, services, profileFor('normal'), 'normal', 60, 0);

    const spendable = state.players[0]!.mana - plan.reservedForBuild;
    expect(
      plan.reservedForBuild,
      `reserve is ${plan.reservedForBuild} with no harvesters; it must hold back at least one worker (${workerCost})`,
    ).toBeGreaterThanOrEqual(Math.min(workerCost, state.players[0]!.mana));
    expect(spendable, 'the army could spend the worker reserve').toBeLessThanOrEqual(
      state.players[0]!.mana - Math.min(workerCost, state.players[0]!.mana),
    );
  }, 120_000);

  it('a side at zero workers always escapes the dead state and rebuilds', () => {
    /**
     * THE END-TO-END GUARD, stated as the property that actually matters.
     *
     * A side reduced to zero workers by a raid is a disaster, not a bug. What must never happen is that the state PERSISTS — no
     * income, bank frozen below the worker cost, forever. So this asserts the way out rather than the absence of the state:
     *
     *   every stretch at zero workers must END, and it must end because the bank reached the worker cost and a worker was bought.
     *
     * An earlier version of this test asserted a side never stayed in the state for more than 120 s and failed on seed 1000. That
     * was the test being wrong, not the game: measured, the side was buying a worker every time the trickle funded one and losing
     * it to the attackers, **21 purchases in 18 minutes**. Being killed while rebuilding is combat pressure; being unable to
     * rebuild at all is the deadlock, and the trickle removes the second.
     */
    const registry = loadRegistry();
    const workerCost = registry.unit('wisp').cost;

    for (const seed of [1000, 1035]) {
      const { state, services } = initMatch(registry, {
        mapId: 'duel_glade',
        seed,
        oneSuperweaponPerPlayer: false,
        players: [
          { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
          { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
        ],
      } as never);
      const driver = new AiDriver(registry, services);

      const workerCount = (pid: string): number => {
        let n = 0;
        for (let s = 0; s < state.entities.count; s++) {
          if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
          if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== pid) continue;
          if (registry.units.get(state.entities.extras[s]!.defId)?.isHarvester) n++;
        }
        return n;
      };

      const stuckSince: Record<string, number> = { p1: -1, p2: -1 };
      const longestStuck: Record<string, number> = { p1: 0, p2: 0 };
      /** A stretch is only a FAILURE if it never ended while the match was live. */
      const unbrokenAtEnd: Record<string, number> = { p1: 0, p2: 0 };
      const buys: Record<string, number> = { p1: 0, p2: 0 };
      const prevWorkers: Record<string, number> = { p1: -1, p2: -1 };

      const maxTicks = 30 * 60 * TICK_HZ;
      for (let t = 0; t < maxTicks && !state.ended; t++) {
        stepSimulation(state, services, [], driver.hook);
        for (const pid of ['p1', 'p2']) {
          const p = state.players.find((x) => x.id === pid);
          if (!p || p.defeated) continue;
          const w = workerCount(pid);
          if (prevWorkers[pid]! >= 0 && w > prevWorkers[pid]!) buys[pid] = (buys[pid] ?? 0) + 1;
          prevWorkers[pid] = w;

          const inDeadState = w === 0 && p.mana < workerCost;
          if (inDeadState) {
            if (stuckSince[pid]! < 0) stuckSince[pid] = state.tick;
            longestStuck[pid] = Math.max(longestStuck[pid]!, (state.tick - stuckSince[pid]!) / TICK_HZ);
          } else if (stuckSince[pid]! >= 0) {
            stuckSince[pid] = -1;
          }
        }
      }

      for (const pid of ['p1', 'p2']) {
        // A stretch that is STILL open when the match ends would be an unresolved deadlock. The match always terminates, so this
        // catches "the side was stuck at the final whistle".
        if (stuckSince[pid]! >= 0) unbrokenAtEnd[pid] = (state.tick - stuckSince[pid]!) / TICK_HZ;

        expect(
          unbrokenAtEnd[pid],
          `seed ${seed} ${pid}: still at zero workers and unable to afford one when the match ended ` +
            `(${Math.round(unbrokenAtEnd[pid]!)}s) — that is the deadlock, unresolved`,
        ).toBeLessThan(20);
      }

      /**
       * Every side that fell into the state must have bought a worker afterwards: that is the trickle doing its job. A side with
       * zero purchases would mean it could never leave, which is the original bug.
       */
      for (const pid of ['p1', 'p2']) {
        const p = state.players.find((x) => x.id === pid);
        if (!p || p.defeated) continue;
        if (longestStuck[pid]! > 0) {
          expect(buys[pid], `seed ${seed} ${pid}: entered the dead state but never bought a worker`).toBeGreaterThan(0);
        }
      }
    }
  }, 900_000);
});
