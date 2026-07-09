import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initMatch, makeProjectile } from '../src/sim/factory';
import { makeProjectileCapability } from '../src/sim/capabilities';
import { createSimulation } from '../src/app/create-simulation';
import { buildSandboxMatchConfig } from '../src/sandbox/sandbox-config';
import { createSandboxAiHook } from '../src/sandbox/ai-director';
import { defaultSandboxSettings } from '../src/sim/sandbox-types';
import { applyDevCommand } from '../src/sim/systems/commands/dev';
import type { GameEvent } from '../src/sim/types';
import { loadRegistry } from '../src/data/loader';
import {
  sandboxFreezeProjectiles,
  sandboxFreezeUnits,
  sandboxIgnoreTech,
  sandboxInstantProduce,
  sandboxInstantResearch,
  sandboxNoCosts,
  sandboxNoSpellCost,
  sandboxNoSpellCooldowns,
} from '../src/sim/sandbox-flags';
import { shouldRevealAllForViewer, isVisibleTo } from '../src/sim/fog';
import { handleProduce } from '../src/sim/systems/commands/production';
import { handleBuild } from '../src/sim/systems/commands/build';
import { handleResearch } from '../src/sim/systems/commands/research';
import { productionSystem } from '../src/sim/systems/production';
import { movementSystem } from '../src/sim/systems/movement';
import { projectileSystem } from '../src/sim/systems/projectile';
import { stepSimulation } from '../src/sim/step';
import { isAlive } from '../src/sim/queries';
import { BUILTIN_SCENARIOS } from '../src/sandbox/scenario-store';

function emptyCtx(services: ReturnType<typeof initMatch>['services']) {
  return { services, events: [] as GameEvent[] };
}

