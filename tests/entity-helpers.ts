import { expect } from 'vitest';
import type { BuildingEntity, UnitEntity } from '../src/sim/entity-types';
import type { Entity } from '../src/sim/types';

export function expectBuilding(e: Entity): BuildingEntity {
  expect(e.kind).toBe('building');
  if (e.kind !== 'building') throw new Error('expected building entity');
  return e;
}

export function expectUnit(e: Entity): UnitEntity {
  expect(e.kind).toBe('unit');
  if (e.kind !== 'unit') throw new Error('expected unit entity');
  return e;
}
