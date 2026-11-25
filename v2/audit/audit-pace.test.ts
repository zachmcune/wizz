// Phase-0: economy/pace baselines — how long does a real build order take?
import { it, describe } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import { ownedBy } from '../src/sim/queries';
import type { MatchConfig, Command } from '../src/sim/types';

const reg = getRegistry();

describe('v1 pacing baseline', () => {
  it('measures scripted expansion pace (no AI)', () => {
    const cfg: MatchConfig = {
      mapId: 'duel_glade',
      seed: 1,
      players: [
        { id: 'player0', controller: 'human', team: 0, color: '#4f9dff', startIndex: 0 },
        { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: 'easy' },
      ],
    };
    const { state, services } = initMatch(reg, cfg);
    const sim = createSimulation(state, services, { aiEnabled: false });
    const p = state.players[0]!;

    // Simple human-like plan: build spire near the home node, then a circle, then spam imps.
    const marks: Record<string, number> = {};
    const note = (k: string) => { if (marks[k] === undefined) marks[k] = state.tick; };

    const sanctum = ownedBy(state, 'player0').find((e) => e.kind === 'building')!;
    const spireAt = { x: sanctum.pos.x + 96, y: sanctum.pos.y + 96 };

    let built = { spire: false, circle: false, ley: false };
    let queued = 0;
    while (state.tick < 20 * 60 * 12) {
      if (!built.spire && p.mana >= 750) {
        sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: spireAt.x, y: spireAt.y } as Command]);
        built.spire = true;
      }
      const bld = ownedBy(state, 'player0').filter((e) => e.kind === 'building');
      const spire = bld.find((e) => e.defId === 'attunement_spire');
      if (spire && spire.buildProgress === undefined) {
        note('spireComplete');
        const hasCircle = bld.some((e) => e.defId === 'summoning_circle');
        if (!built.circle && !hasCircle && p.mana >= 550) {
          sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'summoning_circle', x: sanctum.pos.x - 128, y: sanctum.pos.y + 96 } as Command]);
          built.circle = true;
        }
        const circle = bld.find((e) => e.defId === 'summoning_circle');
        if (circle && circle.buildProgress === undefined) {
          note('circleComplete');
          const army = ownedBy(state, 'player0').filter((e) => e.kind === 'unit' && e.defId === 'imp_swarmling').length;
          if (army < 12 && p.mana >= 140) {
            sim.enqueueNow([{ type: 'produce', playerId: 'player0', buildingId: circle.id, defId: 'imp_swarmling' } as Command]);
          }
          if (army >= 10) note('tenImps');
        }
      }
      // Keep two wisps harvesting the closest corner node.
      for (const w of ownedBy(state, 'player0')) {
        if (w.kind === 'unit' && w.defId === 'wisp' && w.orders.length === 0) {
          const node = [...state.entities.values()].find((e) => e.kind === 'resource_node' && e.amount > 0);
          if (node) sim.enqueueNow([{ type: 'harvest', playerId: 'player0', entityIds: [w.id], nodeId: node.id } as Command]);
        }
      }
      sim.step();
    }

    const secs = (t: number | undefined) => (t === undefined ? null : +(t / 20).toFixed(1));
    const out = {
      startingMana: reg.balance.startingMana,
      siphonPerSecond: reg.balance.siphonPerSecond,
      wispCarry: reg.units.get('wisp')!.carry,
      manaAt: secs(marks.spireComplete),
      spireCompleteSec: secs(marks.spireComplete),
      circleCompleteSec: secs(marks.circleComplete),
      tenImpsSec: secs(marks.tenImps),
      finalMana: Math.floor(p.mana),
      finalUnits: ownedBy(state, 'player0').filter((e) => e.kind === 'unit').length,
    };
    // eslint-disable-next-line no-console
    console.log('PACE ' + JSON.stringify(out, null, 1));
  }, 300_000);
});