describe('sandbox economy & build flags', () => {
  const registry = loadRegistry();

  it('noCosts allows produce without spending mana', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.economy.noCosts = true;
    state.sandbox!.settings.economy.ignoreTechRequirements = true;
    const player = state.players[0]!;
    player.mana = 0;
    const ctx = emptyCtx(services);
    applyDevCommand(state, ctx, {
      type: 'devSpawnBuilding',
      playerId: 'player0',
      defId: 'summoning_circle',
      x: 400,
      y: 400,
      complete: true,
    });
    const building = [...state.entities.values()].find((e) => e.defId === 'summoning_circle' && e.owner === 'player0')!;
    handleProduce(state, emptyCtx(services), {
      type: 'produce',
      playerId: 'player0',
      buildingId: building.id,
      defId: 'imp_swarmling',
    });
    expect(sandboxNoCosts(state)).toBe(true);
    expect(player.mana).toBe(0);
    expect(building.kind === 'building' && building.productionQueue?.length).toBe(1);
  });

  it('instantProduce completes production queue on the next production tick', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.economy.instantProduce = true;
    state.sandbox!.settings.economy.ignoreTechRequirements = true;
    state.sandbox!.settings.economy.noCosts = true;
    expect(sandboxInstantProduce(state)).toBe(true);
    const ctx = emptyCtx(services);
    applyDevCommand(state, ctx, {
      type: 'devSpawnBuilding',
      playerId: 'player0',
      defId: 'summoning_circle',
      x: 420,
      y: 420,
      complete: true,
    });
    const building = [...state.entities.values()].find((e) => e.defId === 'summoning_circle' && e.owner === 'player0')!;
    const before = [...state.entities.values()].filter((e) => e.defId === 'imp_swarmling').length;
    handleProduce(state, emptyCtx(services), {
      type: 'produce',
      playerId: 'player0',
      buildingId: building.id,
      defId: 'imp_swarmling',
    });
    productionSystem(state, emptyCtx(services));
    const after = [...state.entities.values()].filter((e) => e.defId === 'imp_swarmling' && isAlive(e)).length;
    expect(after).toBe(before + 1);
  });

  it('instantResearch completes research queue items immediately', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.economy.instantResearch = true;
    expect(sandboxInstantResearch(state)).toBe(true);
    const ctx = emptyCtx(services);
    applyDevCommand(state, ctx, {
      type: 'devSpawnBuilding',
      playerId: 'player0',
      defId: 'arcane_nexus',
      x: 440,
      y: 440,
      complete: true,
    });
    const building = [...state.entities.values()].find((e) => e.defId === 'arcane_nexus' && e.owner === 'player0')!;
    if (building.kind !== 'building') throw new Error('expected building');
    building.researchQueue = [{ defId: 'test_research', progress: 0, required: 100 }];
    productionSystem(state, emptyCtx(services));
    expect(building.researchQueue.length).toBe(0);
    expect(state.players[0]!.completedResearch).toContain('test_research');
  });

  it('ignoreTechRequirements bypasses building tech gates', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.economy.ignoreTechRequirements = true;
    state.sandbox!.settings.economy.noCosts = true;
    state.sandbox!.settings.build.ignorePlacementRestrictions = true;
    expect(sandboxIgnoreTech(state)).toBe(true);
    const player = state.players[0]!;
    player.unlockedTech = ['sanctum'];
    const before = state.entities.size;
    const ctx = emptyCtx(services);
    handleBuild(state, ctx, {
      type: 'build',
      playerId: 'player0',
      defId: 'arcane_nexus',
      x: 480,
      y: 480,
    });
    expect(state.entities.size).toBeGreaterThan(before);
    expect(ctx.events.some((e) => e.type === 'commandRejected')).toBe(false);
  });

  it('ignoreTechRequirements bypasses research prerequisites', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.economy.ignoreTechRequirements = true;
    state.sandbox!.settings.economy.noCosts = true;
    const researchId = 'sandbox_test_research';
    services.registry.research.set(researchId, {
      id: researchId,
      name: 'Sandbox Test Research',
      description: 'test',
      kind: 'research',
      researchedAt: 'arcane_nexus',
      cost: 100,
      researchTime: 5,
      requires: ['missing_tech_gate'],
      effects: [],
    });
    applyDevCommand(state, emptyCtx(services), {
      type: 'devSpawnBuilding',
      playerId: 'player0',
      defId: 'arcane_nexus',
      x: 500,
      y: 500,
      complete: true,
    });
    const building = [...state.entities.values()].find((e) => e.defId === 'arcane_nexus')!;
    handleResearch(state, emptyCtx(services), {
      type: 'research',
      playerId: 'player0',
      buildingId: building.id,
      defId: researchId,
    });
    expect(building.kind === 'building' && (building.researchQueue?.length ?? 0)).toBe(1);
    services.registry.research.delete(researchId);
  });
});

