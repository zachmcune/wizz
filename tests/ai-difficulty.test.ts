import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity, unlockTech, recomputePower } from '../src/sim/factory';
import { hashState } from '../src/sim/hash';
import { runHeadless } from '../src/testing/headless';
import { TILE } from '../src/core/constants';
import { AI_DIFFICULTY_HINTS, difficultyProfile } from '../src/ai/difficulty';
import { roll } from '../src/ai/chance';
import { strategyForPlayer } from '../src/ai/strategies/registry';
import {
  channelWeavers,
  decideCombat,
  decideSpells,
  fleeThreatenedWorkers,
  produceArmy,
  repairOwnBuildings,
  trainWeavers,
} from '../src/ai/behaviors';
import { decideExpansion } from '../src/ai/expand';
import { findSanctum, isArmyUnit } from '../src/ai/shared';
import type { AiDecisionContext } from '../src/ai/strategies/types';
import type { Command, MatchConfig } from '../src/sim/types';

const reg = getRegistry();

function aiSkirmish(difficulty: 'easy' | 'normal' | 'hard', seed = 11): MatchConfig {
  return {
    mapId: 'duel_glade',
    seed,
    players: [
      { id: 'player0', controller: 'human', team: 0, color: '#4f9dff', startIndex: 0 },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: difficulty },
    ],
  };
}

function makeCtx(difficulty: 'easy' | 'normal' | 'hard'): {
  ctx: AiDecisionContext;
  cmds: Command[];
} {
  const { state, services } = initMatch(reg, aiSkirmish(difficulty));
  const player = state.players.find((p) => p.id === 'player1')!;
  const cmds: Command[] = [];
  return {
    cmds,
    ctx: {
      state,
      services,
      player,
      difficulty: services.registry.balance.ai[difficulty],
      profile: difficultyProfile(difficulty),
      cmds,
      skipCombat: false,
    },
  };
}

describe('AI difficulty profiles', () => {
  it('makes Easy, Normal, and Hard play differently', () => {
    const easy = difficultyProfile('easy');
    const normal = difficultyProfile('normal');
    const hard = difficultyProfile('hard');

    expect(easy.weaverTarget).toBe(0);
    expect(easy.airTarget).toBe(0);
    expect(easy.missChance).toBeGreaterThan(normal.missChance);
    expect(easy.waveFraction).toBeLessThan(normal.waveFraction);
    expect(easy.repair).toBe(false);
    expect(easy.utilitySpells).toBe(false);
    expect(easy.harass).toBe(false);
    expect(easy.intel).toBe('probe');

    expect(normal.weaverTarget).toBeGreaterThan(0);
    expect(normal.scout).toBe(true);
    expect(normal.repair).toBe(true);
    expect(normal.utilitySpells).toBe(true);
    expect(normal.intel).toBe('memory');

    expect(hard.weaverTarget).toBeGreaterThan(normal.weaverTarget);
    expect(hard.airTarget).toBeGreaterThan(normal.airTarget);
    expect(hard.missChance).toBe(0);
    expect(hard.blinkSiege).toBe(true);
    expect(hard.repairAll).toBe(true);
    expect(hard.intel).toBe('omniscient');
    expect(hard.waveFraction).toBeGreaterThan(normal.waveFraction);
    expect(easy.attackAxes).toBe(1);
    expect(normal.attackAxes).toBe(2);
    expect(hard.attackAxes).toBe(3);
    expect(easy.expandCamps).toBe(0);
    expect(normal.expandCamps).toBeGreaterThan(0);
    expect(hard.expandCamps).toBeGreaterThan(normal.expandCamps);
    expect(hard.extraFactories).toBeGreaterThan(normal.extraFactories);
  });

  it('exposes lobby hints for every difficulty', () => {
    expect(AI_DIFFICULTY_HINTS.easy).toMatch(/dribbled|learning/i);
    expect(AI_DIFFICULTY_HINTS.normal).toMatch(/meteor|waves/i);
    expect(AI_DIFFICULTY_HINTS.hard).toMatch(/spellbook|relentless/i);
  });

  it('rolls sloppy-play misses deterministically', () => {
    expect(roll(40, 'player1', 'produce', 1)).toBe(true);
    expect(roll(40, 'player1', 'produce', 0)).toBe(false);
    expect(roll(40, 'player1', 'produce', 0.5)).toBe(roll(40, 'player1', 'produce', 0.5));
    const samples = [8, 16, 24, 32, 40, 48, 56, 64].map((tick) => roll(tick, 'player1', 'produce', 0.5));
    expect(new Set(samples).size).toBeGreaterThan(1);
  });
});

