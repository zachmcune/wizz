// THE EXHAUSTED ECONOMY, MEASURED.
//
// Longer matches run into a dead economy: `duel_glade` authors 127,000 mana but `manaNodeCapacity` clamps every node to 12,000 (a
// v1 parity constant), so the whole match economy is 75,000 mana and it is mined dry around minute 15. This reports the numbers
// rather than changing anything — economy values stay locked unless Zachary approves a change.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_RESOURCE_NODE } from '../src/sim/entity-store';

const reg = loadRegistry();
const nodeTotal = (state: ReturnType<typeof initMatch>['state']): number => {
  let sum = 0;
  for (let s = 0; s < state.entities.count; s++) {
    if (state.entities.dead[s] || state.entities.kind[s] !== KIND_RESOURCE_NODE) continue;
    sum += state.entities.amount[s] ?? 0;
  }
  return sum;
};

console.log(`manaNodeCapacity = ${reg.balance.manaNodeCapacity} (v1 parity constant)`);

for (const seed of [1000, 1014, 1028]) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade',
    seed,
    oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    ],
  } as never);
  const drv = new AiDriver(reg, services);

  const start = nodeTotal(state);
  let dryAt = -1;
  // Longest stretch with a bank too small to buy anything, per side.
  const lastSpend = [0, 0];
  const longestNoSpend = [0, 0];
  const lastMana = [state.players[0]!.mana, state.players[1]!.mana];

  for (let t = 0; t < 30 * 60 * 20 && !state.ended; t++) {
    stepSimulation(state, services, [], drv.hook);
    if (dryAt < 0 && nodeTotal(state) <= 0) dryAt = state.tick / 1200;
    for (let i = 0; i < 2; i++) {
      const mana = state.players[i]!.mana;
      if (mana < lastMana[i]) lastSpend[i] = state.tick;
      longestNoSpend[i] = Math.max(longestNoSpend[i]!, (state.tick - lastSpend[i]!) / 20);
      lastMana[i] = mana;
    }
  }
  console.log(
    `seed ${seed}: nodeMana start ${start}, mined dry at ${dryAt < 0 ? 'never' : dryAt.toFixed(1) + 'm'}, ` +
      `match ${(state.tick / 1200).toFixed(1)}m, longest no-spend p1 ${Math.round(longestNoSpend[0]!)}s p2 ${Math.round(longestNoSpend[1]!)}s`,
  );
}
