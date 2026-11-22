// v1 ↔ v2 content parity.
//
// This is the "same rules" proof at the data layer: every v1 definition must exist in v2 with
// identical gameplay numbers. If a number drifts, this test names the field.
//
// It reads v1's JSON directly from the repository root (never importing v1 code) and compares
// field-by-field against the v2 registry. The only permitted differences are the ones the v2
// schema deliberately adds, which are listed and justified in PLAN_ADDITIONS below.

import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getRegistry, resetRegistry } from '../helpers';
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

/**
 * APPROVED RULE CHANGES — the ONLY places v2 may differ from v1 in a gameplay value.
 *
 * Keyed by `<defId>.<field>`, and the entry must name the exact v1 value it replaces. That is deliberate: a blanket permission
 * for a field would let any future edit to it slip through, whereas naming the value means the exception covers ONE number and
 * any further change fails the test until it is itself approved and recorded here.
 *
 * Each entry carries the reason and the date it was approved. Every other field on every other definition stays locked.
 */
const APPROVED_VALUE_EXCEPTIONS: Readonly<Record<string, { approvedValue: unknown; reason: string; approved: string }>> = {
  /**
   * HQ durability. APPROVED BY ZACHARY, 2026-11-21.
   *
   * WHY: a 1v1 between evenly matched AIs was decided in about 12 minutes because the first credible push killed the HQ almost
   * immediately once the defending army was spent. Raising HQ HP lengthens that final step, so a match runs closer to the
   * intended ~20 minutes.
   *
   * WHY THIS VALUE: measured across 8 seeds x both start corners. 3000 hp gave a 12.9 min median — not enough; 4000 gave a
   * 19.9 min median with the difficulty ordering unchanged (hard>normal 75%, normal>easy 88%, hard>easy 88%, identical to the
   * v1 baseline) and zero unfinished matches. 4000 is therefore the SMALLEST change that reaches the 15-25 minute band.
   *
   * WHY HQ HP AND NOT TURRETS: turret damage was measured first and rejected. At damage 5 the ordering collapsed
   * (hard>normal 75% -> 50%) and at damage 7 normal-vs-easy fell to 20% with 12 of 16 matches failing to finish inside 30
   * minutes. Static defence substitutes for good decisions, so making turrets stronger equalises the difficulties and rewards
   * turtling. HQ HP lengthens the kill without making passivity safe, which is why it preserves the ordering exactly.
   *
   * This is the ONLY gameplay value in the whole content set allowed to differ from v1, and the exception names the v1 value it
   * replaces: 2000. Any further change to it fails this test until separately approved and recorded.
   */
  /**
   * Economy supply. APPROVED BY ZACHARY, 2026-11-21.
   *
   * WHY: the map authors 127,000 mana but `manaNodeCapacity` clamped every node to 12,000, so only 75,000 was reachable. Measured
   * income was ~890 mana/min/side with spending exceeding earnings, so both sides ran at zero margin and the first raid that
   * killed the worker line was unrecoverable. Seeds 1035 and 1042 froze from minute 10 with 61,047 mana still on the map and no
   * workers to mine it.
   *
   * WHY 25000: it is exactly the largest amount the map AUTHORS on its main nodes, so clamping there honours the map as designed
   * rather than inventing a number. Swept: 12000 gave a 1073 s worst no-spend, 25000 gave **301 s**, 40000 was identical to 25000
   * because no node authors more. Worst no-spend fell to 199 s with the final configuration.
   */
  'balance.manaNodeCapacity': {
    approvedValue: 25000,
    reason:
      'Approved rule change: node capacity 12000 -> 25000, matching the largest amount the map authors. ' +
      'Worst no-spend 1073s -> 301s; 40000 measured identical.',
    approved: '2026-11-21 (Zachary)',
  },
  /**
   * Sanctum income floor. APPROVED BY ZACHARY, 2026-11-21 as an economy value.
   *
   * WHY IT IS NEEDED, MEASURED: with zero harvesters a side has NO income, so it can never afford the worker that would restore
   * its income. p2 was observed holding 155 mana against a 200-cost worker with two spires standing and nothing sellable, stuck
   * 45 short for the rest of the match while its opponent sat on 111,700 untouched mana. Swept: trickle 0 -> 1 unfinished match
   * and a 1243 s worst no-spend; 0.6 -> 0 unfinished, 407 s; **1.0 -> 0 unfinished, 201 s**; 2.0 -> 180 s.
   *
   * WHY 2.0 AND NOT 1.0: 1.5 was measured first and left a REAL unresolved deadlock — p1 reached zero workers at minute 13 and
   * was still there 115 s later when the match ended, because at 1.0/s a worker takes 3.3 min to fund and it was killed before it
   * could mine. `tests/phase5-dead-economy.test.ts` now asserts a side in the dead state always escapes and rebuilds, and 2.0 is
   * the value that passes: one worker every ~1.7 min.
   *
   * It is still far below mining — a single worker at a node earns 16/s, eight times this — so it remains a recovery floor, not an
   * income source. Worst no-spend measured 180 s at this value against 1243 s with no trickle at all.
   */
  'balance.sanctumTricklePerSecond': {
    approvedValue: 2,
    reason:
      'Approved rule change: passive 2 mana/s per held HQ as a dead-economy floor. At 0 a match went unfinished with a 1243s ' +
      'no-spend; 1.0 still left a 115s unresolved deadlock; 2.0 funds a worker in ~1.7 min and clears it.',
    approved: '2026-11-21 (Zachary)',
  },
  'sanctum.hp': {
    approvedValue: 8000,
    reason:
      'Approved rule change: HQ 2000 -> 8000 so an even 1v1 runs 15-25 min. The roomier economy shortened matches to 12.7 min, and ' +
      'HQ HP was the only lever that adds length WITHOUT disturbing the difficulty ordering. Measured 15.1 min median at ' +
      '58/83% ordering with 0 unfinished; HQ 12000 gave 15.7 min for no ordering benefit.',
    approved: '2026-11-21 (Zachary)',
  },
};

