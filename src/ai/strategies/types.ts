// AI strategy configuration types and runtime context.
import type { SimServices } from '../../sim/context';
import type { Command, GameState, Player } from '../../sim/types';
import type { AiParams } from '../../data/defs';
import type { AiDifficultyProfile } from '../difficulty';

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
  spells: {
    meteor: string;
    aegis: string;
    blink: string;
  };
  production: {
    harvesterBuilding: string;
    harvesterUnit: string;
    weaverBuilding: string;
    weaverUnit: string;
    armyBuilding: string;
    siegeBuilding: string;
    nexusUnit: string;
    airUnit: string;
    scoutUnit: string;
    armyRotation: string[];
    siegeUnits: string[];
    siegeArmyThresholdFactor: number;
    forgeArmyThresholdFactor: number;
    expandUnit: string;
    expandBuilding: string;
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
  profile: AiDifficultyProfile;
  cmds: Command[];
  skipCombat: boolean;
}

export interface AiStrategy {
  readonly config: AiStrategyConfig;
  decide(ctx: AiDecisionContext): void;
}
