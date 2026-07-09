// Loads AI strategy configs from /data/ai/*.json.
import { z } from 'zod';
import type { AiStrategyConfig } from './types';

const aiStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  factionId: z.string(),
  defendRadius: z.number().positive(),
  garrisonRadius: z.number().positive(),
  buildOrder: z.array(z.string()).min(1),
  advancedDefenses: z.array(z.string()),
  turret: z.object({
    defId: z.string(),
    requiresBuilding: z.string(),
    armyThresholdFactor: z.number().positive(),
    manaReserveFactor: z.number().positive(),
  }),
  superweapon: z.object({
    spellId: z.string(),
    requiresBuilding: z.string(),
  }),
  production: z.object({
    harvesterBuilding: z.string(),
    harvesterUnit: z.string(),
    armyBuilding: z.string(),
    siegeBuilding: z.string(),
    nexusUnit: z.string(),
    armyRotation: z.array(z.string()).min(1),
    siegeUnits: z.array(z.string()).min(1),
    siegeArmyThresholdFactor: z.number().positive(),
    forgeArmyThresholdFactor: z.number().positive(),
  }),
  combat: z.object({
    garrisonUnit: z.string(),
    garrisonBuilding: z.string(),
    siegeUnit: z.string(),
    defendFraction: z.number().min(0).max(1),
    minPushFactor: z.number().positive(),
    attackBias: z.record(z.string(), z.number()),
  }),
});

const modules = import.meta.glob('/data/ai/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function loadAiStrategies(): Map<string, AiStrategyConfig> {
  const strategies = new Map<string, AiStrategyConfig>();
  for (const [path, raw] of Object.entries(modules)) {
    const result = aiStrategySchema.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown';
      throw new Error(`Invalid AI strategy ${path} -> ${where}`);
    }
    strategies.set(result.data.id, result.data);
  }
  return strategies;
}
