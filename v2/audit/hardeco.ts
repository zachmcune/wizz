import { runMatch } from './ai-tournament';
async function m(ov: Record<string, unknown>, label: string) {
  let aw = 0, bw = 0, un = 0;
  for (const seed of [1000, 1007, 1014, 1021, 1028, 1035]) for (const sw of [false, true]) {
    const r = runMatch({ seed, maxMinutes: 32, players: [
      { id: 'p1', difficulty: 'hard', team: 0, faction: 'arcane', startIndex: sw ? 1 : 0, aiOverrides: ov },
      { id: 'p2', difficulty: 'normal', team: 1, faction: 'arcane', startIndex: sw ? 0 : 1 }] });
    if (!r.ended) un++; else if (r.winnerTeam === 0) aw++; else bw++;
  }
  console.log(`${label.padEnd(38)} ${aw}-${bw} (un ${un})`);
}
await m({}, 'baseline');
await m({ harvestersPerRefinery: 8 }, 'workers 8/refinery');
await m({ expandAfterSeconds: 200 }, 'expand later (200s)');
await m({ harvestersPerRefinery: 8, expandAfterSeconds: 200 }, 'both');
