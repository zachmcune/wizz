// Headless 2.5D gallery vignette setup — shared by defense and troop live previews.
import { TILE } from '../core/constants';
import type { Registry } from '../data/registry';
import type { UnitDef } from '../data/defs';
import type { BuildingEntity, ResourceNodeEntity, UnitEntity } from '../sim/entity-types';
import { initMatch, recomputePower, spawnEntity, unlockTech } from '../sim/factory';
import { setGarrisonedIn, ensureGarrisonHost } from '../sim/capabilities';
import { Simulation } from '../sim/simulation';
import { visibilitySystem } from '../sim/systems/visibility';
import type { StepContext } from '../sim/context';
import type { EntityId, GameState, PlayerId } from '../sim/types';

/** Open meadow — away from the center mana node at (2064, 1424). */
export const PREVIEW_FOCUS_X = 2384;
export const PREVIEW_FOCUS_Y = 1184;
export const PREVIEW_DEFENDER: PlayerId = 'player0';
export const PREVIEW_ATTACKER: PlayerId = 'player1';
export const PREVIEW_RESET_TICKS = 360;

export type GalleryPreviewSubject = 'unit' | 'building';
export type PreviewKind = 'combat' | 'heal' | 'garrison' | 'harvest' | 'channel' | 'deploy' | 'move';

export interface PreviewScenario {
  subject: GalleryPreviewSubject;
  kind: PreviewKind;
  caption: string;
  attackerUnit?: string;
  attackerCount?: number;
  attackerDx?: number;
  attackerDy?: number;
  attackerSpacing?: number;
  dummyDefId?: string;
  dummyKind?: 'unit' | 'building';
  dummyCount?: number;
  dummyDx?: number;
  dummyDy?: number;
  dummySpacing?: number;
  deployAs?: string;
  moveDx?: number;
  moveDy?: number;
}

interface DefenseScenarioSpec {
  kind: 'combat' | 'heal' | 'garrison';
  caption: string;
  attackerUnit: string;
  attackerCount: number;
  attackerDx: number;
  attackerDy: number;
  attackerSpacing: number;
}

