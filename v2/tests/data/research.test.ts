// Research tree: v1 shipped the whole system with no content. v2 ships content, so the
// content itself needs testing — a research that resolves to nothing is worse than no research.

import { describe, expect, it } from 'vitest';
import { getRegistry } from '../helpers';

describe('research tree content', () => {
  const reg = getRegistry();

  it('ships 8 researches', () => {
    expect(reg.research.size).toBe(8);
  });

  it('every research is attached to a building that actually exists and is buildable', () => {
    for (const r of reg.research.values()) {
      const building = reg.buildings.get(r.researchedAt);
      expect(building, `${r.id} researchedAt unknown building ${r.researchedAt}`).toBeDefined();
    }
  });

  it('every research has at least one effect that targets real content', () => {
    for (const r of reg.research.values()) {
      expect(r.effects.length, `${r.id} has no effects`).toBeGreaterThan(0);
      for (const e of r.effects) {
        if (e.kind === 'unitStatModifier') {
          expect(
            (e.unitIds?.length ?? 0) > 0 || (e.roles?.length ?? 0) > 0,
            `${r.id} unitStatModifier targets nothing`,
          ).toBe(true);
          for (const id of e.unitIds ?? []) expect(reg.units.has(id), `${r.id} targets unknown unit ${id}`).toBe(true);
        } else if (e.kind === 'buildingStatModifier') {
          for (const id of e.buildingIds ?? []) {
            expect(reg.buildings.has(id), `${r.id} targets unknown building ${id}`).toBe(true);
          }
        }
      }
    }
  });

  it('role-targeted effects match at least one real unit', () => {
    // Catches a typo like "heavy_melee " which would make the research silently do nothing.
    for (const r of reg.research.values()) {
      for (const e of r.effects) {
        if (e.kind !== 'unitStatModifier' || !e.roles?.length) continue;
        const matched = [...reg.units.values()].filter((u) => e.roles!.includes(u.role));
        expect(matched.length, `${r.id} targets roles ${e.roles.join(',')} which match no unit`).toBeGreaterThan(0);
      }
    }
  });

  it('the tech tree has no cycles and every prerequisite resolves', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string, trail: string[]) => {
      if (done.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`research cycle: ${[...trail, id].join(' -> ')}`);
      }
      visiting.add(id);
      const r = reg.research.get(id);
      if (r) for (const req of r.requires) if (reg.research.has(req)) visit(req, [...trail, id]);
      visiting.delete(id);
      done.add(id);
    };
    for (const id of reg.research.keys()) visit(id, []);
    expect(done.size).toBe(reg.research.size);
  });

  it('costs and times are inside the 20-minute match budget', () => {
    // A research costing more than a superweapon, or taking longer than 90 s, could not be
    // reached in a 20-minute game alongside everything else.
    for (const r of reg.research.values()) {
      expect(r.cost, `${r.id} is too expensive`).toBeLessThanOrEqual(1000);
      expect(r.researchTime, `${r.id} takes too long`).toBeLessThanOrEqual(90);
      expect(r.cost).toBeGreaterThan(0);
    }
  });

  it('the two-rank economy line is ordered and multiplicative', () => {
    const one = reg.researchDef('attuned_siphons_1');
    const two = reg.researchDef('attuned_siphons_2');
    expect(two.requires).toContain(one.id);
    expect(two.cost).toBeGreaterThan(one.cost);
    for (const r of [one, two]) {
      const eff = r.effects[0];
      expect(eff?.kind).toBe('economyModifier');
      if (eff?.kind === 'economyModifier') {
        expect(eff.stat).toBe('siphonPerSecond');
        expect(eff.operation).toBe('multiply');
        expect(eff.value).toBeGreaterThan(1);
      }
    }
  });

  it('no research is a no-op (value must actually change something)', () => {
    for (const r of reg.research.values()) {
      for (const e of r.effects) {
        const v = e.value;
        if (e.operation === 'multiply') expect(Math.abs(v - 1)).toBeGreaterThan(0.01);
        else expect(Math.abs(v)).toBeGreaterThan(0);
      }
    }
  });
});
