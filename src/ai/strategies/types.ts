// AI strategy configuration types and runtime context.
import type { SimServices } from '../../sim/context';
import type { Command, GameState, Player } from '../../sim/types';
import type { AiParams } from '../../data/defs';

export interface AiStrategyConfig {
  id: string;
  name: string;
  factionId: string;
  defendRadius: number;
  garrisonRadius: number;
  buildOrder: string[];
  advancedDefenses: string[];
  turret: {
    defId: string;
    requiresBuilding: string;
    armyThresholdFactor: number;
    manaReserveFactor: number;
  };
  superweapon: {
    spellId: string;
    requiresBuilding: string;
  };
  production: {
    harvesterBuilding: string;
    harvesterUnit: string;
    armyBuilding: string;
    siegeBuilding: string;
    nexusUnit: string;
    armyRotation: string[];
    siegeUnits: string[];
    siegeArmyThresholdFactor: number;
    forgeArmyThresholdFactor: number;
  };
  combat: {
    garrisonUnit: string;
    garrisonBuilding: string;
    siegeUnit: string;
    defendFraction: number;
    minPushFactor: number;
    attackBias: Record<string, number>;
  };
}

export interface AiDecisionContext {
  state: GameState;
  services: SimServices;
  player: Player;
  difficulty: AiParams;
  cmds: Command[];
  skipCombat: boolean;
}

export interface AiStrategy {
  readonly config: AiStrategyConfig;
  decide(ctx: AiDecisionContext): void;
}