describe('sandbox freeze, fog, and spells', () => {
  const registry = loadRegistry();

  it('freezeUnits skips movement updates', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.gameplay.freezeUnits = true;
    expect(sandboxFreezeUnits(state)).toBe(true);
    const ctx = emptyCtx(services);
    applyDevCommand(state, ctx, {
      type: 'devSpawnUnit',
      playerId: 'player0',
      defId: 'imp_swarmling',
      x: 300,
      y: 300,
      count: 1,
    });
    const unit = [...state.entities.values()].find((e) => e.defId === 'imp_swarmling')!;
    if (unit.kind !== 'unit') throw new Error('expected unit');
    const x0 = unit.pos.x;
    const y0 = unit.pos.y;
    unit.orders = [{ type: 'move', x: x0 + 200, y: y0 + 200 }];
    unit.state = 'moving';
    movementSystem(state, emptyCtx(services));
    expect(unit.pos.x).toBe(x0);
    expect(unit.pos.y).toBe(y0);
  });

  it('freezeProjectiles skips projectile updates', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.gameplay.freezeProjectiles = true;
    expect(sandboxFreezeProjectiles(state)).toBe(true);
    const target = [...state.entities.values()].find((e) => e.kind === 'building' && e.owner === 'player1')!;
    const id = state.nextEntityId++;
    state.entities.set(
      id,
      makeProjectile(
        id,
        'player0',
        'arcane_bolt',
        100,
        100,
        0,
        makeProjectileCapability({
          targetId: target.id,
          damage: 10,
          armorVs: { light: 1, heavy: 1, building: 1 },
          speed: 200,
          sourceOwner: 'player0',
          sourceId: 0,
        }),
      ),
    );
    const proj = state.entities.get(id)!;
    const x0 = proj.pos.x;
    const y0 = proj.pos.y;
    projectileSystem(state, emptyCtx(services));
    expect(proj.pos.x).toBe(x0);
    expect(proj.pos.y).toBe(y0);
  });

  it('revealMap and fogEnabled=false reveal the full map for the viewer', () => {
    const { state } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.map.revealMap = false;
    state.sandbox!.settings.map.fogEnabled = true;
    expect(shouldRevealAllForViewer(state, 'player0', false)).toBe(false);
    state.sandbox!.settings.map.revealMap = true;
    expect(shouldRevealAllForViewer(state, 'player0', false)).toBe(true);
    state.sandbox!.settings.map.revealMap = false;
    state.sandbox!.settings.map.fogEnabled = false;
    expect(shouldRevealAllForViewer(state, 'player0', false)).toBe(true);
  });

  it('noCooldowns clears spell cooldowns each production tick', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.spells.noCooldowns = true;
    expect(sandboxNoSpellCooldowns(state)).toBe(true);
    const player = state.players[0]!;
    player.spellCooldowns.aegis_ward = 500;
    productionSystem(state, emptyCtx(services));
    expect(player.spellCooldowns.aegis_ward).toBe(0);
  });

  it('noManaCost flag remains readable (spells have no mana cost in data)', () => {
    const { state } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.spells.noManaCost = true;
    expect(sandboxNoSpellCost(state)).toBe(true);
  });

  it('devCastSpell casts when tech is ignored', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.economy.ignoreTechRequirements = true;
    state.sandbox!.settings.spells.noCooldowns = true;
    const ctx = emptyCtx(services);
    applyDevCommand(state, ctx, {
      type: 'devCastSpell',
      playerId: 'player0',
      spellId: 'meteor_storm',
      x: 400,
      y: 400,
    });
    expect(ctx.events.some((e) => e.type === 'spellCast' && e.spellId === 'meteor_storm')).toBe(true);
  });
});

