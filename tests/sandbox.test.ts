import { describe, it, expect } from 'vitest';
import { initMatch } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import { buildSandboxMatchConfig, getSandboxProjectionMode } from '../src/sandbox/sandbox-config';
import { createSandboxAiHook } from '../src/sandbox/ai-director';
import { defaultSandboxSettings } from '../src/sim/sandbox-types';
import { applyDevCommand } from '../src/sim/systems/commands/dev';
import type { DevCommand } from '../src/sim/types';
import { loadRegistry } from '../src/data/loader';
import { sandboxDisableWinCheck, sandboxInstantBuild } from '../src/sim/sandbox-flags';
import { applySandboxEconomyCheats, SANDBOX_INFINITE_MANA } from '../src/sim/systems/sandbox-economy';
import { isPowerShort } from '../src/sim/power';
import { stepSimulation } from '../src/sim/step';

describe('sandbox mode', () => {
  const registry = loadRegistry();

  it('initMatch sets sandbox runtime for sandbox config', () => {
    const config = buildSandboxMatchConfig();
    const { state } = initMatch(registry, config);
    expect(state.sandbox?.enabled).toBe(true);
    expect(sandboxDisableWinCheck(state)).toBe(true);
  });

  it('uses oblique 2.5D projection', () => {
    expect(getSandboxProjectionMode()).toBe('oblique');
  });

  it('devSpawnUnit increases entity count', () => {
    const config = buildSandboxMatchConfig();
    const { state, services } = initMatch(registry, config);
    const before = state.entities.size;
    const ctx = { services, events: [] as import('../src/sim/types').GameEvent[] };
    applyDevCommand(state, ctx, {
      type: 'devSpawnUnit',
      playerId: 'player0',
      defId: 'imp_swarmling',
      x: 500,
      y: 500,
      count: 3,
    });
    expect(state.entities.size).toBe(before + 3);
  });

  it('devSetMana updates player mana', () => {
    const config = buildSandboxMatchConfig();
    const { state, services } = initMatch(registry, config);
    const ctx = { services, events: [] as import('../src/sim/types').GameEvent[] };
    applyDevCommand(state, ctx, { type: 'devSetMana', playerId: 'player0', amount: 9999, mode: 'set' });
    expect(state.players[0]!.mana).toBe(9999);
    expect(ctx.events.some((e) => e.type === 'manaChanged')).toBe(true);
  });

  it('dev commands are ignored outside sandbox', () => {
    const config = buildSandboxMatchConfig();
    config.mode = 'standard';
    const { state, services } = initMatch(registry, config);
    expect(state.sandbox).toBeUndefined();
    const before = state.entities.size;
    const ctx = { services, events: [] as import('../src/sim/types').GameEvent[] };
    applyDevCommand(state, ctx, {
      type: 'devSpawnUnit',
      playerId: 'player0',
      defId: 'imp_swarmling',
      x: 500,
      y: 500,
      count: 1,
    });
    expect(state.entities.size).toBe(before);
  });

  it('instantBuild flag is readable', () => {
    const config = buildSandboxMatchConfig();
    const { state } = initMatch(registry, config);
    state.sandbox!.settings.economy.instantBuild = true;
    expect(sandboxInstantBuild(state)).toBe(true);
  });

  it('disableWinCheck prevents match end when HQ destroyed', () => {
    const config = buildSandboxMatchConfig();
    const { state, services } = initMatch(registry, config);
    const sim = createSimulation(state, services, { aiEnabled: false });
    const hq = [...state.entities.values()].find((e) => e.defId === 'sanctum' && e.owner === 'player0')!;
    const cmds: DevCommand[] = [{ type: 'devDestroyEntity', playerId: 'player0', entityIds: [hq.id] }];
    sim.enqueueNow(cmds);
    sim.step();
    expect(state.ended).toBe(false);
  });

  it('force attack sends AI combat units toward the enemy HQ', () => {
    const config = buildSandboxMatchConfig();
    const { state, services } = initMatch(registry, config);
    const settings = defaultSandboxSettings();
    settings.ai.forceMode = 'attack';
    state.sandbox!.settings = settings;
    const ctx = { services, events: [] as import('../src/sim/types').GameEvent[] };
    applyDevCommand(state, ctx, {
      type: 'devSpawnUnit',
      playerId: 'player1',
      defId: 'imp_swarmling',
      x: 500,
      y: 500,
      count: 4,
    });
    const hook = createSandboxAiHook(() => settings.ai, () => settings, () => 'player0');
    const cmds = hook(state, services);
    expect(cmds.some((c) => c.type === 'attackMove' && c.playerId === 'player1')).toBe(true);
  });

  it('force attack still runs when AI is marked disabled', () => {
    const config = buildSandboxMatchConfig();
    const { state, services } = initMatch(registry, config);
    const settings = defaultSandboxSettings();
    settings.ai.forceMode = 'attack';
    settings.ai.disabled = true;
    state.sandbox!.settings = settings;
    const ctx = { services, events: [] as import('../src/sim/types').GameEvent[] };
    applyDevCommand(state, ctx, {
      type: 'devSpawnUnit',
      playerId: 'player1',
      defId: 'imp_swarmling',
      x: 500,
      y: 500,
      count: 2,
    });
    const hook = createSandboxAiHook(() => settings.ai, () => settings, () => 'player0');
    const cmds = hook(state, services);
    expect(cmds.length).toBeGreaterThan(0);
  });

  it('infinite mana tops up player mana each tick', () => {
    const config = buildSandboxMatchConfig();
    const { state, services } = initMatch(registry, config);
    state.sandbox!.settings.economy.infiniteMana = true;
    state.players[0]!.mana = 100;
    stepSimulation(state, services, [], undefined);
    expect(state.players[0]!.mana).toBe(SANDBOX_INFINITE_MANA);
  });

  it('infinite power prevents low-power state', () => {
    const config = buildSandboxMatchConfig();
    const { state, services } = initMatch(registry, config);
    state.sandbox!.settings.economy.infinitePower = true;
    const player = state.players[0]!;
    player.power = 0;
    player.powerUsed = 500;
    applySandboxEconomyCheats(state, { services, events: [] });
    expect(isPowerShort(state, player.id)).toBe(false);
    expect(player.power).toBeGreaterThanOrEqual(player.powerUsed);
  });
});

describe('command palette', () => {
  it('parses spawn command', async () => {
    await import('../src/sandbox/commands/index');
    const { parseCommandLine } = await import('../src/sandbox/command-registry');
    const parsed = parseCommandLine('spawn imp_swarmling 5');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.args.defId).toBe('imp_swarmling');
      expect(parsed.parsed.args.count).toBe(5);
    }
  });
});
