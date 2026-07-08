import { describe, it, expect } from 'vitest';
import { circlesOverlap, isUnitOccludedByBuilding, filterOccludedUnits } from '../src/render/unit-occlusion';

describe('unit occlusion outlines', () => {
  it('detects overlap between screen-space circles', () => {
    expect(circlesOverlap(0, 0, 10, 15, 0, 10)).toBe(true);
    expect(circlesOverlap(0, 0, 5, 20, 0, 5)).toBe(false);
  });

  it('marks a unit occluded when a deeper building overlaps it', () => {
    const unit = { x: 100, y: 100, radius: 10, depth: 10 };
    const building = { x: 102, y: 102, radius: 24, depth: 20 };
    expect(isUnitOccludedByBuilding(unit, [building])).toBe(true);
  });

  it('ignores buildings that are behind the unit', () => {
    const unit = { x: 100, y: 100, radius: 10, depth: 20 };
    const building = { x: 102, y: 102, radius: 24, depth: 10 };
    expect(isUnitOccludedByBuilding(unit, [building])).toBe(false);
  });

  describe('filterOccludedUnits', () => {
    const building = { x: 102, y: 102, radius: 24, depth: 20 };

    it('returns only the units hidden behind a deeper building', () => {
      const hidden = { id: 'a', x: 100, y: 100, radius: 10, depth: 10 };
      const inFront = { id: 'b', x: 100, y: 100, radius: 10, depth: 30 };
      const clear = { id: 'c', x: 400, y: 400, radius: 10, depth: 10 };
      const result = filterOccludedUnits([hidden, inFront, clear], [building]);
      expect(result.map((u) => u.id)).toEqual(['a']);
    });

    it('returns empty when there are no buildings', () => {
      const hidden = { id: 'a', x: 100, y: 100, radius: 10, depth: 10 };
      expect(filterOccludedUnits([hidden], [])).toEqual([]);
    });
  });
});