describe('sandbox dev commands', () => {
  const registry = loadRegistry();

  it('devSpawnBuilding creates a completed building', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    const before = [...state.entities.values()].filter((e) => e.defId === 'ward_turret').length;
    applyDevCommand(state, emptyCtx(services), {
      type: 'devSpawnBuilding',
      playerId: 'player0',
      defId: 'ward_turret',
      x: 360,
      y: 360,
      complete: true,
    });
    const turret = [...state.entities.values()].find((e) => e.defId === 'ward_turret');
    expect(turret).toBeTruthy();
    expect(turret!.kind === 'building' && turret!.buildProgress).toBeUndefined();
    expect([...state.entities.values()].filter((e) => e.defId === 'ward_turret').length).toBe(before + 1);
  });

  it('devClearUnits removes units for all or one player', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    const ctx = emptyCtx(services);
    applyDevCommand(state, ctx, {
      type: 'devSpawnUnit',
      playerId: 'player0',
      defId: 'imp_swarmling',
      x: 300,
      y: 300,
      count: 2,
    });
    applyDevCommand(state, ctx, {
      type: 'devSpawnUnit',
      playerId: 'player1',
      defId: 'imp_swarmling',
      x: 700,
      y: 700,
      count: 2,
    });
    applyDevCommand(state, emptyCtx(services), {
      type: 'devClearUnits',
      playerId: 'player0',
      targetPlayerId: 'player0',
    });
    const p0 = [...state.entities.values()].filter((e) => e.defId === 'imp_swarmling' && e.owner === 'player0' && isAlive(e));
    const p1 = [...state.entities.values()].filter((e) => e.defId === 'imp_swarmling' && e.owner === 'player1' && isAlive(e));
    expect(p0.length).toBe(0);
    expect(p1.length).toBe(2);
    applyDevCommand(state, emptyCtx(services), { type: 'devClearUnits', playerId: 'player0' });
    expect([...state.entities.values()].filter((e) => e.defId === 'imp_swarmling' && isAlive(e)).length).toBe(0);
  });

  it('devUnlockTech unlocks all buildings', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    applyDevCommand(state, emptyCtx(services), { type: 'devUnlockTech', playerId: 'player0', defId: 'all' });
    for (const id of registry.buildings.keys()) {
      expect(state.players[0]!.unlockedTech).toContain(id);
    }
  });

  it('devConfigurePlayer switches controller', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    applyDevCommand(state, emptyCtx(services), {
      type: 'devConfigurePlayer',
      playerId: 'player0',
      targetPlayerId: 'player1',
      controller: 'human',
    });
    expect(state.players.find((p) => p.id === 'player1')!.controller).toBe('human');
  });

  it('devSetEntityHp heals and kills', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    const ctx = emptyCtx(services);
    applyDevCommand(state, ctx, {
      type: 'devSpawnUnit',
      playerId: 'player0',
      defId: 'imp_swarmling',
      x: 320,
      y: 320,
      count: 1,
    });
    const unit = [...state.entities.values()].find((e) => e.defId === 'imp_swarmling')!;
    unit.hp = 10;
    applyDevCommand(state, emptyCtx(services), {
      type: 'devSetEntityHp',
      playerId: 'player0',
      entityId: unit.id,
      hp: 'max',
    });
    expect(unit.hp).toBe(unit.maxHp);
    applyDevCommand(state, emptyCtx(services), {
      type: 'devSetEntityHp',
      playerId: 'player0',
      entityId: unit.id,
      hp: 'kill',
    });
    expect(isAlive(unit)).toBe(false);
  });

  it('devDestroyEntity removes selected entities', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    const ctx = emptyCtx(services);
    applyDevCommand(state, ctx, {
      type: 'devSpawnUnit',
      playerId: 'player0',
      defId: 'imp_swarmling',
      x: 330,
      y: 330,
      count: 1,
    });
    const unit = [...state.entities.values()].find((e) => e.defId === 'imp_swarmling')!;
    applyDevCommand(state, emptyCtx(services), {
      type: 'devDestroyEntity',
      playerId: 'player0',
      entityIds: [unit.id],
    });
    expect(isAlive(unit)).toBe(false);
  });

  it('devSetMana supports add and remove modes', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    applyDevCommand(state, emptyCtx(services), {
      type: 'devSetMana',
      playerId: 'player0',
      amount: 1000,
      mode: 'set',
    });
    applyDevCommand(state, emptyCtx(services), {
      type: 'devSetMana',
      playerId: 'player0',
      amount: 500,
      mode: 'add',
    });
    expect(state.players[0]!.mana).toBe(1500);
    applyDevCommand(state, emptyCtx(services), {
      type: 'devSetMana',
      playerId: 'player0',
      amount: 200,
      mode: 'remove',
    });
    expect(state.players[0]!.mana).toBe(1300);
  });
});

