import { describe, expect, it } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { ownedBy } from '../src/sim/queries';
import { leastBusyProducer, listProducersForUnit, producerLabel, type ProducerInfo } from '../src/ui/hud/producers';

const reg = getRegistry();

describe('producer helpers', () => {
  it('returns no producers until the required building exists', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const producers = listProducersForUnit(state, reg, 'player0', 'imp_swarmling');
    expect(producers).toHaveLength(0);
    void services;
  });

  it('lists a completed summoning circle as an imp producer', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    sim.enqueueNow([{ type: 'build', playerId: 'player0', defId: 'summoning_circle', x: 420, y: 260 }]);
    sim.step();
    for (let i = 0; i < reg.building('summoning_circle').buildTime * 20 + 10; i++) sim.step();

    const circle = ownedBy(state, 'player0').find((e) => e.defId === 'summoning_circle');
    expect(circle).toBeTruthy();

    const producers = listProducersForUnit(state, reg, 'player0', 'imp_swarmling');
    expect(producers).toHaveLength(1);
    expect(producers[0]!.entity.id).toBe(circle!.id);
    expect(producerLabel(reg, state, circle!)).toMatch(/^SUM #\d+$/);
  });

  it('picks the least busy producer', () => {
    const busy = { entity: { id: 1 }, queueLength: 2 } as ProducerInfo;
    const idle = { entity: { id: 2 }, queueLength: 0 } as ProducerInfo;
    expect(leastBusyProducer([busy, idle])?.entity.id).toBe(2);
  });
});