const DEFENSE_SCENARIOS: Record<string, DefenseScenarioSpec> = {
  arcane_sentry: { kind: 'combat', caption: 'Arcane Sentry firing rapid arcane bolts at advancing heavy troops.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 170, attackerDy: 0, attackerSpacing: 48 },
  frost_spire: { kind: 'combat', caption: 'Frost Spire channeling a freezing energy stream.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 170, attackerDy: 0, attackerSpacing: 48 },
  inferno_beacon: { kind: 'combat', caption: 'Inferno Beacon sweeping a continuous flamethrower through a swarm.', attackerUnit: 'imp_swarmling', attackerCount: 4, attackerDx: 150, attackerDy: -20, attackerSpacing: 28 },
  storm_conductor: { kind: 'combat', caption: 'Storm Conductor chaining lightning through heavies.', attackerUnit: 'stone_golem', attackerCount: 3, attackerDx: 165, attackerDy: 0, attackerSpacing: 40 },
  celestial_cannon: { kind: 'combat', caption: 'Celestial Cannon channeling skyfire — rune warning, then devastating impact.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 340, attackerDy: 0, attackerSpacing: 56 },
  sanctuary_spire: { kind: 'heal', caption: 'Sanctuary Spire healing a wounded ally in its ward.', attackerUnit: 'stone_golem', attackerCount: 1, attackerDx: 220, attackerDy: 0, attackerSpacing: 0 },
  arcane_bunker: { kind: 'garrison', caption: 'Arcane Bunker with garrisoned archers firing at attackers.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 175, attackerDy: 0, attackerSpacing: 44 },
  stone_wall: { kind: 'combat', caption: 'Stone Wall holding the line while enemies break against it.', attackerUnit: 'imp_swarmling', attackerCount: 3, attackerDx: 90, attackerDy: 0, attackerSpacing: 24 },
  arcane_gate: { kind: 'combat', caption: 'Arcane Gate blocking the lane while enemies siege it.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 100, attackerDy: 0, attackerSpacing: 36 },
};

const DEFAULT_DEFENSE_SCENARIO: DefenseScenarioSpec = {
  kind: 'combat',
  caption: 'Defense engaging enemy troops in oblique view.',
  attackerUnit: 'stone_golem',
  attackerCount: 2,
  attackerDx: 170,
  attackerDy: 0,
  attackerSpacing: 48,
};

export function isDefenseBuilding(registry: Registry, buildingId: string): boolean {
  return registry.building(buildingId).menuCategory === 'defenses';
}

export function isGalleryPreviewable(registry: Registry, kind: GalleryPreviewSubject, id: string): boolean {
  return kind === 'unit' || isDefenseBuilding(registry, id);
}

export function galleryPreviewHint(scenario: PreviewScenario): string {
  if (scenario.kind === 'harvest') return '▶ Harvest preview';
  if (scenario.kind === 'channel') return '▶ Support preview';
  if (scenario.kind === 'deploy') return '▶ Deploy preview';
  if (scenario.kind === 'move') return '▶ Live preview';
  return '▶ Combat preview';
}

export function galleryPreviewTitleKind(scenario: PreviewScenario): string {
  return scenario.kind === 'combat' || scenario.kind === 'heal' || scenario.kind === 'garrison'
    ? '2.5D combat preview'
    : '2.5D live preview';
}

export function galleryPreviewCardTitle(scenario: PreviewScenario): string {
  if (scenario.subject === 'building') return 'Preview this defense fighting troops in 2.5D';
  switch (scenario.kind) {
    case 'harvest':
      return 'Preview this troop harvesting in 2.5D';
    case 'channel':
      return 'Preview this troop conjuring mana in 2.5D';
    case 'deploy':
      return 'Preview this troop deploying in 2.5D';
    case 'move':
      return 'Preview this troop moving in 2.5D';
    default:
      return 'Preview this troop fighting in 2.5D';
  }
}

function troopCombatLayout(def: UnitDef): Pick<PreviewScenario, 'dummyDefId' | 'dummyKind' | 'dummyCount' | 'dummyDx' | 'dummyDy' | 'dummySpacing'> {
  const w = def.weapon!;
  if (w.targetsGround === false) {
    return {
      dummyDefId: 'rift_skimmer',
      dummyKind: 'unit',
      dummyCount: 2,
      dummyDx: Math.max(70, Math.round(w.range * 0.75)),
      dummyDy: 0,
      dummySpacing: 40,
    };
  }
  const vsBuilding = w.vs.building ?? 0;
  const vsLight = w.vs.light ?? 0;
  const vsHeavy = w.vs.heavy ?? 0;
  if (vsBuilding >= Math.max(vsLight, vsHeavy) * 1.8) {
    return {
      dummyDefId: 'stone_wall',
      dummyKind: 'building',
      dummyCount: 1,
      dummyDx: Math.max(80, Math.min(Math.round(w.range * 0.8), 170)),
      dummyDy: 0,
      dummySpacing: 0,
    };
  }
  const splash = (w.splashRadius ?? 0) > 0 || !!w.preferSwarms;
  const melee = w.range <= 32;
  return {
    dummyDefId: 'imp_swarmling',
    dummyKind: 'unit',
    dummyCount: splash ? 4 : melee ? 3 : 2,
    dummyDx: melee ? 72 : Math.max(70, Math.min(Math.round(w.range * 0.75), 150)),
    dummyDy: splash ? -16 : 0,
    dummySpacing: splash ? 22 : melee ? 28 : 36,
  };
}

function troopScenario(registry: Registry, def: UnitDef): PreviewScenario {
  if (def.isHarvester) {
    return {
      subject: 'unit',
      kind: 'harvest',
      caption: `${def.name} siphoning a mana node and returning to drop off.`,
    };
  }
  if (def.canConjureMana) {
    return {
      subject: 'unit',
      kind: 'channel',
      caption: `${def.name} channeling to conjure mana.`,
    };
  }
  if (def.deploysAs) {
    const campName = registry.buildings.get(def.deploysAs)?.name ?? 'a camp';
    return {
      subject: 'unit',
      kind: 'deploy',
      caption: `${def.name} deploying into a ${campName}.`,
      deployAs: def.deploysAs,
    };
  }
  if (!def.weapon) {
    return {
      subject: 'unit',
      kind: 'move',
      caption: `${def.name} moving across the glade.`,
      moveDx: 160,
      moveDy: 0,
    };
  }
  return {
    subject: 'unit',
    kind: 'combat',
    caption: `${def.name} engaging enemies in oblique view.`,
    ...troopCombatLayout(def),
  };
}

export function previewScenarioFor(
  registry: Registry,
  subject: GalleryPreviewSubject,
  defId: string,
): PreviewScenario {
  if (subject === 'unit') return troopScenario(registry, registry.unit(defId));
  const spec = DEFENSE_SCENARIOS[defId] ?? DEFAULT_DEFENSE_SCENARIO;
  return { subject: 'building', ...spec };
}

function spawnAttackers(
  state: GameState,
  services: StepContext['services'],
  scenario: PreviewScenario,
): EntityId[] {
  const ids: EntityId[] = [];
  const count = scenario.attackerCount ?? 0;
  const unitId = scenario.attackerUnit;
  if (!unitId || count <= 0) return ids;
  for (let i = 0; i < count; i++) {
    const row = i - (count - 1) / 2;
    const u = spawnEntity(
      state,
      services,
      null,
      unitId,
      PREVIEW_ATTACKER,
      PREVIEW_FOCUS_X + (scenario.attackerDx ?? 170),
      PREVIEW_FOCUS_Y + (scenario.attackerDy ?? 0) + row * (scenario.attackerSpacing ?? 48),
    );
    ids.push(u.id);
  }
  return ids;
}

function spawnDummies(
  state: GameState,
  services: StepContext['services'],
  scenario: PreviewScenario,
): EntityId[] {
  const ids: EntityId[] = [];
  const count = scenario.dummyCount ?? 0;
  const dummyId = scenario.dummyDefId;
  if (!dummyId || count <= 0) return ids;
  for (let i = 0; i < count; i++) {
    const row = i - (count - 1) / 2;
    const e = spawnEntity(
      state,
      services,
      null,
      dummyId,
      PREVIEW_ATTACKER,
      PREVIEW_FOCUS_X + (scenario.dummyDx ?? 90),
      PREVIEW_FOCUS_Y + (scenario.dummyDy ?? 0) + row * (scenario.dummySpacing ?? 32),
    );
    ids.push(e.id);
  }
  return ids;
}

function garrisonArchers(state: GameState, services: StepContext['services'], bunker: BuildingEntity): void {
  const archerIds: EntityId[] = [];
  for (const ox of [-36, 36]) {
    const archer = spawnEntity(state, services, null, 'arcane_archer', PREVIEW_DEFENDER, bunker.pos.x + ox, bunker.pos.y + 24) as UnitEntity;
    setGarrisonedIn(archer, bunker.id);
    archer.orders = [];
    archer.state = 'garrisoned';
    archerIds.push(archer.id);
  }
  ensureGarrisonHost(bunker).garrisonedIds = archerIds;
}

function spawnPreviewManaNode(state: GameState, x: number, y: number, amount: number): ResourceNodeEntity {
  const id = state.nextEntityId++;
  const node: ResourceNodeEntity = {
    id,
    owner: 'neutral',
    defId: 'mana_node',
    kind: 'resource_node',
    pos: { x, y },
    vel: { x: 0, y: 0 },
    facing: 0,
    hp: 1,
    maxHp: 1,
    radius: TILE * 0.9,
    amount,
    amountMax: amount,
  };
  state.entities.set(id, node);
  return node;
}

export interface PreviewScene {
  state: GameState;
  services: ReturnType<typeof initMatch>['services'];
  sim: Simulation;
  focusEntityId: EntityId;
  opposingIds: EntityId[];
  scenario: PreviewScenario;
}

function finishScene(
  state: GameState,
  services: ReturnType<typeof initMatch>['services'],
  focusEntityId: EntityId,
  opposingIds: EntityId[],
  scenario: PreviewScenario,
  enqueue: (sim: Simulation) => void,
): PreviewScene {
  recomputePower(state, services);
  const visCtx: StepContext = { services, events: [] };
  visibilitySystem(state, visCtx);
  const sim = new Simulation(state, services);
  sim.setAiEnabled(false);
  enqueue(sim);
  return { state, services, sim, focusEntityId, opposingIds, scenario };
}

function setupDefenseScene(registry: Registry, defenseId: string, teamColor: string, scenario: PreviewScenario): PreviewScene {
  const { state, services } = initMatch(registry, registry.match('skirmish_1v1'));
  const defender = state.players.find((p) => p.id === PREVIEW_DEFENDER);
  if (defender) defender.color = teamColor;

  unlockTech(state, PREVIEW_DEFENDER, 'sanctum');
  unlockTech(state, PREVIEW_DEFENDER, 'ley_conduit');
  unlockTech(state, PREVIEW_DEFENDER, 'arcane_nexus');
  unlockTech(state, PREVIEW_DEFENDER, defenseId);

  spawnEntity(state, services, null, 'ley_conduit', PREVIEW_DEFENDER, PREVIEW_FOCUS_X - 96, PREVIEW_FOCUS_Y + 72);
  spawnEntity(state, services, null, 'ley_conduit', PREVIEW_DEFENDER, PREVIEW_FOCUS_X + 96, PREVIEW_FOCUS_Y + 72);

  const defense = spawnEntity(state, services, null, defenseId, PREVIEW_DEFENDER, PREVIEW_FOCUS_X, PREVIEW_FOCUS_Y);
  if (scenario.kind === 'garrison' && defense.kind === 'building') {
    garrisonArchers(state, services, defense);
  }

  const opposingIds = spawnAttackers(state, services, scenario);

  if (scenario.kind === 'heal') {
    const ally = spawnEntity(state, services, null, 'stone_golem', PREVIEW_DEFENDER, PREVIEW_FOCUS_X + 72, PREVIEW_FOCUS_Y) as UnitEntity;
    ally.hp = Math.max(1, Math.floor(ally.maxHp * 0.55));
  }

  return finishScene(state, services, defense.id, opposingIds, scenario, (sim) => {
    if (scenario.kind !== 'heal' && opposingIds.length) {
      sim.enqueue(0, [{
        type: 'attack',
        playerId: PREVIEW_ATTACKER,
        entityIds: opposingIds,
        targetId: defense.id,
      }]);
    }
  });
}

function setupTroopScene(registry: Registry, unitId: string, teamColor: string, scenario: PreviewScenario): PreviewScene {
  const { state, services } = initMatch(registry, registry.match('skirmish_1v1'));
  const defender = state.players.find((p) => p.id === PREVIEW_DEFENDER);
  if (defender) defender.color = teamColor;

  const featured = spawnEntity(state, services, null, unitId, PREVIEW_DEFENDER, PREVIEW_FOCUS_X, PREVIEW_FOCUS_Y);

  if (scenario.kind === 'harvest') {
    spawnEntity(state, services, null, 'attunement_spire', PREVIEW_DEFENDER, PREVIEW_FOCUS_X - 96, PREVIEW_FOCUS_Y);
    const node = spawnPreviewManaNode(state, PREVIEW_FOCUS_X + 80, PREVIEW_FOCUS_Y, registry.balance.manaNodeCapacity);
    return finishScene(state, services, featured.id, [node.id], scenario, (sim) => {
      sim.enqueue(0, [{
        type: 'harvest',
        playerId: PREVIEW_DEFENDER,
        entityIds: [featured.id],
        nodeId: node.id,
      }]);
    });
  }

  if (scenario.kind === 'channel') {
    return finishScene(state, services, featured.id, [], scenario, (sim) => {
      sim.enqueue(0, [{
        type: 'channel',
        playerId: PREVIEW_DEFENDER,
        entityIds: [featured.id],
        enabled: true,
      }]);
    });
  }

  if (scenario.kind === 'deploy') {
    return finishScene(state, services, featured.id, [], scenario, (sim) => {
      sim.enqueue(0, [{
        type: 'deploy',
        playerId: PREVIEW_DEFENDER,
        entityId: featured.id,
        x: PREVIEW_FOCUS_X,
        y: PREVIEW_FOCUS_Y,
      }]);
    });
  }

  if (scenario.kind === 'move') {
    const tx = PREVIEW_FOCUS_X + (scenario.moveDx ?? 160);
    const ty = PREVIEW_FOCUS_Y + (scenario.moveDy ?? 0);
    return finishScene(state, services, featured.id, [], scenario, (sim) => {
      sim.enqueue(0, [{
        type: 'move',
        playerId: PREVIEW_DEFENDER,
        entityIds: [featured.id],
        x: tx,
        y: ty,
      }]);
    });
  }

  const opposingIds = spawnDummies(state, services, scenario);
  return finishScene(state, services, featured.id, opposingIds, scenario, (sim) => {
    if (opposingIds.length) {
      sim.enqueue(0, [{
        type: 'attack',
        playerId: PREVIEW_DEFENDER,
        entityIds: [featured.id],
        targetId: opposingIds[0]!,
      }]);
    }
  });
}

export function setupPreviewScene(
  registry: Registry,
  subject: GalleryPreviewSubject,
  defId: string,
  teamColor: string,
): PreviewScene {
  const scenario = previewScenarioFor(registry, subject, defId);
  return subject === 'unit'
    ? setupTroopScene(registry, defId, teamColor, scenario)
    : setupDefenseScene(registry, defId, teamColor, scenario);
}

export function previewShouldReset(
  state: GameState,
  scenario: PreviewScenario,
  focusEntityId: EntityId,
  opposingIds: EntityId[],
  ticksSinceReset: number,
): boolean {
  if (ticksSinceReset >= PREVIEW_RESET_TICKS) return true;
  const focus = state.entities.get(focusEntityId);
  if (scenario.kind === 'deploy') {
    if (focus && focus.hp > 0) return false;
    if (scenario.deployAs) {
      for (const e of state.entities.values()) {
        if (e.owner === PREVIEW_DEFENDER && e.defId === scenario.deployAs && e.hp > 0) return false;
      }
    }
    return true;
  }
  if (!focus || focus.hp <= 0) return true;
  if (scenario.kind === 'heal' || scenario.kind === 'harvest' || scenario.kind === 'channel' || scenario.kind === 'move') {
    return false;
  }
  const anyOpposing = opposingIds.some((id) => {
    const u = state.entities.get(id);
    return u && u.hp > 0;
  });
  return !anyOpposing;
}
