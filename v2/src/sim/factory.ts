// Match initialisation: build a GameState from a MatchConfig and content.
//
// This is deliberately a pure function of (registry, config). No I/O, no wall-clock, no DOM — which
// is what makes a match reproducible from a seed and a config, and what lets the conformance suite
// run v1 and v2 side by side in one process.

import { TILE } from '../core/constants';
import type { Registry } from '../data/registry';
import { RNG_STREAMS, streamFor } from '../core/rng';
import type { GameState, MatchConfig, Player, Relation } from './types';
import { createServices, type SimServices, type StepContext } from './context';
import { createFogTiles, visibilitySystem } from './fog';
import { EntityStore } from './entity-store';
import { applyBuildingNav, spawnBuildingAt, spawnUnitAt, unlockTech } from './systems/production';
import { recomputePower } from './power';

export interface InitializedMatch {
  state: GameState;
  services: SimServices;
}

function makePlayer(cfg: MatchConfig['players'][number], startingMana: number, tileCount: number): Player {
  return {
    id: cfg.id,
    controller: cfg.controller,
    ...(cfg.aiDifficulty ? { aiDifficulty: cfg.aiDifficulty } : {}),
    team: cfg.team,
    color: cfg.color,
    ...(cfg.factionId ? { factionId: cfg.factionId } : {}),
    mana: startingMana,
    power: 0,
    powerUsed: 0,
    unlockedTech: [],
    completedResearch: [],
    spellCooldowns: {},
    defeated: false,
    explored: createFogTiles(tileCount),
    visible: createFogTiles(tileCount),
    knownBuildings: {},
  };
}

export function buildRelations(players: Player[]): Record<string, Record<string, Relation>> {
  const relations: Record<string, Record<string, Relation>> = {};
  for (const a of players) {
    const row: Record<string, Relation> = {};
    for (const b of players) {
      row[b.id] = a.id === b.id ? 'ally' : a.team === b.team ? 'ally' : 'enemy';
    }
    relations[a.id] = row;
  }
  return relations;
}

export function initMatch(registry: Registry, config: MatchConfig): InitializedMatch {
  const map = registry.map(config.mapId);
  const services = createServices(registry, config.mapId);
  const tileCount = map.tileW * map.tileH;

  const players = config.players.map((c) => makePlayer(c, registry.balance.startingMana, tileCount));
  const state: GameState = {
    tick: 0,
    seed: config.seed >>> 0,
    rng: Object.fromEntries(RNG_STREAMS.map((s) => [s, streamFor(config.seed >>> 0, s).state()])),
    players,
    relations: buildRelations(players),
    entities: new EntityStore(),
    nextEntityId: 1,
    mapId: config.mapId,
    winnerTeam: null,
    ended: false,
    beams: [],
    oneSuperweaponPerPlayer: config.oneSuperweaponPerPlayer ?? true,
  };
  state.entities.setOwners(players.map((p) => p.id));

  // Mana nodes. The balance cap applies to every map's authored amount (v1 behaviour).
  const nodeCap = registry.balance.manaNodeCapacity;
  for (const node of map.manaNodes) {
    const amount = Math.min(node.amount, nodeCap);
    state.entities.spawnResourceNode(state.nextEntityId++, node.x, node.y, TILE * 0.9, amount);
  }

  // Starting base: one Sanctum + two Wisps per player.
  const ctx: StepContext = { services, events: [] };
  for (const p of players) {
    const cfg = config.players.find((c) => c.id === p.id)!;
    const start = map.startLocations[cfg.startIndex] ?? map.startLocations[0]!;
    const sanctumSlot = spawnBuildingAt(state, services, 'sanctum', p.id, start.x, start.y, { complete: true }, ctx);
    if (sanctumSlot >= 0) {
      applyBuildingNav(state, services, sanctumSlot);
      unlockTech(state, p.id, 'sanctum');
    }
    spawnUnitAt(state, services, 'wisp', p.id, start.x - TILE * 2, start.y + TILE * 2, ctx);
    spawnUnitAt(state, services, 'wisp', p.id, start.x + TILE * 2, start.y + TILE * 2, ctx);
  }

  recomputePower(state, registry);
  visibilitySystem(state, registry, services.nav);
  return { state, services };
}
