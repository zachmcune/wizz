import { get, set, del, keys } from 'idb-keyval';
import type { Entity, GameState, MatchConfig } from '../sim/types';
import type { SandboxSettings } from '../sim/sandbox-types';
import { defaultSandboxSettings } from '../sim/sandbox-types';
import type { SaveMeta } from '../storage/save';
import { packState, type TransferState } from '../sim/state-transfer';

export const SCENARIO_VERSION = 1;
const SCENARIO_INDEX_KEY = 'arcane:scenario-index';
const SCENARIO_PREFIX = 'arcane:scenario:';

export interface SavedScenario {
  version: number;
  id: string;
  name: string;
  description?: string;
  tags: string[];
  createdAt: number;
  matchConfig: MatchConfig;
  sandbox: SandboxSettings;
  state: TransferState;
  meta: SaveMeta;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  tags: string[];
  createdAt: number;
  builtin?: boolean;
}

export function serializeScenario(
  name: string,
  state: GameState,
  matchConfig: MatchConfig,
  meta: SaveMeta,
  tags: string[] = [],
): SavedScenario {
  return {
    version: SCENARIO_VERSION,
    id: crypto.randomUUID(),
    name,
    tags,
    createdAt: Date.now(),
    matchConfig,
    sandbox: state.sandbox?.settings ?? defaultSandboxSettings(),
    state: packState(state),
    meta,
  };
}

async function readIndex(): Promise<ScenarioSummary[]> {
  return ((await get(SCENARIO_INDEX_KEY)) as ScenarioSummary[] | undefined) ?? [];
}

async function writeIndex(index: ScenarioSummary[]): Promise<void> {
  await set(SCENARIO_INDEX_KEY, index);
}

export async function saveUserScenario(scenario: SavedScenario): Promise<void> {
  await set(`${SCENARIO_PREFIX}${scenario.id}`, scenario);
  const index = await readIndex();
  index.unshift({ id: scenario.id, name: scenario.name, tags: scenario.tags, createdAt: scenario.createdAt });
  await writeIndex(index);
}

export async function loadUserScenario(id: string): Promise<SavedScenario | null> {
  return ((await get(`${SCENARIO_PREFIX}${id}`)) as SavedScenario | undefined) ?? null;
}

export async function deleteUserScenario(id: string): Promise<void> {
  await del(`${SCENARIO_PREFIX}${id}`);
  const index = (await readIndex()).filter((s) => s.id !== id);
  await writeIndex(index);
}

export async function listScenarios(): Promise<ScenarioSummary[]> {
  const user = await readIndex();
  return [...BUILTIN_SCENARIOS, ...user];
}

export function deserializeScenarioState(saved: SavedScenario): GameState {
  const entities = new Map<number, Entity>();
  for (const e of saved.state.entities) entities.set(e.id, e);
  return {
    ...saved.state,
    entities,
    sandbox: { enabled: true, settings: structuredClone(saved.sandbox) },
  } as GameState;
}

/** Built-in scenario templates (generated on first access). */
export const BUILTIN_SCENARIOS: ScenarioSummary[] = [
  { id: 'builtin:early-game', name: 'Early Game', tags: ['builtin', 'economy'], createdAt: 0, builtin: true },
  { id: 'builtin:mid-game', name: 'Mid Game', tags: ['builtin'], createdAt: 0, builtin: true },
  { id: 'builtin:late-game', name: 'Late Game', tags: ['builtin'], createdAt: 0, builtin: true },
  { id: 'builtin:tower-test', name: 'Tower Test', tags: ['builtin', 'combat'], createdAt: 0, builtin: true },
  { id: 'builtin:ai-rush', name: 'AI Rush', tags: ['builtin', 'ai'], createdAt: 0, builtin: true },
  { id: 'builtin:spell-test', name: 'Spell Test', tags: ['builtin', 'spells'], createdAt: 0, builtin: true },
  { id: 'builtin:performance-test', name: 'Performance Test', tags: ['builtin', 'perf'], createdAt: 0, builtin: true },
  { id: 'builtin:economy-test', name: 'Economy Test', tags: ['builtin', 'economy'], createdAt: 0, builtin: true },
];

export async function clearAllUserScenarios(): Promise<void> {
  const allKeys = await keys();
  for (const key of allKeys) {
    if (typeof key === 'string' && key.startsWith(SCENARIO_PREFIX)) await del(key);
  }
  await del(SCENARIO_INDEX_KEY);
}