describe('AI difficulty behaviors', () => {
  it('Easy never trains Mana Weavers; Hard does once a vault is up', () => {
    const easy = makeCtx('easy');
    const hard = makeCtx('hard');

    for (const pack of [easy, hard]) {
      const { ctx } = pack;
      const sanctum = findSanctum(ctx.state, ctx.player.id)!;
      spawnEntity(ctx.state, ctx.services, null, 'ley_conduit', ctx.player.id, sanctum.pos.x + TILE * 5, sanctum.pos.y);
      spawnEntity(ctx.state, ctx.services, null, 'resonance_vault', ctx.player.id, sanctum.pos.x + TILE * 8, sanctum.pos.y);
      unlockTech(ctx.state, ctx.player.id, 'ley_conduit');
      unlockTech(ctx.state, ctx.player.id, 'resonance_vault');
      ctx.player.mana = 2000;
      recomputePower(ctx.state, ctx.services);
      trainWeavers(ctx, strategyForPlayer(ctx.player).config, 8);
    }

    expect(easy.cmds.some((c) => c.type === 'produce' && c.defId === 'mana_weaver')).toBe(false);
    expect(hard.cmds.some((c) => c.type === 'produce' && c.defId === 'mana_weaver')).toBe(true);
  });

  it('Hard channels idle weavers instead of sending them with the army', () => {
    const { ctx, cmds } = makeCtx('hard');
    const sanctum = findSanctum(ctx.state, ctx.player.id)!;
    spawnEntity(ctx.state, ctx.services, null, 'mana_weaver', ctx.player.id, sanctum.pos.x + 20, sanctum.pos.y);
    for (let i = 0; i < 8; i++) {
      spawnEntity(
        ctx.state,
        ctx.services,
        null,
        'imp_swarmling',
        ctx.player.id,
        sanctum.pos.x - TILE * (3 + i),
        sanctum.pos.y,
      );
    }
    const config = strategyForPlayer(ctx.player).config;
    channelWeavers(ctx, config, sanctum);
    expect(cmds.some((c) => c.type === 'channel' && c.enabled)).toBe(true);

    cmds.length = 0;
    const army = [...ctx.state.entities.values()].filter((e) => isArmyUnit(ctx.services.registry, e));
    decideCombat(ctx, config, sanctum, army);
    const weaver = [...ctx.state.entities.values()].find((e) => e.defId === 'mana_weaver')!;
    for (const c of cmds) {
      if (c.type === 'attack' || c.type === 'attackMove' || c.type === 'move') {
        expect(c.entityIds).not.toContain(weaver.id);
      }
    }
  });

  it('Normal and Hard repair a battered HQ; Easy does not', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const { ctx, cmds } = makeCtx(difficulty);
      const sanctum = findSanctum(ctx.state, ctx.player.id)!;
      sanctum.hp = Math.floor(sanctum.maxHp * 0.4);
      ctx.player.mana = 800;
      repairOwnBuildings(ctx);
      const repaired = cmds.some((c) => c.type === 'setRepair' && c.buildingId === sanctum.id && c.enabled);
      expect(repaired).toBe(difficulty !== 'easy');
    }
  });

  it('Hard pulls threatened wisps home', () => {
    const { ctx, cmds } = makeCtx('hard');
    const sanctum = findSanctum(ctx.state, ctx.player.id)!;
    const wisp = [...ctx.state.entities.values()].find((e) => e.owner === ctx.player.id && e.defId === 'wisp')!;
    spawnEntity(ctx.state, ctx.services, null, 'imp_swarmling', 'player0', wisp.pos.x + 20, wisp.pos.y);
    fleeThreatenedWorkers(ctx, sanctum);
    expect(cmds.some((c) => c.type === 'move' && c.entityIds.includes(wisp.id))).toBe(true);
  });

  it('Easy leaves threatened wisps on the node', () => {
    const { ctx, cmds } = makeCtx('easy');
    const sanctum = findSanctum(ctx.state, ctx.player.id)!;
    const wisp = [...ctx.state.entities.values()].find((e) => e.owner === ctx.player.id && e.defId === 'wisp')!;
    spawnEntity(ctx.state, ctx.services, null, 'imp_swarmling', 'player0', wisp.pos.x + 20, wisp.pos.y);
    fleeThreatenedWorkers(ctx, sanctum);
    expect(cmds.filter((c) => c.type === 'move')).toHaveLength(0);
  });

  it('Hard drops Meteor Storm on a clumped army', () => {
    const { ctx, cmds } = makeCtx('hard');
    unlockTech(ctx.state, ctx.player.id, 'astral_spire');
    ctx.player.spellCooldowns.meteor_storm = 0;
    ctx.player.spellCooldowns.astral_lance = 1;
    ctx.player.spellCooldowns.aegis_ward = 1;
    ctx.player.spellCooldowns.blink_gate = 1;
    const sanctum = findSanctum(ctx.state, 'player0')!;
    for (let i = 0; i < 6; i++) {
      spawnEntity(ctx.state, ctx.services, null, 'imp_swarmling', 'player0', sanctum.pos.x + i * 12, sanctum.pos.y);
    }
    decideSpells(ctx, strategyForPlayer(ctx.player).config, []);
    expect(cmds.some((c) => c.type === 'castSpell' && c.spellId === 'meteor_storm')).toBe(true);
  });

  it('Easy does not cast utility spells even with a cluster and the Spire', () => {
    const { ctx, cmds } = makeCtx('easy');
    unlockTech(ctx.state, ctx.player.id, 'astral_spire');
    ctx.player.spellCooldowns.meteor_storm = 0;
    ctx.player.spellCooldowns.astral_lance = 1;
    const sanctum = findSanctum(ctx.state, 'player0')!;
    for (let i = 0; i < 6; i++) {
      spawnEntity(ctx.state, ctx.services, null, 'imp_swarmling', 'player0', sanctum.pos.x + i * 12, sanctum.pos.y);
    }
    decideSpells(ctx, strategyForPlayer(ctx.player).config, []);
    expect(cmds.some((c) => c.type === 'castSpell' && c.spellId === 'meteor_storm')).toBe(false);
  });

  it('strategy-driven matches stay deterministic across difficulties', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const cfg = aiSkirmish(difficulty, 4);
      const a = runHeadless(reg, cfg, 480);
      const b = runHeadless(reg, cfg, 480);
      expect(hashState(a)).toBe(hashState(b));
    }
  });

  function spawnArmy(ctx: AiDecisionContext, count: number, defId = 'imp_swarmling'): void {
    const sanctum = findSanctum(ctx.state, ctx.player.id)!;
    for (let i = 0; i < count; i++) {
      spawnEntity(
        ctx.state,
        ctx.services,
        null,
        defId,
        ctx.player.id,
        sanctum.pos.x - TILE * (3 + (i % 6)),
        sanctum.pos.y + TILE * Math.floor(i / 6),
      );
    }
  }

  it('Hard masses an army instead of sending two troops', () => {
    const small = makeCtx('hard');
    spawnArmy(small.ctx, 2);
    decideCombat(small.ctx, strategyForPlayer(small.ctx.player).config, findSanctum(small.ctx.state, small.ctx.player.id)!, [
      ...small.ctx.state.entities.values(),
    ].filter((e) => isArmyUnit(small.ctx.services.registry, e)));
    expect(small.cmds.some((c) => c.type === 'attackMove' || c.type === 'attack')).toBe(false);

    const big = makeCtx('hard');
    spawnArmy(big.ctx, 12);
    decideCombat(big.ctx, strategyForPlayer(big.ctx.player).config, findSanctum(big.ctx.state, big.ctx.player.id)!, [
      ...big.ctx.state.entities.values(),
    ].filter((e) => isArmyUnit(big.ctx.services.registry, e)));
    const push = big.cmds.filter((c) => c.type === 'attackMove' || c.type === 'attack');
    expect(push.length).toBeGreaterThan(0);
    const sent = new Set(push.flatMap((c) => ('entityIds' in c ? c.entityIds : [])));
    expect(sent.size).toBeGreaterThanOrEqual(6);
  });

  it('Easy still dribbles a small clump', () => {
    const { ctx, cmds } = makeCtx('easy');
    spawnArmy(ctx, 4);
    decideCombat(ctx, strategyForPlayer(ctx.player).config, findSanctum(ctx.state, ctx.player.id)!, [
      ...ctx.state.entities.values(),
    ].filter((e) => isArmyUnit(ctx.services.registry, e)));
    expect(cmds.some((c) => c.type === 'attackMove')).toBe(true);
  });

  it('Hard aims a push at a nearby defense instead of the far HQ', () => {
    const { ctx, cmds } = makeCtx('hard');
    const sanctum = findSanctum(ctx.state, ctx.player.id)!;
    const sentry = spawnEntity(
      ctx.state,
      ctx.services,
      null,
      'arcane_sentry',
      'player0',
      sanctum.pos.x + TILE * 4,
      sanctum.pos.y,
    );
    spawnArmy(ctx, 12);
    decideCombat(ctx, strategyForPlayer(ctx.player).config, sanctum, [
      ...ctx.state.entities.values(),
    ].filter((e) => isArmyUnit(ctx.services.registry, e)));
    const enemyHq = findSanctum(ctx.state, 'player0')!;
    const towardSentry = cmds.some((c) => {
      if (c.type === 'attack') return c.targetId === sentry.id;
      if (c.type === 'attackMove') {
        const ds = Math.hypot(c.x - sentry.pos.x, c.y - sentry.pos.y);
        const dh = Math.hypot(c.x - enemyHq.pos.x, c.y - enemyHq.pos.y);
        return ds < dh;
      }
      return false;
    });
    expect(towardSentry).toBe(true);
  });

  it('Hard splits a wave across more than one approach', () => {
    const { ctx, cmds } = makeCtx('hard');
    spawnArmy(ctx, 12);
    decideCombat(ctx, strategyForPlayer(ctx.player).config, findSanctum(ctx.state, ctx.player.id)!, [
      ...ctx.state.entities.values(),
    ].filter((e) => isArmyUnit(ctx.services.registry, e)));
    const dests = cmds
      .filter((c) => c.type === 'attackMove')
      .map((c) => `${c.x},${c.y}`);
    expect(new Set(dests).size).toBeGreaterThan(1);
  });

  it('Hard produces a Waystone Wagon to expand', () => {
    const { ctx, cmds } = makeCtx('hard');
    const sanctum = findSanctum(ctx.state, ctx.player.id)!;
    spawnEntity(ctx.state, ctx.services, null, 'golem_forge', ctx.player.id, sanctum.pos.x + TILE * 6, sanctum.pos.y);
    unlockTech(ctx.state, ctx.player.id, 'ley_conduit');
    unlockTech(ctx.state, ctx.player.id, 'golem_forge');
    ctx.player.mana = 4000;
    spawnArmy(ctx, 8);
    recomputePower(ctx.state, ctx.services);
    decideExpansion(ctx, strategyForPlayer(ctx.player).config, sanctum, 8);
    expect(cmds.some((c) => c.type === 'produce' && c.defId === 'waystone_wagon')).toBe(true);
  });

  it('Hard deploys an idle Waystone Wagon on a far node', () => {
    const { ctx, cmds } = makeCtx('hard');
    const sanctum = findSanctum(ctx.state, ctx.player.id)!;
    spawnEntity(ctx.state, ctx.services, null, 'waystone_wagon', ctx.player.id, sanctum.pos.x + 20, sanctum.pos.y);
    decideExpansion(ctx, strategyForPlayer(ctx.player).config, sanctum, 8);
    expect(cmds.some((c) => c.type === 'move' || c.type === 'deploy')).toBe(true);
  });

  it('Hard places the Astral Spire once the Nexus is up and mana is banked', () => {
    const { ctx, cmds } = makeCtx('hard');
    const sanctum = findSanctum(ctx.state, ctx.player.id)!;
    const prior = [
      'attunement_spire',
      'ley_conduit',
      'summoning_circle',
      'resonance_vault',
      'scrying_obelisk',
      'golem_forge',
      'arcane_bunker',
      'arcane_nexus',
    ];
    prior.forEach((id, i) => {
      spawnEntity(ctx.state, ctx.services, null, id, ctx.player.id, sanctum.pos.x + TILE * (4 + (i % 4) * 3), sanctum.pos.y + TILE * Math.floor(i / 4) * 3);
      unlockTech(ctx.state, ctx.player.id, id);
    });
    spawnEntity(ctx.state, ctx.services, null, 'ley_conduit', ctx.player.id, sanctum.pos.x + TILE * 16, sanctum.pos.y);
    spawnEntity(ctx.state, ctx.services, null, 'ley_conduit', ctx.player.id, sanctum.pos.x + TILE * 16, sanctum.pos.y + TILE * 4);
    ctx.player.mana = 8000;
    recomputePower(ctx.state, ctx.services);
    strategyForPlayer(ctx.player).decide(ctx);
    expect(cmds.some((c) => c.type === 'build' && c.defId === 'astral_spire')).toBe(true);
  });

  it('queues army units even while the next building is unaffordable', () => {
    const { ctx, cmds } = makeCtx('hard');
    const sanctum = findSanctum(ctx.state, ctx.player.id)!;
    spawnEntity(ctx.state, ctx.services, null, 'summoning_circle', ctx.player.id, sanctum.pos.x + TILE * 5, sanctum.pos.y);
    unlockTech(ctx.state, ctx.player.id, 'summoning_circle');
    ctx.player.mana = 400;
    recomputePower(ctx.state, ctx.services);
    produceArmy(ctx, strategyForPlayer(ctx.player).config, 4);
    expect(cmds.some((c) => c.type === 'produce' && c.defId === 'imp_swarmling')).toBe(true);
  });
});
