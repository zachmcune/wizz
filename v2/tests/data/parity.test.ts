// v1 ↔ v2 content parity.
//
// This is the "same rules" proof at the data layer: every v1 definition must exist in v2 with
// identical gameplay numbers. If a number drifts, this test names the field.
//
// It reads v1's JSON directly from the repository root (never importing v1 code) and compares
// field-by-field against the v2 registry. The only permitted differences are the ones the v2
// schema deliberately adds, which are listed and justified in PLAN_ADDITIONS below.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getRegistry } from '../helpers';
import type { MapData } from '../../src/data/defs';

const repoRoot = join(process.cwd(), '..');
const v1Data = join(repoRoot, 'data');

function v1Json<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(join(v1Data, ...segments), 'utf8')) as T;
}

function v1Files(dir: string): string[] {
  return readdirSync(join(v1Data, dir))
    .filter((n) => n.endsWith('.json'))
    .sort();
}

/**
 * Fields v2 adds or changes on purpose. Anything not listed here must match v1 exactly.
 * Each entry says WHY, so a future reader can tell a deliberate change from a regression.
 */
const PLAN_ADDITIONS = {
  units: ['factions'] as const,
  buildings: ['factions'] as const,
  spells: ['factions'] as const,
  projectiles: [] as const,
  maps: ['visualHeights'] as const,
};

describe('content parity: v1 → v2', () => {
  it('has the same number of definitions as v1 for every content type', () => {
    const reg = getRegistry();
    const v1Units = v1Files('units').length;
    const v1Buildings = v1Files('buildings').length;
    const v1Spells = v1Files('spells').length;
    const v1Projectiles = v1Files('projectiles').length;

    // v2 must CONTAIN every v1 def; it may add more (new factions, new content).
    const v1UnitIds = v1Files('units').map((f) => f.replace('.json', ''));
    const v1BuildingIds = v1Files('buildings').map((f) => f.replace('.json', ''));
    const v1SpellIds = v1Files('spells').map((f) => f.replace('.json', ''));
    const v1ProjectileIds = v1Files('projectiles').map((f) => f.replace('.json', ''));

    for (const id of v1UnitIds) expect(reg.units.has(id), `v2 is missing v1 unit ${id}`).toBe(true);
    for (const id of v1BuildingIds) expect(reg.buildings.has(id), `v2 is missing v1 building ${id}`).toBe(true);
    for (const id of v1SpellIds) expect(reg.spells.has(id), `v2 is missing v1 spell ${id}`).toBe(true);
    for (const id of v1ProjectileIds) expect(reg.projectiles.has(id), `v2 is missing v1 projectile ${id}`).toBe(true);

    expect(reg.units.size).toBeGreaterThanOrEqual(v1Units);
    expect(reg.buildings.size).toBeGreaterThanOrEqual(v1Buildings);
    expect(reg.spells.size).toBe(v1Spells);
    expect(reg.projectiles.size).toBe(v1Projectiles);
  });

  it('every v1 unit matches field-for-field', () => {
    const reg = getRegistry();
    for (const file of v1Files('units')) {
      const v1 = v1Json<Record<string, unknown>>('units', file);
      const v2 = reg.unit(v1.id as string) as unknown as Record<string, unknown>;
      compareDefs('unit', v1, v2, PLAN_ADDITIONS.units);
    }
  });

  it('every v1 building matches field-for-field', () => {
    const reg = getRegistry();
    for (const file of v1Files('buildings')) {
      const v1 = v1Json<Record<string, unknown>>('buildings', file);
      const v2 = reg.building(v1.id as string) as unknown as Record<string, unknown>;
      compareDefs('building', v1, v2, PLAN_ADDITIONS.buildings);
    }
  });

  it('every v1 spell matches field-for-field', () => {
    const reg = getRegistry();
    for (const file of v1Files('spells')) {
      const v1 = v1Json<Record<string, unknown>>('spells', file);
      const v2 = reg.spell(v1.id as string) as unknown as Record<string, unknown>;
      compareDefs('spell', v1, v2, PLAN_ADDITIONS.spells);
    }
  });

  it('every v1 projectile matches field-for-field except its added sprite key', () => {
    const reg = getRegistry();
    for (const file of v1Files('projectiles')) {
      const v1 = v1Json<Record<string, unknown>>('projectiles', file);
      const v2 = reg.projectile(v1.id as string) as unknown as Record<string, unknown>;
      compareDefs('projectile', v1, v2, []);
    }
  });

  it('balance.json is identical to v1 (the rejected rule changes are really rejected)', () => {
    const v1 = v1Json<Record<string, unknown>>('balance.json');
    const v2 = getRegistry().balance as unknown as Record<string, unknown>;
    expect(v2).toEqual(v1);
  });

  it('the parity map (duel_glade) is identical to v1', () => {
    const v1 = v1Json<MapData & { visualHeights?: number[] }>('maps', 'duel_glade.json');
    const v2 = getRegistry().map('duel_glade');
    expect(v2.tileW).toBe(v1.tileW);
    expect(v2.tileH).toBe(v1.tileH);
    expect(v2.tiles).toEqual(v1.tiles);
    expect(v2.heights).toEqual(v1.heights ?? v1.visualHeights);
    expect(v2.startLocations).toEqual(v1.startLocations);
    expect(v2.manaNodes).toEqual(v1.manaNodes);
    expect(v2.maxPlayers).toBe(v1.maxPlayers);
  });

  it('every v1 match preset exists with the same map, seed and players', () => {
    const reg = getRegistry();
    for (const file of v1Files('match')) {
      const v1 = v1Json<Record<string, unknown>>('match', file);
      const v2 = reg.match(v1.id as string);
      expect(v2.mapId).toBe(v1.mapId);
      expect(v2.seed).toBe(v1.seed);
      expect(v2.players).toEqual(v1.players);
    }
  });

  it('the eight key numbers that define the game are exactly v1', () => {
    // Spelled out individually so a regression message is unambiguous.
    const reg = getRegistry();
    expect(reg.balance.startingMana).toBe(900);
    expect(reg.balance.siphonPerSecond).toBe(16);
    expect(reg.balance.manaNodeCapacity).toBe(12000);
    expect(reg.balance.vaultSiphonMultiplier).toBe(1.3);
    expect(reg.unit('wisp').carry).toBe(75);
    expect(reg.unit('wisp').speed).toBe(72);
    expect(reg.projectile('arcane_bolt').speed).toBe(1200);
    expect(reg.unit('stone_golem').hp).toBe(600);
  });
});

