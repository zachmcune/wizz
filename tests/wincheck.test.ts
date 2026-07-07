import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { ownedBy, hasSanctum } from '../src/sim/queries';

const reg = getRegistry();

describe('win conditions', () => {
  it('destroying the enemy HQ ends the match even if they had other buildings', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;

    sim.enqueueNow([{ type: 'build', playerId: 'player1', defId: 'attunement_spire', x: 1648, y: 1168 }]);
    sim.step();
    for (let i = 0; i < reg.building('attunement_spire').buildTime * 20 + 5; i++) sim.step();
    expect(hasSanctum(state, 'player1')).toBe(true);
    expect(ownedBy(state, 'player1').filter((e) => e.kind === 'building').length).toBeGreaterThan(1);

    const hq = ownedBy(state, 'player1').find((e) => e.defId === 'sanctum')!;
    const beh = spawnEntity(state, services, null, 'siege_behemoth', 'player0', hq.pos.x - 120, hq.pos.y);
    sim.enqueueNow([{ type: 'attack', playerId: 'player0', entityIds: [beh.id], targetId: hq.id }]);

    for (let i = 0; i < 2000 && !state.ended; i++) sim.step();

    expect(state.ended).toBe(true);
    expect(state.winnerTeam).toBe(0);
    expect(state.players.find((p) => p.id === 'player1')!.defeated).toBe(true);
    expect(hasSanctum(state, 'player1')).toBe(false);
    expect(ownedBy(state, 'player1').filter((e) => e.kind === 'building').length).toBe(0);
  });
});
