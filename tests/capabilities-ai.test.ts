import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { hashState } from '../src/sim/hash';
import { makeProjectileCapability, getProjectileCapability, hashProjectileCapability } from '../src/sim/capabilities';
import { makeProjectile } from '../src/sim/factory';
import { runHeadless } from '../src/testing/headless';
import { strategyForPlayer } from '../src/ai/strategies/registry';
import { listAiStrategies } from '../src/ai/strategies/registry';

const reg = getRegistry();

describe('projectile capabilities', () => {
  it('slim projectile entity stores payload in caps.projectile', () => {
    const cap = makeProjectileCapability({
      targetId: 5,
      damage: 20,
      armorVs: { light: 1, heavy: 0.8, building: 0.5 },
      speed: 400,
      sourceOwner: 'player0',
      sourceId: 2,
    });
    const proj = makeProjectile(99, 'player0', 'arcane_bolt', 100, 200, 0, cap);
    expect(proj.kind).toBe('projectile');
    expect('orders' in proj).toBe(false);
    expect(getProjectileCapability(proj)?.targetId).toBe(5);
    expect(hashProjectileCapability(cap)).toContain('PC5:');
  });

  it('projectile combat remains deterministic', () => {
    const a = runHeadless(reg, reg.match('skirmish_1v1'), 400);
    const b = runHeadless(reg, reg.match('skirmish_1v1'), 400);
    expect(hashState(a)).toBe(hashState(b));
  });
});

describe('AI strategies', () => {
  it('loads arcane_standard strategy', () => {
    expect(listAiStrategies()).toContain('arcane_standard');
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    const aiPlayer = state.players.find((p) => p.controller === 'ai')!;
    const strategy = strategyForPlayer(aiPlayer);
    expect(strategy.config.id).toBe('arcane_standard');
    expect(strategy.config.buildOrder[0]).toBe('attunement_spire');
  });

  it('strategy-driven AI match is deterministic', () => {
    const cfg = reg.match('skirmish_1v1');
    const a = runHeadless(reg, cfg, 600);
    const b = runHeadless(reg, cfg, 600);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('AI emits harvest commands for idle wisps', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    const ai = state.players.find((p) => p.controller === 'ai')!;
    for (let i = 0; i < 40; i++) sim.step();
    const wisps = [...state.entities.values()].filter((e) => e.kind === 'unit' && e.owner === ai.id && e.defId === 'wisp');
    expect(wisps.length).toBeGreaterThan(0);
  });
});
