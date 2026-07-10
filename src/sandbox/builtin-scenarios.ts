import { TILE } from '../core/constants';
import { loadRegistry } from '../data/loader';
import type { Registry } from '../data/registry';
import { initMatch } from '../sim/factory';
import { applyDevCommand } from '../sim/systems/commands/dev';
import type { DevCommand, GameEvent, MatchConfig, PlayerId } from '../sim/types';
import { defaultSandboxSettings, type SandboxSettings } from '../sim/sandbox-types';
import { buildSandboxMatchConfig } from './sandbox-config';
import { serializeScenario, type SavedScenario } from './scenario-store';

type Ctx = { services: ReturnType<typeof initMatch>['services']; events: GameEvent[] };

function apply(state: ReturnType<typeof initMatch>['state'], ctx: Ctx, cmd: DevCommand): void {
  applyDevCommand(state, ctx, cmd);
}

function startOf(registry: Registry, matchConfig: MatchConfig, playerId: PlayerId): { x: number; y: number } {
  const map = registry.map(matchConfig.mapId);
  const cfg = matchConfig.players.find((p) => p.id === playerId)!;
  return map.startLocations[cfg.startIndex] ?? map.startLocations[0]!;
}

function spawnNear(
  state: ReturnType<typeof initMatch>['state'],
  ctx: Ctx,
  playerId: PlayerId,
  defId: string,
  origin: { x: number; y: number },
  count: number,
  ox = 0,
  oy = 0,
): void {
  apply(state, ctx, {
    type: 'devSpawnUnit',
    playerId,
    defId,
    x: origin.x + ox,
    y: origin.y + oy,
    count,
  });
}

function spawnBuildingNear(
  state: ReturnType<typeof initMatch>['state'],
  ctx: Ctx,
  playerId: PlayerId,
  defId: string,
  origin: { x: number; y: number },
  ox: number,
  oy: number,
): void {
  apply(state, ctx, {
    type: 'devSpawnBuilding',
    playerId,
    defId,
    x: origin.x + ox,
    y: origin.y + oy,
    complete: true,
  });
}

function unlockAll(state: ReturnType<typeof initMatch>['state'], ctx: Ctx, playerId: PlayerId): void {
  apply(state, ctx, { type: 'devUnlockTech', playerId, defId: 'all' });
}

function setMana(state: ReturnType<typeof initMatch>['state'], ctx: Ctx, playerId: PlayerId, amount: number): void {
  apply(state, ctx, { type: 'devSetMana', playerId, amount, mode: 'set' });
}

function withSettings(patch?: Partial<SandboxSettings>): SandboxSettings {
  return defaultSandboxSettings(patch);
}

function finish(
  name: string,
  id: string,
  state: ReturnType<typeof initMatch>['state'],
  matchConfig: MatchConfig,
  tags: string[],
  sandbox: SandboxSettings,
): SavedScenario {
  state.sandbox = { enabled: true, settings: structuredClone(sandbox) };
  const scenario = serializeScenario(name, state, matchConfig, {
    projectionMode: 'oblique',
    paused: false,
    localPlayerId: 'player0',
    isOnline: false,
  }, tags);
  scenario.id = id;
  scenario.createdAt = 0;
  return scenario;
}

function earlyGame(registry: Registry, matchConfig: MatchConfig): SavedScenario {
  const { state, services } = initMatch(registry, matchConfig);
  const ctx: Ctx = { services, events: [] };
  const p0 = startOf(registry, matchConfig, 'player0');
  spawnBuildingNear(state, ctx, 'player0', 'attunement_spire', p0, TILE * 4, 0);
  spawnBuildingNear(state, ctx, 'player0', 'ley_conduit', p0, 0, TILE * 4);
  setMana(state, ctx, 'player0', 1200);
  return finish('Early Game', 'builtin:early-game', state, matchConfig, ['builtin', 'economy'], withSettings());
}

