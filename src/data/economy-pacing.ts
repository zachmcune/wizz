// Match-level economy pacing presets. Standard values live in data JSON; Tight applies runtime overrides.
import type { BalanceData } from './defs';
import { Registry } from './registry';

export type EconomyPacing = 'standard' | 'tight';

const TIGHT_BALANCE_OVERRIDES: Pick<
  BalanceData,
  'startingMana' | 'siphonPerSecond' | 'manaNodeCapacity' | 'vaultSiphonMultiplier' | 'conjureManaAmount' | 'conjureManaIntervalSeconds'
> = {
  startingMana: 600,
  siphonPerSecond: 12,
  manaNodeCapacity: 8000,
  vaultSiphonMultiplier: 1.2,
  conjureManaAmount: 4,
  conjureManaIntervalSeconds: 4,
};

const TIGHT_AI_WISP_TARGETS = { easy: 2, normal: 2, hard: 3 } as const;
const TIGHT_WISP_CARRY = 60;
const COST_MULTIPLIER = 1.5;

/** Production buildings whose costs scale in Tight mode (walls, gates, power stay flat). */
const COST_MULTIPLIED_BUILDINGS = new Set([
  'attunement_spire',
  'resonance_vault',
  'summoning_circle',
  'golem_forge',
  'arcane_nexus',
  'astral_spire',
  'scrying_obelisk',
]);

export interface EconomyPacingOption {
  id: EconomyPacing;
  label: string;
  detail: string;
}

export const ECONOMY_PACING_OPTIONS: EconomyPacingOption[] = [
  {
    id: 'standard',
    label: 'Standard',
    detail: 'Default RA2-style pacing with Resonance Vault gating.',
  },
  {
    id: 'tight',
    label: 'Tight economy',
    detail:
      'Tight economy (vs Standard): starting mana 600 (not 900); harvest 12/sec (not 16); corner nodes capped at 8,000 (not 12,000); wisp loads 60 (not 75); all army and production building costs ×1.5; weavers conjure 4 mana every 4s (not 6 every 3s); AI builds fewer harvesters.',
  },
];

export function economyPacingDetail(pacing: EconomyPacing): string {
  return ECONOMY_PACING_OPTIONS.find((o) => o.id === pacing)?.detail ?? '';
}

function cloneRegistry(base: Registry): Registry {
  const reg = new Registry();
  reg.units = new Map([...base.units.entries()].map(([id, def]) => [id, { ...def }]));
  reg.buildings = new Map([...base.buildings.entries()].map(([id, def]) => [id, { ...def }]));
  reg.spells = new Map(base.spells);
  reg.projectiles = new Map(base.projectiles);
  reg.maps = base.maps;
  reg.factions = base.factions;
  reg.matches = base.matches;
  reg.balance = {
    ...base.balance,
    ai: {
      easy: { ...base.balance.ai.easy },
      normal: { ...base.balance.ai.normal },
      hard: { ...base.balance.ai.hard },
    },
  };
  return reg;
}

/** Returns a match-scoped registry clone with balance and costs adjusted for pacing. */
export function registryForPacing(base: Registry, pacing: EconomyPacing): Registry {
  const reg = cloneRegistry(base);
  if (pacing === 'standard') return reg;

  reg.balance = {
    ...reg.balance,
    ...TIGHT_BALANCE_OVERRIDES,
    ai: {
      easy: { ...reg.balance.ai.easy, wispTarget: TIGHT_AI_WISP_TARGETS.easy },
      normal: { ...reg.balance.ai.normal, wispTarget: TIGHT_AI_WISP_TARGETS.normal },
      hard: { ...reg.balance.ai.hard, wispTarget: TIGHT_AI_WISP_TARGETS.hard },
    },
  };

  for (const id of COST_MULTIPLIED_BUILDINGS) {
    const def = reg.buildings.get(id);
    if (def && def.cost > 0) {
      reg.buildings.set(id, { ...def, cost: Math.round(def.cost * COST_MULTIPLIER) });
    }
  }

  for (const [id, def] of reg.units) {
    if (def.cost <= 0) continue;
    const patched = { ...def, cost: Math.round(def.cost * COST_MULTIPLIER) };
    if (id === 'wisp' && def.carry !== undefined) patched.carry = TIGHT_WISP_CARRY;
    reg.units.set(id, patched);
  }

  return reg;
}
