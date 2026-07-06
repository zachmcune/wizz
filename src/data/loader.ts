// Loads all /data JSON via Vite's glob import, validates with Zod, and builds a Registry.
// Works in both the app (dev/build) and vitest, since both run through Vite's transform.
import { Registry } from './registry';
import {
  unitSchema,
  buildingSchema,
  spellSchema,
  projectileSchema,
  mapSchema,
  matchConfigSchema,
} from './schemas';
import type { z, ZodTypeAny } from 'zod';
import type { UnitDef, BuildingDef, SpellDef, ProjectileDef, MapData } from './defs';
import type { MatchConfig } from '../sim/types';

const modules = import.meta.glob('/data/**/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>;

function validate<T extends ZodTypeAny>(schema: T, raw: unknown, path: string): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown';
    throw new Error(`Invalid data file ${path} -> ${where}`);
  }
  return result.data;
}

export function loadRegistry(): Registry {
  const reg = new Registry();
  for (const [path, raw] of Object.entries(modules)) {
    if (path.includes('/units/')) {
      const d = validate(unitSchema, raw, path) as UnitDef;
      reg.units.set(d.id, d);
    } else if (path.includes('/buildings/')) {
      const d = validate(buildingSchema, raw, path) as BuildingDef;
      reg.buildings.set(d.id, d);
    } else if (path.includes('/spells/')) {
      const d = validate(spellSchema, raw, path) as SpellDef;
      reg.spells.set(d.id, d);
    } else if (path.includes('/projectiles/')) {
      const d = validate(projectileSchema, raw, path) as ProjectileDef;
      reg.projectiles.set(d.id, d);
    } else if (path.includes('/maps/')) {
      const d = validate(mapSchema, raw, path) as MapData;
      reg.maps.set(d.id, d);
    } else if (path.includes('/match/')) {
      const d = validate(matchConfigSchema, raw, path) as MatchConfig;
      reg.matches.set(d.mapId + ':' + d.players.length, d);
      // also register by filename stem for direct lookup
      const stem = path.split('/').pop()!.replace('.json', '');
      reg.matches.set(stem, d);
    }
  }
  return reg;
}
