import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity, recomputePower } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { radarActive } from '../src/sim/fog';
import { ownedBy } from '../src/sim/queries';
import { isPowerShort, buildingHasPower, productionRate } from '../src/sim/power';

const reg = getRegistry();

describe('RA2 low power', () => {
  it('shuts down all radar when power is short', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.id === 'player0')!;
    const sanctum = ownedBy(state, human.id).find((e) => e.defId === 'sanctum')!;
    spawnEntity(state, services, null, 'ley_conduit', human.id, sanctum!.pos.x + 96, sanctum!.pos.y);
    spawnEntity(state, services, null, 'scrying_obelisk', human.id, sanctum!.pos.x + 160, sanctum!.pos.y);
    spawnEntity(state, services, null, 'summoning_circle', human.id, sanctum!.pos.x + 224, sanctum!.pos.y);
    spawnEntity(state, services, null, 'summoning_circle', human.id, sanctum!.pos.x + 288, sanctum!.pos.y);
    spawnEntity(state, services, null, 'summoning_circle', human.id, sanctum!.pos.x + 352, sanctum!.pos.y);
    spawnEntity(state, services, null, 'summoning_circle', human.id, sanctum!.pos.x + 416, sanctum!.pos.y);
    recomputePower(state, services);
    expect(isPowerShort(state, human.id)).toBe(true);
    expect(radarActive(state, reg, human.id)).toBe(false);
  });

  it('shuts down defenses but slows production buildings', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.id === 'player0')!;
    const sanctum = ownedBy(state, human.id).find((e) => e.defId === 'sanctum')!;
    const turret = spawnEntity(state, services, null, 'ward_turret', human.id, sanctum!.pos.x + 64, sanctum!.pos.y);
    const circle = spawnEntity(state, services, null, 'summoning_circle', human.id, sanctum!.pos.x + 128, sanctum!.pos.y);
    recomputePower(state, services);
    expect(isPowerShort(state, human.id)).toBe(true);
    expect(buildingHasPower(state, reg, turret)).toBe(false);
    expect(buildingHasPower(state, reg, circle)).toBe(true);
    expect(productionRate(state, reg, circle)).toBeCloseTo(20 / 40, 5);
  });

  it('turrets do not fire while low on power', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const human = state.players.find((p) => p.id === 'player0')!;
    human.mana = 5000;
    const sanctum = ownedBy(state, human.id).find((e) => e.defId === 'sanctum')!;
    sim.enqueueNow([{ type: 'build', playerId: human.id, defId: 'ward_turret', x: sanctum!.pos.x + 64, y: sanctum!.pos.y }]);
    sim.step();
    for (let i = 0; i < 120; i++) sim.step();
    sim.enqueueNow([{ type: 'build', playerId: human.id, defId: 'summoning_circle', x: sanctum!.pos.x + 128, y: sanctum!.pos.y }]);
    sim.step();
    for (let i = 0; i < 120; i++) sim.step();
    sim.enqueueNow([{ type: 'build', playerId: human.id, defId: 'summoning_circle', x: sanctum!.pos.x + 192, y: sanctum!.pos.y }]);
    sim.step();
    for (let i = 0; i < 120; i++) sim.step();
    expect(isPowerShort(state, human.id)).toBe(true);
    const turret = ownedBy(state, human.id).find((e) => e.defId === 'ward_turret')!;
    const enemy = [...state.entities.values()].find((e) => e.owner !== human.id && e.kind === 'unit')!;
    const hpBefore = enemy.hp;
    for (let i = 0; i < 80; i++) sim.step();
    expect(enemy.hp).toBe(hpBefore);
    expect(turret.cooldowns.attack ?? 0).toBe(0);
  });
});