function midGame(registry: Registry, matchConfig: MatchConfig): SavedScenario {
  const { state, services } = initMatch(registry, matchConfig);
  const ctx: Ctx = { services, events: [] };
  const p0 = startOf(registry, matchConfig, 'player0');
  const p1 = startOf(registry, matchConfig, 'player1');
  for (const [pid, origin] of [
    ['player0', p0],
    ['player1', p1],
  ] as const) {
    unlockAll(state, ctx, pid);
    spawnBuildingNear(state, ctx, pid, 'attunement_spire', origin, TILE * 4, 0);
    spawnBuildingNear(state, ctx, pid, 'ley_conduit', origin, 0, TILE * 4);
    spawnBuildingNear(state, ctx, pid, 'summoning_circle', origin, TILE * 6, TILE * 2);
    spawnBuildingNear(state, ctx, pid, 'golem_forge', origin, TILE * 2, TILE * 6);
    spawnNear(state, ctx, pid, 'imp_swarmling', origin, 8, TILE * 3, TILE * 3);
    spawnNear(state, ctx, pid, 'arcane_archer', origin, 4, TILE * 5, TILE * 3);
    setMana(state, ctx, pid, 2500);
  }
  return finish('Mid Game', 'builtin:mid-game', state, matchConfig, ['builtin'], withSettings());
}

function lateGame(registry: Registry, matchConfig: MatchConfig): SavedScenario {
  const { state, services } = initMatch(registry, matchConfig);
  const ctx: Ctx = { services, events: [] };
  const p0 = startOf(registry, matchConfig, 'player0');
  const p1 = startOf(registry, matchConfig, 'player1');
  for (const [pid, origin] of [
    ['player0', p0],
    ['player1', p1],
  ] as const) {
    unlockAll(state, ctx, pid);
    spawnBuildingNear(state, ctx, pid, 'attunement_spire', origin, TILE * 4, 0);
    spawnBuildingNear(state, ctx, pid, 'ley_conduit', origin, 0, TILE * 4);
    spawnBuildingNear(state, ctx, pid, 'summoning_circle', origin, TILE * 6, TILE * 2);
    spawnBuildingNear(state, ctx, pid, 'golem_forge', origin, TILE * 2, TILE * 6);
    spawnBuildingNear(state, ctx, pid, 'arcane_nexus', origin, TILE * 8, TILE * 4);
    spawnBuildingNear(state, ctx, pid, 'astral_spire', origin, TILE * 4, TILE * 8);
    spawnNear(state, ctx, pid, 'imp_swarmling', origin, 10, TILE * 3, TILE * 3);
    spawnNear(state, ctx, pid, 'arcane_archer', origin, 6, TILE * 5, TILE * 3);
    spawnNear(state, ctx, pid, 'stone_golem', origin, 3, TILE * 4, TILE * 5);
    spawnNear(state, ctx, pid, 'storm_caster', origin, 2, TILE * 6, TILE * 5);
    setMana(state, ctx, pid, 5000);
  }
  return finish('Late Game', 'builtin:late-game', state, matchConfig, ['builtin'], withSettings());
}

function towerTest(registry: Registry, matchConfig: MatchConfig): SavedScenario {
  const { state, services } = initMatch(registry, matchConfig);
  const ctx: Ctx = { services, events: [] };
  const p0 = startOf(registry, matchConfig, 'player0');
  const mid = { x: (p0.x + startOf(registry, matchConfig, 'player1').x) / 2, y: p0.y + TILE * 8 };
  unlockAll(state, ctx, 'player0');
  spawnBuildingNear(state, ctx, 'player0', 'arcane_sentry', mid, -TILE * 3, 0);
  spawnBuildingNear(state, ctx, 'player0', 'frost_spire', mid, 0, 0);
  spawnBuildingNear(state, ctx, 'player0', 'inferno_beacon', mid, TILE * 3, 0);
  spawnNear(state, ctx, 'player1', 'imp_swarmling', mid, 12, 0, TILE * 10);
  spawnNear(state, ctx, 'player1', 'siege_behemoth', mid, 2, TILE * 2, TILE * 12);
  setMana(state, ctx, 'player0', 3000);
  return finish('Tower Test', 'builtin:tower-test', state, matchConfig, ['builtin', 'combat'], withSettings());
}

function aiRush(registry: Registry, matchConfig: MatchConfig): SavedScenario {
  const { state, services } = initMatch(registry, matchConfig);
  const ctx: Ctx = { services, events: [] };
  const p0 = startOf(registry, matchConfig, 'player0');
  const p1 = startOf(registry, matchConfig, 'player1');
  apply(state, ctx, {
    type: 'devConfigurePlayer',
    playerId: 'player0',
    targetPlayerId: 'player1',
    controller: 'ai',
    aiDifficulty: 'hard',
  });
  unlockAll(state, ctx, 'player1');
  spawnNear(state, ctx, 'player0', 'imp_swarmling', p0, 6, TILE * 3, TILE * 3);
  spawnNear(state, ctx, 'player0', 'arcane_archer', p0, 4, TILE * 5, TILE * 3);
  spawnNear(state, ctx, 'player1', 'imp_swarmling', p1, 15, -TILE * 3, TILE * 3);
  spawnNear(state, ctx, 'player1', 'arcane_archer', p1, 6, -TILE * 5, TILE * 3);
  setMana(state, ctx, 'player0', 2000);
  setMana(state, ctx, 'player1', 4000);
  return finish(
    'AI Rush',
    'builtin:ai-rush',
    state,
    matchConfig,
    ['builtin', 'ai'],
    withSettings({ ai: { ...defaultSandboxSettings().ai, forceMode: 'attack' } }),
  );
}

