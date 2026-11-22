// HARD'S ONLY ADVANTAGE IS THE EARLY WAVE. IS IT STILL WORTH ANYTHING WITH A BIG ECONOMY?
//
// Hard attacks at 5 units instead of Normal's 7. That timing edge decided matches when the economy was thin; with 25,000-capacity
// nodes both sides can afford continuous production, so the window it exploits may have closed. This tests candidates that could
// give Hard a real edge again, measured against Normal.
import { runMatch } from './ai-tournament';

const seeds = [1000, 1007, 1014, 1021, 1028, 1035];
async function m(ov: Record<string, unknown>, label: string) {
  let aw = 0, bw = 0;
  for (const seed of seeds) for (const sw of [false, true]) {
    const r = runMatch({ seed, maxMinutes: 32, players: [
      { id: 'p1', difficulty: 'hard', team: 0, faction: 'arcane', startIndex: sw ? 1 : 0, aiOverrides: ov },
      { id: 'p2', difficulty: 'normal', team: 1, faction: 'arcane', startIndex: sw ? 0 : 1 }] });
    if (r.winnerTeam === 0) aw++; else if (r.winnerTeam === 1) bw++;
  }
  console.log(`${label.padEnd(32)} ${aw}-${bw}`);
}
await m({}, 'baseline (wave 5)');
await m({ minWaveSize: 4 }, 'wave 4');
await m({ waveGrowth: 0.5 }, 'faster wave growth');
await m({ harvestersPerRefinery: 8 }, 'more workers');
await m({ targetProduction: 3 }, '3rd producer');
