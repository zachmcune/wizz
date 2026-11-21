// Phase 1 done-criterion 4: prove determinism AND that the seed is live.
//
//   • Same seed + same draws  ⇒ identical hash (determinism)
//   • Different seed          ⇒ different hash (the RNG is actually consumed)
//
// v1 shipped a seeded `rngState` that nothing ever drew from, which is why every match with the
// same lobby configuration played out identically. This script checks the v2 behaviour directly
// so the fix is demonstrable, not just asserted in a comment.
//
//   node v2/scripts/demo-determinism.mjs

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v2Root = join(here, '..');
const bundle = join(v2Root, '.demo-determinism.mjs');

/** Bundle a small TS entry that exercises the sim primitives, then import it. */
const entry = join(v2Root, '.demo-entry.ts');

const entrySource = `
import { EntityStore } from './src/sim/entity-store';
import { hashState } from './src/sim/hash';
import { RNG_STREAMS, streamFor } from './src/core/rng';
import type { GameState } from './src/sim/types';

function makeState(seed: number): GameState {
  const entities = new EntityStore(64);
  entities.setOwners(['player0', 'player1']);
  return {
    tick: 0,
    seed,
    rng: Object.fromEntries(RNG_STREAMS.map((s) => [s, streamFor(seed, s).state()])),
    players: [
      {
        id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', mana: 900,
        power: 0, powerUsed: 0, unlockedTech: [], completedResearch: [], spellCooldowns: {},
        defeated: false, explored: [], visible: [], knownBuildings: {},
      },
      {
        id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', mana: 900,
        power: 0, powerUsed: 0, unlockedTech: [], completedResearch: [], spellCooldowns: {},
        defeated: false, explored: [], visible: [], knownBuildings: {},
      },
    ],
    relations: {
      player0: { player0: 'ally', player1: 'enemy' },
      player1: { player0: 'enemy', player1: 'ally' },
    },
    entities,
    nextEntityId: 1,
    mapId: 'duel_glade',
    winnerTeam: null,
    ended: false,
    beams: [],
    oneSuperweaponPerPlayer: true,
  };
}

/**
 * A miniature "match": 2000 ticks of deterministic draws driving entity placement.
 * Uses the seeded streams for every value that would otherwise be random.
 */
export function simulate(seed: number): { hash: string; draws: Record<string, number>; entities: number } {
  const state = makeState(seed);
  const map = streamFor(seed, 'map');
  const ai = streamFor(seed, 'ai');
  const spawn = streamFor(seed, 'spawn');

  let nextId = 1;
  for (let tick = 0; tick < 2000; tick++) {
    state.tick = tick;
    // Map stream: jitter a unit's position every tick.
    if (tick % 7 === 0) {
      const x = map.range(100, 3500);
      const y = map.range(100, 2400);
      state.entities.spawnUnit(nextId, nextId % 2, 'wisp', 0, x, y, 120, 9);
      nextId++;
    }
    // AI stream: occasionally move an existing unit.
    if (tick % 11 === 0 && state.entities.count > 0) {
      const slot = ai.int(0, state.entities.count - 1);
      state.entities.posX[slot] = state.entities.posX[slot]! + ai.range(-5, 5);
      state.entities.posY[slot] = state.entities.posY[slot]! + ai.range(-5, 5);
    }
    // Spawn stream: kill something once in a while.
    if (tick % 29 === 0 && state.entities.count > 3 && spawn.chance(0.5)) {
      state.entities.kill(spawn.int(0, state.entities.count - 1));
    }
    state.rng = { map: map.state(), ai: ai.state(), spawn: spawn.state(), cosmetic: streamFor(seed, 'cosmetic').state() };
    if (tick % 100 === 0) state.entities.compact();
  }
  state.entities.compact();

  return {
    hash: hashState(state),
    draws: { map: map.draws, ai: ai.draws, spawn: spawn.draws },
    entities: state.entities.liveCount(),
  };
}
`;

try {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(entry, entrySource);

  execFileSync(
    'npx',
    [
      'esbuild',
      entry,
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${bundle}`,
      '--log-level=error',
    ],
    { cwd: v2Root, stdio: 'inherit' },
  );

  const mod = await import(pathToFileURL(bundle).href);

  const a = mod.simulate(1);
  const b = mod.simulate(1);
  const c = mod.simulate(99999);

  console.log('seed 1     →', a.hash, `entities=${a.entities}`, `draws=${JSON.stringify(a.draws)}`);
  console.log('seed 1     →', b.hash, `entities=${b.entities}`, '(second identical run)');
  console.log('seed 99999 →', c.hash, `entities=${c.entities}`, `draws=${JSON.stringify(c.draws)}`);
  console.log('');

  const checks = [
    ['same seed reproduces the identical hash (2000 ticks)', a.hash === b.hash],
    ['a different seed produces a different hash', a.hash !== c.hash],
    ['the map stream was actually consumed', a.draws.map > 100],
    ['the ai stream was actually consumed', a.draws.ai > 100],
    ['the spawn stream was actually consumed', a.draws.spawn > 0],
    ['entities were created and compacted', a.entities > 0],
  ];
  let ok = true;
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`);
    if (!pass) ok = false;
  }
  console.log(ok ? '\nDone-criterion 4: PASS' : '\nDone-criterion 4: FAIL');
  if (!ok) process.exitCode = 1;
} finally {
  rmSync(bundle, { force: true });
  rmSync(entry, { force: true });
}