function spellTest(registry: Registry, matchConfig: MatchConfig): SavedScenario {
  const { state, services } = initMatch(registry, matchConfig);
  const ctx: Ctx = { services, events: [] };
  const p0 = startOf(registry, matchConfig, 'player0');
  unlockAll(state, ctx, 'player0');
  spawnBuildingNear(state, ctx, 'player0', 'astral_spire', p0, TILE * 5, TILE * 2);
  spawnNear(state, ctx, 'player0', 'imp_swarmling', p0, 4, TILE * 3, TILE * 3);
  setMana(state, ctx, 'player0', 9999);
  return finish(
    'Spell Test',
    'builtin:spell-test',
    state,
    matchConfig,
    ['builtin', 'spells'],
    withSettings({
      spells: { ...defaultSandboxSettings().spells, noCooldowns: true },
      economy: { ...defaultSandboxSettings().economy, infiniteMana: true },
    }),
  );
}

function performanceTest(registry: Registry, matchConfig: MatchConfig): SavedScenario {
  const { state, services } = initMatch(registry, matchConfig);
  const ctx: Ctx = { services, events: [] };
  const p0 = startOf(registry, matchConfig, 'player0');
  const p1 = startOf(registry, matchConfig, 'player1');
  spawnNear(state, ctx, 'player0', 'imp_swarmling', p0, 50, TILE * 4, TILE * 4);
  spawnNear(state, ctx, 'player0', 'stone_golem', p0, 10, TILE * 6, TILE * 6);
  spawnNear(state, ctx, 'player1', 'imp_swarmling', p1, 50, -TILE * 4, TILE * 4);
  spawnNear(state, ctx, 'player1', 'stone_golem', p1, 10, -TILE * 6, TILE * 6);
  return finish(
    'Performance Test',
    'builtin:performance-test',
    state,
    matchConfig,
    ['builtin', 'perf'],
    withSettings({
      overlays: { ...defaultSandboxSettings().overlays, fps: true, frameTime: true },
      gameplay: { ...defaultSandboxSettings().gameplay, freezeAi: true },
      ai: { ...defaultSandboxSettings().ai, disabled: true },
    }),
  );
}

function economyTest(registry: Registry, matchConfig: MatchConfig): SavedScenario {
  const { state, services } = initMatch(registry, matchConfig);
  const ctx: Ctx = { services, events: [] };
  for (const pid of ['player0', 'player1'] as const) {
    const origin = startOf(registry, matchConfig, pid);
    spawnBuildingNear(state, ctx, pid, 'attunement_spire', origin, TILE * 4, 0);
    spawnBuildingNear(state, ctx, pid, 'ley_conduit', origin, 0, TILE * 4);
    spawnBuildingNear(state, ctx, pid, 'resonance_vault', origin, TILE * 4, TILE * 4);
    spawnNear(state, ctx, pid, 'wisp', origin, 4, TILE * 2, TILE * 2);
    setMana(state, ctx, pid, 1500);
  }
  return finish('Economy Test', 'builtin:economy-test', state, matchConfig, ['builtin', 'economy'], withSettings());
}

const GENERATORS: Record<string, (registry: Registry, matchConfig: MatchConfig) => SavedScenario> = {
  'builtin:early-game': earlyGame,
  'builtin:mid-game': midGame,
  'builtin:late-game': lateGame,
  'builtin:tower-test': towerTest,
  'builtin:ai-rush': aiRush,
  'builtin:spell-test': spellTest,
  'builtin:performance-test': performanceTest,
  'builtin:economy-test': economyTest,
};

export function loadBuiltinScenario(
  id: string,
  registry: Registry = loadRegistry(),
  matchConfig: MatchConfig = buildSandboxMatchConfig(),
): SavedScenario | null {
  const gen = GENERATORS[id];
  if (!gen) return null;
  return gen(registry, matchConfig);
}

export function isBuiltinScenarioId(id: string): boolean {
  return id in GENERATORS;
}