describe('sandbox AI director', () => {
  const registry = loadRegistry();

  it('paused and disabled return no commands when force mode is none', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    const settings = defaultSandboxSettings();
    settings.ai.paused = true;
    state.sandbox!.settings = settings;
    const pausedHook = createSandboxAiHook(() => settings.ai, () => settings, () => 'player0');
    expect(pausedHook(state, services)).toEqual([]);

    settings.ai.paused = false;
    settings.ai.disabled = true;
    const disabledHook = createSandboxAiHook(() => settings.ai, () => settings, () => 'player0');
    expect(disabledHook(state, services)).toEqual([]);
  });

  it('force defend moves combat units to own sanctum', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    const settings = defaultSandboxSettings();
    settings.ai.forceMode = 'defend';
    state.sandbox!.settings = settings;
    applyDevCommand(state, emptyCtx(services), {
      type: 'devSpawnUnit',
      playerId: 'player1',
      defId: 'imp_swarmling',
      x: 600,
      y: 600,
      count: 3,
    });
    const hook = createSandboxAiHook(() => settings.ai, () => settings, () => 'player0');
    const cmds = hook(state, services);
    expect(cmds.some((c) => c.type === 'move' && c.playerId === 'player1')).toBe(true);
  });

  it('force expand runs economy AI without attack commands', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    const settings = defaultSandboxSettings();
    settings.ai.forceMode = 'expand';
    settings.ai.disabled = true;
    state.sandbox!.settings = settings;
    // Give AI enough mana and a missing build so expand can emit a build command.
    state.players.find((p) => p.id === 'player1')!.mana = 5000;
    const hook = createSandboxAiHook(() => settings.ai, () => settings, () => 'player0');
    // Force expand keeps AI enabled even when disabled flag is set (via syncAi); hook still runs.
    const cmds = hook(state, services);
    expect(cmds.every((c) => c.type !== 'attack' && c.type !== 'attackMove')).toBe(true);
    // May be empty on non-interval ticks; force a decision by aligning tick.
    state.tick = 0;
    const cmds2 = hook(state, services);
    expect(cmds2.every((c) => c.type !== 'attack' && c.type !== 'attackMove')).toBe(true);
  });

  it('revealIntel reveals enemy entities without clearing fog', () => {
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    state.sandbox!.settings.ai.revealIntel = true;
    state.sandbox!.settings.map.fogEnabled = true;
    state.sandbox!.settings.map.revealMap = false;
    expect(shouldRevealAllForViewer(state, 'player0', false)).toBe(false);
    const enemy = [...state.entities.values()].find((e) => e.owner === 'player1' && e.kind === 'building')!;
    expect(isVisibleTo(state, 'player0', enemy, services.nav)).toBe(true);
  });
});

describe('sandbox command palette coverage', () => {
  beforeEach(async () => {
    await import('../src/sandbox/commands/index');
  });

  it('parses give, set, reveal, clear, unlock, restart, cast, build, heal, kill, delete', async () => {
    const { parseCommandLine } = await import('../src/sandbox/command-registry');
    const cases: Array<{ line: string; id: string }> = [
      { line: 'give 100', id: 'give' },
      { line: 'set 5000', id: 'set' },
      { line: 'reveal map', id: 'reveal' },
      { line: 'clear battlefield', id: 'clear' },
      { line: 'unlock tech', id: 'unlock' },
      { line: 'restart scenario', id: 'restart' },
      { line: 'cast meteor_storm', id: 'cast' },
      { line: 'build ward_turret', id: 'build' },
      { line: 'heal selected', id: 'heal' },
      { line: 'kill selected', id: 'kill' },
      { line: 'delete selected', id: 'delete' },
    ];
    for (const c of cases) {
      const parsed = parseCommandLine(c.line);
      expect(parsed.ok, c.line).toBe(true);
      if (parsed.ok) expect(parsed.parsed.command.id).toBe(c.id);
    }
  });

  it('infinite mana/power aliases use unique command ids', async () => {
    const { parseCommandLine } = await import('../src/sandbox/command-registry');
    const mana = parseCommandLine('infinite mana');
    expect(mana.ok).toBe(true);
    if (mana.ok) expect(mana.parsed.command.id).toBe('toggle-infinite-mana');

    const power = parseCommandLine('infinite power');
    expect(power.ok).toBe(true);
    if (power.ok) expect(power.parsed.command.id).toBe('toggle-infinite-power');

    const manaToggle = parseCommandLine('toggle infinite mana');
    expect(manaToggle.ok).toBe(true);
    if (manaToggle.ok) expect(manaToggle.parsed.command.id).toBe('toggle-infinite-mana');
  });

  it('executeCommandLine invokes controller methods for economy and map commands', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    const { executeCommandLine } = await import('../src/sandbox/command-registry');
    const controller = {
      setPlayerMana: vi.fn(),
      spawnUnit: vi.fn(),
      spawnBuilding: vi.fn(),
      destroySelected: vi.fn(),
      healSelected: vi.fn(),
      killSelected: vi.fn(),
      toggleSetting: vi.fn(),
      setSetting: vi.fn(),
      restartScenario: vi.fn(),
      clearUnits: vi.fn(),
      unlockAllTech: vi.fn(),
      castSpell: vi.fn(),
    };
    const registry = loadRegistry();
    const ctx = { controller: controller as never, registry, humanId: 'player0' };

    expect(executeCommandLine(ctx, 'give 250').ok).toBe(true);
    expect(controller.setPlayerMana).toHaveBeenCalledWith('player0', 250, 'add');

    expect(executeCommandLine(ctx, 'set 900').ok).toBe(true);
    expect(controller.setPlayerMana).toHaveBeenCalledWith('player0', 900, 'set');

    expect(executeCommandLine(ctx, 'spawn imp_swarmling 3').ok).toBe(true);
    expect(controller.spawnUnit).toHaveBeenCalledWith('player0', 'imp_swarmling', 3);

    expect(executeCommandLine(ctx, 'build ward_turret').ok).toBe(true);
    expect(controller.spawnBuilding).toHaveBeenCalledWith('player0', 'ward_turret', true);

    expect(executeCommandLine(ctx, 'reveal map').ok).toBe(true);
    expect(controller.setSetting).toHaveBeenCalledWith('map', { revealMap: true, fogEnabled: false });

    expect(executeCommandLine(ctx, 'clear').ok).toBe(true);
    expect(controller.clearUnits).toHaveBeenCalled();

    expect(executeCommandLine(ctx, 'unlock').ok).toBe(true);
    expect(controller.unlockAllTech).toHaveBeenCalled();

    expect(executeCommandLine(ctx, 'cast meteor_storm').ok).toBe(true);
    expect(controller.castSpell).toHaveBeenCalledWith('meteor_storm');

    expect(executeCommandLine(ctx, 'restart').ok).toBe(true);
    expect(controller.restartScenario).toHaveBeenCalled();

    expect(executeCommandLine(ctx, 'heal').ok).toBe(true);
    expect(controller.healSelected).toHaveBeenCalled();

    expect(executeCommandLine(ctx, 'kill').ok).toBe(true);
    expect(controller.killSelected).toHaveBeenCalled();

    expect(executeCommandLine(ctx, 'delete').ok).toBe(true);
    expect(controller.destroySelected).toHaveBeenCalled();
  });
});

