// CONCRETE NUMBERS FOR THE TEAM GAMES.
//
// The team tests assert properties (no ally damages an ally, the match resolves). This prints the actual outcome of a 2v2 and a
// 4-player free-for-all — length, winner, survivors — because "it passes" is a weaker claim than "it finished in N minutes with
// this result", and the report needs the numbers.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();

interface P {
  id: string;
  team: number;
  start: number;
  diff: 'easy' | 'normal' | 'hard';
}

async function play(label: string, players: P[], seed: number): Promise<void> {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade',
    seed,
    oneSuperweaponPerPlayer: false,
    players: players.map((p, i) => ({
      id: p.id,
      controller: 'ai' as const,
      aiDifficulty: p.diff,
      team: p.team,
      color: ['#4f9dff', '#ff5d5d', '#5dff8f', '#ffd166'][i]!,
      factionId: 'arcane',
      startIndex: p.start,
    })),
  } as never);
  const drv = new AiDriver(reg, services);
  const max = 35 * 60 * 20;
  while (!state.ended && state.tick < max) stepSimulation(state, services, [], drv.hook);

  const survivors: string[] = [];
  for (const p of players) {
    let u = 0;
    let b = 0;
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s]) continue;
      if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== p.id) continue;
      if (state.entities.kind[s] === KIND_UNIT) u++;
      if (state.entities.kind[s] === KIND_BUILDING) b++;
    }
    survivors.push(`${p.id}(t${p.team},${p.diff})=${u}u/${b}b`);
  }
  console.log(
    `${label} seed ${seed}: ended=${state.ended} winnerTeam=${state.winnerTeam} ` +
      `${(state.tick / 1200).toFixed(1)}min | ${survivors.join(' ')}`,
  );
}

await play('2v2', [
  { id: 'a1', team: 0, start: 0, diff: 'hard' },
  { id: 'a2', team: 0, start: 1, diff: 'easy' },
  { id: 'b1', team: 1, start: 2, diff: 'normal' },
  { id: 'b2', team: 1, start: 3, diff: 'normal' },
], 9091);

await play('FFA4', [
  { id: 'f0', team: 0, start: 0, diff: 'normal' },
  { id: 'f1', team: 1, start: 1, diff: 'normal' },
  { id: 'f2', team: 2, start: 2, diff: 'normal' },
  { id: 'f3', team: 3, start: 3, diff: 'normal' },
], 9092);
