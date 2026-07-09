// Cross-reference validation for loaded game data. Catches broken refs at boot, not runtime.
import type { Registry } from './registry';

export interface ContentValidationIssue {
  path: string;
  message: string;
}

export function validateRegistryRefs(registry: Registry): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];

  const buildingIds = new Set(registry.buildings.keys());
  const unitIds = new Set(registry.units.keys());
  const spellIds = new Set(registry.spells.keys());
  const projectileIds = new Set(registry.projectiles.keys());
  const researchIds = new Set(registry.research.keys());
  const mapIds = new Set(registry.maps.keys());
  const factionIds = new Set(registry.factions.keys());

  for (const [id, unit] of registry.units) {
    if (!buildingIds.has(unit.producedBy)) {
      issues.push({ path: `units/${id}.json`, message: `producedBy "${unit.producedBy}" is not a known building` });
    }
    for (const req of unit.requires) {
      if (!buildingIds.has(req)) {
        issues.push({ path: `units/${id}.json`, message: `requires "${req}" is not a known building` });
      }
    }
    if (unit.weapon?.projectile && !projectileIds.has(unit.weapon.projectile)) {
      issues.push({ path: `units/${id}.json`, message: `weapon.projectile "${unit.weapon.projectile}" is not a known projectile` });
    }
    if (unit.deploysAs && !buildingIds.has(unit.deploysAs)) {
      issues.push({ path: `units/${id}.json`, message: `deploysAs "${unit.deploysAs}" is not a known building` });
    }
  }

  for (const [id, building] of registry.buildings) {
    for (const req of building.requires) {
      if (!buildingIds.has(req)) {
        issues.push({ path: `buildings/${id}.json`, message: `requires "${req}" is not a known building` });
      }
    }
    for (const unitId of building.producesUnits ?? []) {
      if (!unitIds.has(unitId)) {
        issues.push({ path: `buildings/${id}.json`, message: `producesUnits "${unitId}" is not a known unit` });
      }
    }
    for (const spellId of building.unlocksSpells ?? []) {
      if (!spellIds.has(spellId)) {
        issues.push({ path: `buildings/${id}.json`, message: `unlocksSpells "${spellId}" is not a known spell` });
      }
    }
    if (building.weapon?.projectile && !projectileIds.has(building.weapon.projectile)) {
      issues.push({
        path: `buildings/${id}.json`,
        message: `weapon.projectile "${building.weapon.projectile}" is not a known projectile`,
      });
    }
    if (building.packsInto && !unitIds.has(building.packsInto)) {
      issues.push({ path: `buildings/${id}.json`, message: `packsInto "${building.packsInto}" is not a known unit` });
    }
    if (building.garrison?.allowedUnitIds) {
      for (const unitId of building.garrison.allowedUnitIds) {
        if (!unitIds.has(unitId)) {
          issues.push({ path: `buildings/${id}.json`, message: `garrison.allowedUnitIds "${unitId}" is not a known unit` });
        }
      }
    }
  }

  for (const [id, spell] of registry.spells) {
    for (const req of spell.requires) {
      if (!buildingIds.has(req)) {
        issues.push({ path: `spells/${id}.json`, message: `requires "${req}" is not a known building` });
      }
    }
  }

  for (const [id, research] of registry.research) {
    for (const req of research.requires) {
      if (!buildingIds.has(req) && !researchIds.has(req)) {
        issues.push({ path: `research/${id}.json`, message: `requires "${req}" is not a known building or research` });
      }
    }
    if (!buildingIds.has(research.researchedAt)) {
      issues.push({ path: `research/${id}.json`, message: `researchedAt "${research.researchedAt}" is not a known building` });
    }
  }

  for (const [id, match] of registry.matches) {
    if (!mapIds.has(match.mapId)) {
      issues.push({ path: `match/${id}.json`, message: `mapId "${match.mapId}" is not a known map` });
    }
    for (const player of match.players) {
      if (player.factionId && !factionIds.has(player.factionId)) {
        issues.push({ path: `match/${id}.json`, message: `player factionId "${player.factionId}" is not a known faction` });
      }
      const map = registry.maps.get(match.mapId);
      if (map && player.startIndex >= map.startLocations.length) {
        issues.push({
          path: `match/${id}.json`,
          message: `player startIndex ${player.startIndex} exceeds map start locations (${map.startLocations.length})`,
        });
      }
    }
  }

  return issues;
}

export function assertRegistryValid(registry: Registry): void {
  const issues = validateRegistryRefs(registry);
  if (issues.length) {
    const detail = issues.map((i) => `  ${i.path}: ${i.message}`).join('\n');
    throw new Error(`Content validation failed:\n${detail}`);
  }
}
