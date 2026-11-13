// Typed registries: definitions loaded from data files, looked up by id at runtime.
// Lookups throw with the requested id so a wiring mistake fails at the call site, not later.

import type {
  BalanceData,
  BuildingDef,
  FactionDef,
  MapData,
  ProjectileDef,
  ResearchDef,
  SpellDef,
  UnitDef,
} from './defs';
import type { MatchConfig } from '../sim/types';

export const DEFAULT_BALANCE: BalanceData = {
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
  readonly units = new Map<string, UnitDef>();
  readonly buildings = new Map<string, BuildingDef>();
  readonly spells = new Map<string, SpellDef>();
  readonly projectiles = new Map<string, ProjectileDef>();
  readonly research = new Map<string, ResearchDef>();
  readonly maps = new Map<string, MapData>();
  readonly factions = new Map<string, FactionDef>();
  /** Keyed by match id only. v1 also stored a `mapId:playerCount` alias; v2 dropped it because
   *  two different configs could collide on that key and silently shadow each other. */
  readonly matches = new Map<string, MatchConfig>();
  balance: BalanceData = DEFAULT_BALANCE;

  /** Units the given faction may train (faction-tagged only; untagged defs are shared). */
  unitsForFaction(factionId: string | undefined): UnitDef[] {
    return [...this.units.values()].filter(
      (u) => u.factions === undefined || (factionId !== undefined && u.factions.includes(factionId)),
    );
  }

  /** Buildings the given faction may construct (faction-tagged only; untagged defs are shared). */
  buildingsForFaction(factionId: string | undefined): BuildingDef[] {
    return [...this.buildings.values()].filter(
      (b) => b.factions === undefined || (factionId !== undefined && b.factions.includes(factionId)),
    );
  }

  researchForFaction(factionId: string | undefined): ResearchDef[] {
    return [...this.research.values()].filter(
      (r) => r.factions === undefined || (factionId !== undefined && r.factions.includes(factionId)),
    );
  }

  /**
   * True when the faction owns at least one def EXCLUSIVELY. Shared (untagged) defs do not count:
   * a faction that only has access to shared content has no identity and is almost certainly a
   * content mistake, which the validator flags.
   */
  hasExclusiveContent(factionId: string): boolean {
    const unit = [...this.units.values()].some((u) => u.factions?.includes(factionId));
    const building = [...this.buildings.values()].some((b) => b.factions?.includes(factionId));
    return unit || building;
  }

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

  researchDef(id: string): ResearchDef {
    const d = this.research.get(id);
    if (!d) throw new Error(`Unknown research def: ${id}`);
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

  /** A def is a unit or building, for entity spawning. */
  entityDef(id: string): UnitDef | BuildingDef {
    const u = this.units.get(id);
    if (u) return u;
    return this.building(id);
  }
}
