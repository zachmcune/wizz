// Cross-reference validation. Runs after every file has passed its own schema, and catches
// dangling ids that a per-file schema cannot see (a unit referencing a building that does not
// exist, a map whose start location is inside a wall, a faction with no units, ...).
//
// These run at boot and in CI. A broken reference must never reach the player as a runtime error.

import type { Registry } from './registry';
import { TILE } from '../core/constants';

export interface ContentValidationIssue {
  path: string;
  message: string;
}

/** Follow `requires` transitively to see whether `targets` is reachable from `buildingId`. */
export function requiresAnyTransitively(
  registry: Registry,
  buildingId: string,
  targets: Set<string>,
  seen: Set<string> = new Set(),
): boolean {
  if (targets.has(buildingId)) return true;
  if (seen.has(buildingId)) return false;
  seen.add(buildingId);
  const def = registry.buildings.get(buildingId);
  if (!def) return false;
  return def.requires.some((req) => requiresAnyTransitively(registry, req, targets, seen));
}

function checkFactionList(
  issues: ContentValidationIssue[],
  path: string,
  factions: string[] | undefined,
  knownFactions: Set<string>,
): void {
  for (const f of factions ?? []) {
    if (!knownFactions.has(f)) {
      issues.push({ path, message: `factions entry "${f}" is not a known faction` });
    }
  }
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

  // ------------------------------------------------------------------ units
  for (const [id, unit] of registry.units) {
    const path = `/data/units/${id}.json`;
    if (!buildingIds.has(unit.producedBy)) {
      issues.push({ path, message: `producedBy "${unit.producedBy}" is not a known building` });
    }
    for (const req of unit.requires) {
      if (!buildingIds.has(req) && !researchIds.has(req)) {
        issues.push({ path, message: `requires "${req}" is not a known building or research` });
      }
    }
    if (unit.weapon?.projectile && !projectileIds.has(unit.weapon.projectile)) {
      issues.push({ path, message: `weapon.projectile "${unit.weapon.projectile}" is not a known projectile` });
    }
    if (unit.deploysAs && !buildingIds.has(unit.deploysAs)) {
      issues.push({ path, message: `deploysAs "${unit.deploysAs}" is not a known building` });
    }
    if (unit.isHarvester && unit.carry === undefined) {
      issues.push({ path, message: 'isHarvester requires a `carry` value' });
    }
    checkFactionList(issues, path, unit.factions, factionIds);
  }

  // -------------------------------------------------------------- buildings
  const refineryIds = new Set([...registry.buildings.values()].filter((b) => b.isRefinery).map((b) => b.id));

  for (const [id, building] of registry.buildings) {
    const path = `/data/buildings/${id}.json`;
    for (const req of building.requires) {
      if (!buildingIds.has(req) && !researchIds.has(req)) {
        issues.push({ path, message: `requires "${req}" is not a known building or research` });
      }
    }
    // A player-buildable building must be reachable only after a refinery exists, otherwise an
    // opening build order can skip the mana drop-off and soft-lock the economy.
    if (building.menuCategory && !building.isRefinery && !building.isConstructionYard) {
      if (refineryIds.size === 0) {
        issues.push({ path, message: 'player-buildable buildings must follow a refinery (none marked isRefinery)' });
      } else if (!requiresAnyTransitively(registry, id, refineryIds)) {
        issues.push({
          path,
          message: 'player-buildable buildings must require a refinery (directly or via the tech chain)',
        });
      }
    }
    for (const unitId of building.producesUnits ?? []) {
      if (!unitIds.has(unitId)) issues.push({ path, message: `producesUnits "${unitId}" is not a known unit` });
    }
    for (const spellId of building.unlocksSpells ?? []) {
      if (!spellIds.has(spellId)) issues.push({ path, message: `unlocksSpells "${spellId}" is not a known spell` });
    }
    if (building.weapon?.projectile && !projectileIds.has(building.weapon.projectile)) {
      issues.push({ path, message: `weapon.projectile "${building.weapon.projectile}" is not a known projectile` });
    }
    if (building.packsInto && !unitIds.has(building.packsInto)) {
      issues.push({ path, message: `packsInto "${building.packsInto}" is not a known unit` });
    }
    if (building.isMobileHQ && !building.packsInto) {
      issues.push({ path, message: 'isMobileHQ requires packsInto' });
    }
    for (const unitId of building.garrison?.allowedUnitIds ?? []) {
      if (!unitIds.has(unitId)) {
        issues.push({ path, message: `garrison.allowedUnitIds "${unitId}" is not a known unit` });
      }
    }
    if (building.isSuperweapon && !building.unlocksSpells?.length) {
      issues.push({ path, message: 'isSuperweapon requires unlocksSpells' });
    }
    checkFactionList(issues, path, building.factions, factionIds);
  }

  // ----------------------------------------------------------------- spells
  for (const [id, spell] of registry.spells) {
    const path = `/data/spells/${id}.json`;
    for (const req of spell.requires) {
      if (!buildingIds.has(req)) issues.push({ path, message: `requires "${req}" is not a known building` });
    }
    checkFactionList(issues, path, spell.factions, factionIds);
  }

  // --------------------------------------------------------------- research
  for (const [id, research] of registry.research) {
    const path = `/data/research/${id}.json`;
    for (const req of research.requires) {
      if (!buildingIds.has(req) && !researchIds.has(req)) {
        issues.push({ path, message: `requires "${req}" is not a known building or research` });
      }
    }
    if (!buildingIds.has(research.researchedAt)) {
      issues.push({ path, message: `researchedAt "${research.researchedAt}" is not a known building` });
    }
    if (research.requires.includes(research.id)) {
      issues.push({ path, message: 'a research cannot require itself' });
    }
    for (const effect of research.effects) {
      if (effect.kind === 'unitStatModifier') {
        for (const unitId of effect.unitIds ?? []) {
          if (!unitIds.has(unitId)) issues.push({ path, message: `effect target unit "${unitId}" is not a known unit` });
        }
      } else if (effect.kind === 'buildingStatModifier') {
        for (const bId of effect.buildingIds ?? []) {
          if (!buildingIds.has(bId)) issues.push({ path, message: `effect target building "${bId}" is not a known building` });
        }
      }
    }
    checkFactionList(issues, path, research.factions, factionIds);
  }

  // ------------------------------------------------------------------ maps
  for (const [id, map] of registry.maps) {
    const path = `/data/maps/${id}.json`;
    const worldW = map.tileW * TILE;
    const worldH = map.tileH * TILE;
    for (const [i, start] of map.startLocations.entries()) {
      if (start.x < 0 || start.y < 0 || start.x >= worldW || start.y >= worldH) {
        issues.push({ path, message: `startLocations[${i}] is outside the map` });
        continue;
      }
      const tx = Math.floor(start.x / TILE);
      const ty = Math.floor(start.y / TILE);
      if (map.tiles[ty * map.tileW + tx] === 1) {
        issues.push({ path, message: `startLocations[${i}] sits on a blocked tile` });
      }
    }
    for (const [i, node] of map.manaNodes.entries()) {
      if (node.x < 0 || node.y < 0 || node.x >= worldW || node.y >= worldH) {
        issues.push({ path, message: `manaNodes[${i}] is outside the map` });
      }
    }
    if (map.maxPlayers > map.startLocations.length) {
      issues.push({
        path,
        message: `maxPlayers (${map.maxPlayers}) exceeds startLocations (${map.startLocations.length})`,
      });
    }
    // Every start location must have a mana node it can actually reach on foot.
    for (const [i, start] of map.startLocations.entries()) {
      const near = map.manaNodes.some((n) => Math.hypot(n.x - start.x, n.y - start.y) <= TILE * 26);
      if (!near) {
        issues.push({ path, message: `startLocations[${i}] has no mana node within 26 tiles` });
      }
    }
  }

  // ----------------------------------------------------------------- match
  for (const [id, match] of registry.matches) {
    const path = `/data/match/${id}.json`;
    if (!mapIds.has(match.mapId)) {
      issues.push({ path, message: `mapId "${match.mapId}" is not a known map` });
    }
    const map = registry.maps.get(match.mapId);
    for (const player of match.players) {
      if (player.factionId && !factionIds.has(player.factionId)) {
        issues.push({ path, message: `player factionId "${player.factionId}" is not a known faction` });
      }
      if (map && player.startIndex >= map.startLocations.length) {
        issues.push({
          path,
          message: `player startIndex ${player.startIndex} exceeds map start locations (${map.startLocations.length})`,
        });
      }
    }
    const seenStarts = new Set<number>();
    for (const player of match.players) {
      if (seenStarts.has(player.startIndex)) {
        issues.push({ path, message: `two players share startIndex ${player.startIndex}` });
      }
      seenStarts.add(player.startIndex);
    }
  }

  // -------------------------------------------------------------- factions
  // A faction with nothing of its own is almost certainly a content mistake: it would be
  // indistinguishable from every other faction in the lobby. Shared (untagged) defs are available
  // to everyone and therefore do not count as identity.
  for (const [id, faction] of registry.factions) {
    if (!registry.hasExclusiveContent(id)) {
      issues.push({
        path: `/data/factions/${id}.json`,
        message: `faction "${faction.name}" has no exclusive content (no unit or building tagged with factions:["${id}"])`,
      });
    }
    if (registry.buildingsForFaction(id).length === 0) {
      issues.push({ path: `/data/factions/${id}.json`, message: `faction "${faction.name}" has no buildable buildings` });
    }
    if (registry.unitsForFaction(id).length === 0) {
      issues.push({ path: `/data/factions/${id}.json`, message: `faction "${faction.name}" has no trainable units` });
    }
  }

  return issues;
}

export function assertRegistryValid(registry: Registry): ContentValidationIssue[] {
  return validateRegistryRefs(registry);
}
