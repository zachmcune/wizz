// Typed registries: definitions loaded from data files, looked up by id at runtime.
import type { UnitDef, BuildingDef, SpellDef, ProjectileDef, MapData, BalanceData, FactionDef } from './defs';
import type { MatchConfig } from '../sim/types';

const DEFAULT_BALANCE: BalanceData = {
  startingMana: 900,
  siphonPerSecond: 16,
  manaNodeCapacity: 12000,
  vaultSiphonMultiplier: 1.3,
  sellRefundRatio: 0.5,
  repairManaPerHp: 0.05,
  repairHpPerTick: 2,
  conjureManaAmount: 6,
  conjureManaIntervalSeconds: 3,
  ai: {
    easy: { interval: 20, wispTarget: 3, armyThreshold: 8 },
    normal: { interval: 15, wispTarget: 3, armyThreshold: 12 },
    hard: { interval: 10, wispTarget: 4, armyThreshold: 16 },
  },
};

export class Registry {
  units = new Map<string, UnitDef>();
  buildings = new Map<string, BuildingDef>();
  spells = new Map<string, SpellDef>();
  projectiles = new Map<string, ProjectileDef>();
  maps = new Map<string, MapData>();
  factions = new Map<string, FactionDef>();
  matches = new Map<string, MatchConfig>();
  balance: BalanceData = DEFAULT_BALANCE;

  unit(id: string): UnitDef {
    const d = this.units.get(id);
    if (!d) throw new Error(`Unknown unit def: ${id}`);
    return d;
  }

  building(id: string): BuildingDef {
    const d = this.buildings.get(id);
    if (!d) throw new Error(`Unknown building def: ${id}`);
    return d;
  }

  spell(id: string): SpellDef {
    const d = this.spells.get(id);
    if (!d) throw new Error(`Unknown spell def: ${id}`);
    return d;
  }

  projectile(id: string): ProjectileDef {
    const d = this.projectiles.get(id);
    if (!d) throw new Error(`Unknown projectile def: ${id}`);
    return d;
  }

  map(id: string): MapData {
    const d = this.maps.get(id);
    if (!d) throw new Error(`Unknown map def: ${id}`);
    return d;
  }

  faction(id: string): FactionDef {
    const d = this.factions.get(id);
    if (!d) throw new Error(`Unknown faction def: ${id}`);
    return d;
  }

  match(id: string): MatchConfig {
    const d = this.matches.get(id);
    if (!d) throw new Error(`Unknown match config: ${id}`);
    return d;
  }

  /** A def is a unit or building for entity spawning. */
  entityDef(id: string): UnitDef | BuildingDef {
    return this.units.get(id) ?? this.building(id);
  }
}
