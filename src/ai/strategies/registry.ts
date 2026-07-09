// Strategy lookup — maps player aiStrategyId or faction to a concrete AiStrategy implementation.
import type { Player } from '../../sim/types';
import { ConfigDrivenStrategy } from './config-driven-strategy';
import { loadAiStrategies } from './load';
import type { AiStrategy } from './types';

const configs = loadAiStrategies();
const byId = new Map<string, AiStrategy>();
const byFaction = new Map<string, AiStrategy>();

const sorted = [...configs.values()].sort((a, b) => a.id.localeCompare(b.id));
for (const config of sorted) {
  byId.set(config.id, new ConfigDrivenStrategy(config));
}

for (const config of sorted) {
  const standardId = `${config.factionId}_standard`;
  if (config.id === standardId) {
    byFaction.set(config.factionId, byId.get(config.id)!);
  }
}
for (const config of sorted) {
  if (!byFaction.has(config.factionId)) {
    byFaction.set(config.factionId, byId.get(config.id)!);
  }
}

const defaultStrategy = byFaction.get('arcane') ?? byId.get('arcane_standard')!;

export function strategyForPlayer(player: Player): AiStrategy {
  if (player.aiStrategyId) {
    const explicit = byId.get(player.aiStrategyId);
    if (explicit) return explicit;
  }
  const factionId = player.factionId ?? 'arcane';
  return byFaction.get(factionId) ?? defaultStrategy;
}

export function listAiStrategies(): string[] {
  return [...configs.keys()];
}
