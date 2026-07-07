import type { Registry } from '../../data/registry';
import type { BuildingDef } from '../../data/defs';
import type { TrainMenuCategory } from '../../data/defs';
import type { BuildingEntity } from '../../sim/entity-types';
import type { GameState, PlayerId } from '../../sim/types';
import { buildingHasPower, isPowerShort } from '../../sim/views';

export interface ProducerInfo {
  entity: BuildingEntity;
  def: BuildingDef;
  label: string;
  queueLength: number;
  offline: boolean;
  slow: boolean;
}

export function isProducerReady(entity: BuildingEntity): boolean {
  return entity.buildProgress === undefined && entity.morphProgress === undefined;
}

function producerIndex(state: GameState, entity: BuildingEntity): number {
  const peers = [...state.entities.values()]
    .filter(
      (e) =>
        e.owner === entity.owner &&
        e.kind === 'building' &&
        e.defId === entity.defId &&
        e.state !== 'dead' &&
        isProducerReady(e),
    )
    .sort((a, b) => a.id - b.id);
  return peers.findIndex((e) => e.id === entity.id) + 1;
}

export function producerLabel(registry: Registry, state: GameState, entity: BuildingEntity): string {
  const def = registry.building(entity.defId);
  return `${def.shortLabel} #${producerIndex(state, entity)}`;
}

function toProducerInfo(
  state: GameState,
  registry: Registry,
  playerId: PlayerId,
  entity: BuildingEntity,
): ProducerInfo {
  const def = registry.building(entity.defId);
  return {
    entity,
    def,
    label: producerLabel(registry, state, entity),
    queueLength: entity.productionQueue?.length ?? 0,
    offline: !buildingHasPower(state, registry, entity),
    slow: isPowerShort(state, playerId) && buildingHasPower(state, registry, entity),
  };
}

export function listProducersForUnit(
  state: GameState,
  registry: Registry,
  playerId: PlayerId,
  unitDefId: string,
): ProducerInfo[] {
  const out: ProducerInfo[] = [];
  for (const entity of state.entities.values()) {
    if (entity.owner !== playerId || entity.kind !== 'building' || entity.state === 'dead') continue;
    if (!isProducerReady(entity)) continue;
    const bdef = registry.building(entity.defId);
    if (!bdef.producesUnits?.includes(unitDefId)) continue;
    out.push(toProducerInfo(state, registry, playerId, entity));
  }
  return out.sort((a, b) => a.entity.id - b.entity.id);
}

export function listProducersForCategory(
  state: GameState,
  registry: Registry,
  playerId: PlayerId,
  category: TrainMenuCategory,
): ProducerInfo[] {
  const unitIds = new Set<string>();
  for (const [, udef] of registry.units) {
    if (udef.menuCategory === category) unitIds.add(udef.id);
  }
  const seen = new Set<number>();
  const out: ProducerInfo[] = [];
  for (const entity of state.entities.values()) {
    if (entity.owner !== playerId || entity.kind !== 'building' || entity.state === 'dead') continue;
    if (!isProducerReady(entity)) continue;
    const bdef = registry.building(entity.defId);
    if (!bdef.producesUnits?.some((uid) => unitIds.has(uid))) continue;
    if (seen.has(entity.id)) continue;
    seen.add(entity.id);
    out.push(toProducerInfo(state, registry, playerId, entity));
  }
  return out.sort((a, b) => a.entity.id - b.entity.id);
}

export function leastBusyProducer(producers: ProducerInfo[]): ProducerInfo | null {
  if (!producers.length) return null;
  return producers.reduce((best, p) => (p.queueLength < best.queueLength ? p : best));
}

export function trainCategoryForBuilding(registry: Registry, buildingDefId: string): TrainMenuCategory | null {
  const bdef = registry.building(buildingDefId);
  const firstUnit = bdef.producesUnits?.[0];
  if (!firstUnit) return null;
  return registry.unit(firstUnit).menuCategory;
}