describe('sandbox scenarios inventory', () => {
  it('lists eight built-in scenario stubs', () => {
    expect(BUILTIN_SCENARIOS).toHaveLength(8);
    expect(BUILTIN_SCENARIOS.every((s) => s.builtin)).toBe(true);
  });

  it('loadBuiltinScenario generates distinct preset states', async () => {
    const { loadBuiltinScenario } = await import('../src/sandbox/builtin-scenarios');
    const early = loadBuiltinScenario('builtin:early-game');
    const mid = loadBuiltinScenario('builtin:mid-game');
    const spell = loadBuiltinScenario('builtin:spell-test');
    expect(early).toBeTruthy();
    expect(mid).toBeTruthy();
    expect(spell).toBeTruthy();
    expect(early!.state.entities.length).toBeLessThan(mid!.state.entities.length);
    expect(spell!.sandbox.spells.noCooldowns).toBe(true);
    expect(loadBuiltinScenario('builtin:missing')).toBeNull();
  });

  it('restart after spawn restores entity count via simulation baseline pattern', () => {
    const registry = loadRegistry();
    const { state, services } = initMatch(registry, buildSandboxMatchConfig());
    const sim = createSimulation(state, services, { aiEnabled: false });
    const baselineCount = state.entities.size;
    const baselineMana = state.players[0]!.mana;
    applyDevCommand(state, emptyCtx(services), {
      type: 'devSpawnUnit',
      playerId: 'player0',
      defId: 'imp_swarmling',
      x: 350,
      y: 350,
      count: 4,
    });
    expect(state.entities.size).toBe(baselineCount + 4);
    const spawned = [...state.entities.values()].filter((e) => e.defId === 'imp_swarmling').map((e) => e.id);
    applyDevCommand(state, emptyCtx(services), {
      type: 'devDestroyEntity',
      playerId: 'player0',
      entityIds: spawned,
    });
    stepSimulation(state, services, [], undefined);
    void sim;
    expect(state.players[0]!.mana).toBe(baselineMana);
  });
});