/** Look up an approved exception for one field of one definition. */
function approvedException(
  defId: string,
  key: string,
): { approvedValue: unknown; reason: string; approved: string } | undefined {
  return APPROVED_VALUE_EXCEPTIONS[`${defId}.${key}`];
}

describe('content parity: v1 → v2', () => {
  /**
   * ALWAYS COMPARE A FRESH LOAD.
   *
   * `getRegistry()` memoises. That is fine for most suites, but this one exists to catch edits to the JSON on disk, and a cached
   * registry predating an edit makes the check silently vacuous. It happened: a balance sweep left `arcane_sentry` at hp 900 and
   * damage 5 instead of v1's 600 and 3, the working copy was committed, and this suite still passed because it was comparing a
   * registry built before the change.
   *
   * Resetting first means the comparison is always against what is actually in the files.
   */
  beforeEach(() => resetRegistry());

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

  it('balance.json matches v1 except for the approved economy values', () => {
    /**
     * Only the two economy values Zachary approved on 2026-11-21 may differ. Everything else — siphon rate, carry, starting mana,
     * the vault multiplier, the repair ratios, the AI parameters — must still be v1 exactly.
     */
    const v1 = { ...v1Json<Record<string, unknown>>('balance.json') };
    const v2 = { ...(getRegistry().balance as unknown as Record<string, unknown>) };


    for (const key of ['manaNodeCapacity', 'sanctumTricklePerSecond']) {
      const ex = approvedException('balance', key);
      expect(ex, `balance.${key} is set but has no approved exception`).toBeDefined();
      // Read the value BEFORE deleting it; deleting first made this compare undefined against the approved number.
      expect(v2[key], `balance.${key} is not the approved value`).toBe(ex!.approvedValue);
    }
    // `sanctumTricklePerSecond` is NEW in v2, so it is absent from v1; drop it from both, plus the two approved values already checked.
    for (const key of ['manaNodeCapacity', 'sanctumTricklePerSecond']) {
      delete v1[key];
      delete v2[key];
    }
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
    // APPROVED CHANGE (Zachary, 2026-11-21): 12000 -> 25000. See APPROVED_VALUE_EXCEPTIONS.
    expect(reg.balance.manaNodeCapacity).toBe(25000);
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
    /**
     * An APPROVED exception is allowed to differ — but only for the exact v1 value it was approved against. If the current
     * value has drifted from BOTH v1 and the approved replacement, that is an unapproved change and the assertion fires.
     */
    /**
     * An approved exception may differ from v1 — but only by taking the ONE recorded value. If the field has drifted from both
     * v1 and the approved replacement, that is an unapproved change and the assertion below fires.
     */
    if (key === 'weapon' && v1Value !== undefined && v1Value !== null) {
      /**
       * Weapon stats are compared FIELD BY FIELD so an approved change can be scoped to one number.
       *
       * `arcane_sentry.weapon.damage` is approved; its range, cooldown and `vs` table must still match v1 exactly. Comparing the
       * whole object would force a blanket exception for every turret stat, which is precisely the permission the exception list
       * exists to avoid.
       */
      const w1 = v1Value as Record<string, unknown>;
      const w2 = v2[key] as Record<string, unknown>;
      for (const [wk, wv1] of Object.entries(w1)) {
        const nested = approvedException(String(v1.id), `weapon.${wk}`);
        if (nested && String(w2[wk]) !== String(wv1) && String(w2[wk]) === String(nested.approvedValue)) continue;
        expect(w2[wk], `${label} ${String(v1.id)}.weapon.${wk} differs from v1`).toEqual(wv1);
      }
      continue;
    }
    const exception = approvedException(String(v1.id), key);
    if (exception && String(v2[key]) !== String(v1Value) && String(v2[key]) === String(exception.approvedValue)) {
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
