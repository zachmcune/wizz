import { describe, expect, it } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import {
  applyAttackFxBursts,
  attackFiredBursts,
  attackFxForEntity,
  attackFxFromArt,
  attackHitBursts,
  attackPose,
  type AttackFxBurst,
} from '../src/render/attack-fx';
import { worldFacingToScreen } from '../src/render/effects';

const reg = getRegistry();

function kinds(bursts: AttackFxBurst[]): string[] {
  return bursts.map((b) => b.kind);
}

function coreKinds(bursts: AttackFxBurst[]): string[] {
  return bursts.filter((b) => !b.decorative).map((b) => b.kind);
}

describe('attack tells (Phase 1)', () => {
  it('is data-driven from art.attackFx, not hardcoded unit ids', () => {
    expect(attackFxFromArt(reg.unit('imp_swarmling').art)).toBe('lunge_slash');
    expect(attackFxFromArt(reg.unit('arcane_archer').art)).toBe('bolt');
    expect(attackFxFromArt(reg.unit('stone_golem').art)).toBe('slam');
    expect(reg.unit('rift_familiar').art.attackFx).toBeUndefined();
  });

  it('leaves melee combat projectile-less and does not change weapon numbers', () => {
    const imp = reg.unit('imp_swarmling');
    const golem = reg.unit('stone_golem');
    const archer = reg.unit('arcane_archer');
    expect(imp.weapon?.projectile).toBeNull();
    expect(golem.weapon?.projectile).toBeNull();
    expect(archer.weapon?.projectile).toBe('arcane_bolt');
    expect(imp.weapon?.cooldownTicks).toBe(8);
    expect(golem.weapon?.cooldownTicks).toBe(20);
    expect(archer.weapon?.cooldownTicks).toBe(18);
    expect(imp.weapon?.damage).toBe(12);
    expect(golem.weapon?.damage).toBe(40);
    expect(archer.weapon?.damage).toBe(16);
  });

  it('maps each troop to a distinct hit tell', () => {
    const facing = 0;
    const imp = coreKinds(attackHitBursts('lunge_slash', facing));
    const bolt = coreKinds(attackHitBursts('bolt', facing));
    const slam = coreKinds(attackHitBursts('slam', facing));
    expect(imp).toContain('strike');
    expect(imp).not.toContain('shockwave');
    expect(bolt).toContain('flash');
    expect(bolt).not.toContain('strike');
    expect(bolt).not.toContain('shockwave');
    expect(slam).toContain('shockwave');
    expect(slam).not.toContain('strike');
    expect(new Set([...imp, ...bolt, ...slam]).size).toBeGreaterThan(2);
    expect(kinds(attackFiredBursts('bolt', facing))).toContain('flash');
    expect(kinds(attackFiredBursts('lunge_slash', facing))).not.toContain('shockwave');
  });

  it('does not use the generic white ping as the melee or slam hit', () => {
    const generic = { kind: 'flash', color: 0xffffff, radius: 5 };
    for (const kind of ['lunge_slash', 'bolt', 'slam'] as const) {
      const hits = attackHitBursts(kind, 0.4);
      expect(hits.some((b) => b.kind === generic.kind && b.color === generic.color && b.radius === generic.radius)).toBe(false);
    }
  });

  it('drops decorative particles on Low density but keeps the three tells', () => {
    const spawned: AttackFxBurst[] = [];
    const sink = {
      spawn(kind: AttackFxBurst['kind'], _x: number, _y: number, color: number, radius: number) {
        spawned.push({ kind, color, radius });
      },
    };
    applyAttackFxBursts(sink, attackHitBursts('lunge_slash', 0), 0, 0, 0, 0.25);
    applyAttackFxBursts(sink, attackHitBursts('bolt', 0), 0, 0, 0, 0.25);
    applyAttackFxBursts(sink, attackHitBursts('slam', 0), 0, 0, 0, 0.25);
    const coreCount =
      coreKinds(attackHitBursts('lunge_slash', 0)).length +
      coreKinds(attackHitBursts('bolt', 0)).length +
      coreKinds(attackHitBursts('slam', 0)).length;
    expect(spawned).toHaveLength(coreCount);
    expect(kinds(spawned)).toContain('strike');
    expect(kinds(spawned)).toContain('flash');
    expect(kinds(spawned)).toContain('shockwave');
  });

  it('lunges the imp toward facing right after a swing', () => {
    const pose = attackPose('lunge_slash', 0, 8, 8);
    expect(pose.dx).toBeGreaterThan(4);
    expect(pose.dy).toBeCloseTo(0, 5);
    const recovered = attackPose('lunge_slash', 0, 1, 8);
    expect(recovered.dx).toBe(0);
  });

  it('winds the golem up before the slam and plants it after', () => {
    const windup = attackPose('slam', 0, 4, 20);
    expect(windup.dx).toBeLessThan(0);
    expect(windup.lift).toBeGreaterThan(0);
    const slam = attackPose('slam', 0, 20, 20);
    expect(slam.dx).toBeGreaterThan(0);
    expect(slam.lift).toBeLessThan(0);
    const idle = attackPose('slam', 0, 0, 20);
    expect(idle.dx).toBe(0);
    expect(idle.lift).toBe(0);
  });

  it('projects facing into a dimetric screen direction', () => {
    const east = worldFacingToScreen(0);
    expect(east.x).toBeGreaterThan(0);
    expect(Math.hypot(east.x, east.y)).toBeCloseTo(1, 5);
  });
});

describe('melee fire stays instant in the sim', () => {
  it('imp and golem attacks emit attackFired without spawning a projectile', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const dummy = spawnEntity(state, services, null, 'stone_golem', 'player1', 720, 700);
    const imp = spawnEntity(state, services, null, 'imp_swarmling', 'player0', 700, 700);
    sim.enqueueNow([{ type: 'attack', playerId: 'player0', entityIds: [imp.id], targetId: dummy.id }]);

    let fired = false;
    for (let i = 0; i < 40; i++) {
      const { events } = sim.step();
      if (events.some((e) => e.type === 'attackFired' && e.sourceId === imp.id)) fired = true;
      const projs = [...state.entities.values()].filter((e) => e.kind === 'projectile');
      expect(projs).toHaveLength(0);
    }
    expect(fired).toBe(true);
    expect(attackFxForEntity(reg, imp)).toBe('lunge_slash');
  });

  it('archer attacks spawn an arcane_bolt projectile', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const dummy = spawnEntity(state, services, null, 'stone_golem', 'player1', 820, 700);
    const archer = spawnEntity(state, services, null, 'arcane_archer', 'player0', 700, 700);
    sim.enqueueNow([{ type: 'attack', playerId: 'player0', entityIds: [archer.id], targetId: dummy.id }]);

    let sawBolt = false;
    for (let i = 0; i < 40; i++) {
      sim.step();
      if ([...state.entities.values()].some((e) => e.kind === 'projectile' && e.defId === 'arcane_bolt')) {
        sawBolt = true;
        break;
      }
    }
    expect(sawBolt).toBe(true);
    expect(reg.projectile('arcane_bolt').art.trail).toBe(true);
    expect(attackFxForEntity(reg, archer)).toBe('bolt');
  });
});
