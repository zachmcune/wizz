// Strategy lookup — maps faction/player to a concrete AiStrategy implementation.
import type { Player } from '../../sim/types';
import { ConfigDrivenStrategy } from './config-driven-strategy';
import { loadAiStrategies } from './load';
import type { AiStrategy } from './types';

const configs = loadAiStrategies();
const byFaction = new Map<string, AiStrategy>();

for (const config of configs.values()) {
  byFaction.set(config.factionId, new ConfigDrivenStrategy(config));
}

const defaultStrategy = byFaction.get('arcane') ?? new ConfigDrivenStrategy(configs.get('arcane_standard')!);

export function strategyForPlayer(player: Player): AiStrategy {
  const factionId = player.factionId ?? 'arcane';
  return byFaction.get(factionId) ?? defaultStrategy;
}

export function listAiStrategies(): string[] {
  return [...configs.keys()];
}