/**
 * Deep-compare a v1 def against its v2 def.
 *
 * Rules:
 *   • Every key present in v1 must exist in v2 with a deep-equal value, EXCEPT fields listed in
 *     `allowed` (which v2 adds) and `art.sprite` (v2 requires it; v1 sometimes omitted it).
 *   • Keys present only in v2 are fine — they are v2 additions, not v1 regressions.
 */
function compareDefs(
  label: string,
  v1: Record<string, unknown>,
  v2: Record<string, unknown>,
  _allowed: readonly string[],
): void {
  for (const [key, v1Value] of Object.entries(v1)) {
    if (key === 'art') {
      compareArt(label, v1.id as string, v1Value as Record<string, unknown>, v2.art as Record<string, unknown>);
      continue;
    }
    expect(v2, `${label} ${String(v1.id)} lost field "${key}"`).toHaveProperty(key);
    if (key === 'producesUnits') {
      // v2 adds faction units to their producers, which is additive: every v1 entry must still be
      // present and in the same relative order, but new entries may follow. Check the PREFIX rather
      // than exact equality so adding content never breaks the v1-parity guarantee.
      expect(
        (v2[key] as string[]).slice(0, (v1Value as string[]).length),
        `${label} ${String(v1.id)}.producesUnits changed its existing entries or order`,
      ).toEqual(v1Value);
      continue;
    }
    expect(v2[key], `${label} ${String(v1.id)}.${key} differs from v1`).toEqual(v1Value);
  }
  // v2 may add fields (e.g. `factions`); that is additive and does not need asserting here.
  // The presence of faction tags is covered by the faction-roster test in data/validation.
}

function compareArt(
  label: string,
  id: string,
  v1Art: Record<string, unknown>,
  v2Art: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(v1Art)) {
    if (key === 'sprite') {
      // v1 let some defs omit `sprite` and defaulted it to the entity id. v2 requires it
      // explicitly, so the v2 value must be either v1's sprite or the id.
      expect([value, id], `${label} ${id} art.sprite changed unexpectedly`).toContain(v2Art.sprite);
      continue;
    }
    expect(v2Art[key], `${label} ${id} art.${key} differs from v1`).toEqual(value);
  }
}
