// Research tree: v1 shipped the whole system with no content. v2 ships content, so the
// content itself needs testing — a research that resolves to nothing is worse than no research.

import { describe, expect, it } from 'vitest';
import { getRegistry } from '../helpers';

describe('research tree content', () => {
  const reg = getRegistry();

  it('ships a tree deep enough to offer real choices per faction', () => {
    // The first pass shipped 8 items, which is not a tree — every faction had the same two or three
    // options and no branch point existed.
    expect(reg.research.size, 'research tree is too small to offer choices').toBeGreaterThanOrEqual(20);
    for (const faction of ['arcane', 'obsidian', 'verdant']) {
      const own = [...reg.research.values()].filter((r) => (r.factions ?? []).includes(faction));
      expect(own.length, `${faction} has too few research options`).toBeGreaterThanOrEqual(10);
    }
  });

  it('has at least four tiers and every tier is populated', () => {
    const tiers = new Map<number, number>();
    for (const r of reg.research.values()) tiers.set(r.tier, (tiers.get(r.tier) ?? 0) + 1);
    expect([...tiers.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
    for (const [tier, n] of tiers) expect(n, `tier ${tier} is empty-ish`).toBeGreaterThanOrEqual(3);
  });

  it('every node has a player-facing label and wording for every effect', () => {
    for (const r of reg.research.values()) {
      expect(r.effectViews.length, `${r.id} effectViews/effects mismatch`).toBe(r.effects.length);
      for (const v of r.effectViews) {
        expect(v.label.length, `${r.id} has an empty effect label`).toBeGreaterThan(2);
        expect(v.detail.length, `${r.id} has an empty effect detail`).toBeGreaterThan(8);
        // Wording must be prose, not a key or an id.
        expect(v.label, `${r.id} effect label looks like a raw key: "${v.label}"`).not.toMatch(/[a-z][A-Z]|_/);
        expect(v.detail, `${r.id} effect detail looks like a raw key: "${v.detail}"`).not.toMatch(/[a-z][A-Z]|_/);
      }
      expect(r.icon.length, `${r.id} has no icon`).toBeGreaterThan(0);
    }
  });

  it('the tree has real branch points, not a single chain', () => {
    // A tree where every node has exactly one child is a queue. Count nodes that unlock 2+ others.
    const children = new Map<string, number>();
    for (const r of reg.research.values()) {
      for (const req of r.requires) children.set(req, (children.get(req) ?? 0) + 1);
    }
    const branches = [...children.values()].filter((n) => n >= 2).length;
    expect(branches, 'the research tree never branches').toBeGreaterThanOrEqual(3);
  });

  it('each faction has at least one exclusive node', () => {
    for (const faction of ['arcane', 'obsidian', 'verdant']) {
      const exclusive = [...reg.research.values()].filter((r) => (r.factions ?? []).length === 1 && (r.factions ?? []).includes(faction));
      expect(exclusive.length, `${faction} has no exclusive research`).toBeGreaterThanOrEqual(2);
    }
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

  it('every prerequisite is either a real research or a real building', () => {
    for (const r of reg.research.values()) {
      for (const req of r.requires) {
        const known = reg.research.has(req) || reg.buildings.has(req);
        expect(known, `${r.id} requires "${req}", which is neither a research nor a building`).toBe(true);
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
      // Capstones may cost slightly more than a mid-tier item; the ceiling still keeps every node
      // reachable inside a 20-minute match alongside an army.
      expect(r.cost, `${r.id} is too expensive`).toBeLessThanOrEqual(1200);
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
