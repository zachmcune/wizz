// Pure registry construction: path → parsed JSON in, validated Registry out.
//
// This module deliberately contains NO bundler-specific code (`import.meta.glob`), so it can be
// imported from Node tooling, CI, and tests as well as from the app. The Vite-specific glue lives
// in `loader.ts`, which is a thin wrapper over this file.

import type { ZodTypeAny, z } from 'zod';
import {
  balanceSchema,
  buildingSchema,
  factionSchema,
  mapSchema,
  matchConfigSchema,
  projectileSchema,
  researchSchema,
  spellSchema,
  unitSchema,
} from './schemas';
import { Registry } from './registry';
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
import { assertRegistryValid } from './validate-registry';
import { applyDataOverlays, EMPTY_MANIFEST, type DataManifest } from './mod-loader';

export class DataLoadError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Content validation failed:\n${issues.map((i) => `  ${i}`).join('\n')}`);
    this.name = 'DataLoadError';
    this.issues = issues;
  }
}

function describeIssue(issue: z.ZodIssue): string {
  return `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`;
}

/** Validate one file, collecting its issues under a stable `path` prefix. */
function validateFile<T extends ZodTypeAny>(
  schema: T,
  raw: unknown,
  path: string,
  issues: string[],
): z.infer<T> | null {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const extra = result.error.issues.length - 1;
  issues.push(
    `Invalid data file ${path} -> ${first ? describeIssue(first) : 'unknown error'}` +
      (extra > 0 ? ` (+${extra} more issue${extra === 1 ? '' : 's'})` : ''),
  );
  return null;
}

/** Which registry collection a data path belongs to. */
export function classifyPath(path: string): keyof Registry | 'balance' | 'ignore' {
  if (path.endsWith('/manifest.json')) return 'ignore';
  if (path.includes('/ai/')) return 'ignore';
  if (path.endsWith('/balance.json')) return 'balance';
  if (path.includes('/units/')) return 'units';
  if (path.includes('/buildings/')) return 'buildings';
  if (path.includes('/spells/')) return 'spells';
  if (path.includes('/projectiles/')) return 'projectiles';
  if (path.includes('/research/')) return 'research';
  if (path.includes('/maps/')) return 'maps';
  if (path.includes('/factions/')) return 'factions';
  if (path.includes('/match/')) return 'matches';
  return 'ignore';
}

/**
 * Build a Registry from an in-memory map of data path → raw JSON value.
 * Throws `DataLoadError` listing every invalid file if anything fails.
 */
export function loadRegistryFromModules(
  rawModules: Record<string, unknown>,
  manifest: DataManifest = EMPTY_MANIFEST,
): Registry {
  const modules = applyDataOverlays(rawModules, manifest);
  const reg = new Registry();
  const issues: string[] = [];

  // Sort paths so error output and load order are deterministic (a Map's insertion order
  // depends on the glob implementation, which would make failures non-reproducible).
  for (const path of Object.keys(modules).sort()) {
    const raw = modules[path];
    const bucket = classifyPath(path);
    switch (bucket) {
      case 'ignore':
        break;
      case 'balance': {
        const d = validateFile(balanceSchema, raw, path, issues) as BalanceData | null;
        if (d) reg.balance = d;
        break;
      }
      case 'units': {
        const d = validateFile(unitSchema, raw, path, issues) as UnitDef | null;
        if (d) {
          if (reg.units.has(d.id)) issues.push(`Duplicate unit id "${d.id}" in ${path}`);
          else reg.units.set(d.id, d);
        }
        break;
      }
      case 'buildings': {
        const d = validateFile(buildingSchema, raw, path, issues) as BuildingDef | null;
        if (d) {
          if (reg.buildings.has(d.id)) issues.push(`Duplicate building id "${d.id}" in ${path}`);
          else reg.buildings.set(d.id, d);
        }
        break;
      }
      case 'spells': {
        const d = validateFile(spellSchema, raw, path, issues) as SpellDef | null;
        if (d) {
          if (reg.spells.has(d.id)) issues.push(`Duplicate spell id "${d.id}" in ${path}`);
          else reg.spells.set(d.id, d);
        }
        break;
      }
      case 'projectiles': {
        const d = validateFile(projectileSchema, raw, path, issues) as ProjectileDef | null;
        if (d) {
          if (reg.projectiles.has(d.id)) issues.push(`Duplicate projectile id "${d.id}" in ${path}`);
          else reg.projectiles.set(d.id, d);
        }
        break;
      }
      case 'research': {
        const d = validateFile(researchSchema, raw, path, issues) as ResearchDef | null;
        if (d) {
          if (reg.research.has(d.id)) issues.push(`Duplicate research id "${d.id}" in ${path}`);
          else reg.research.set(d.id, d);
        }
        break;
      }
      case 'maps': {
        const d = validateFile(mapSchema, raw, path, issues) as MapData | null;
        if (d) {
          if (reg.maps.has(d.id)) issues.push(`Duplicate map id "${d.id}" in ${path}`);
          else reg.maps.set(d.id, d);
        }
        break;
      }
      case 'factions': {
        const d = validateFile(factionSchema, raw, path, issues) as FactionDef | null;
        if (d) {
          if (reg.factions.has(d.id)) issues.push(`Duplicate faction id "${d.id}" in ${path}`);
          else reg.factions.set(d.id, d);
        }
        break;
      }
      case 'matches': {
        const d = validateFile(matchConfigSchema, raw, path, issues) as MatchConfig | null;
        if (d) {
          // The schema requires an id, so match files always arrive with one; the type allows
          // undefined only because runtime-built configs (lobby) omit it.
          const matchId = d.id;
          if (!matchId) {
            issues.push(`Match config ${path} is missing its "id" field`);
          } else if (reg.matches.has(matchId)) {
            issues.push(`Duplicate match id "${matchId}" in ${path}`);
          } else {
            reg.matches.set(matchId, d);
          }
        }
        break;
      }
    }
  }

  if (issues.length) throw new DataLoadError(issues);

  const refIssues = assertRegistryValid(reg);
  if (refIssues.length) {
    throw new DataLoadError(refIssues.map((i) => `${i.path}: ${i.message}`));
  }
  return reg;
}
