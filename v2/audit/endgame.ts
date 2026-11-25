// WHAT ENDS A MATCH, AND WHAT WOULD LENGTHEN IT?
//
// With manaNodeCapacity raised to 25,000 the mirror median lands at 13.9 min and HQ HP from 4000 to 7000 only moves it to 14.9 —
// below the 15-minute floor. Raising HQ further has diminishing returns, which means the LAST event is not simply "HQ shot down":
// something decides the game earlier and then the siege is quick.
//
// This records, for the losing side, its army and worker count over the final minutes, so the binding constraint is visible.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

const ROOT = join(import.meta.dirname, '..');
const BAL = join(ROOT, 'data', 'balance.json');
const orig = readFileSync(BAL, 'utf8');
const restore = () => writeFileSync(BAL, orig);
process.on('SIGINT', () => { restore(); process.exit(130); });
const b = JSON.parse(orig) as Record<string, unknown>;
b.manaNodeCapacity = 25000;
writeFileSync(BAL, JSON.stringify(b, null, 2) + '\n');

const reg = loadRegistry();
for (const seed of [1000, 1014, 1035]) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    ],
  } as never);
  const drv = new AiDriver(reg, services);
  const trail: string[] = [];
  for (let t = 0; t < 30 * 60 * 20 && !state.ended; t++) {
    stepSimulation(state, services, [], drv.hook);
    if (state.tick % 2400 === 0) {
      const m = Math.round(state.tick / 1200);
      const s: string[] = [];
      for (const pid of ['p1', 'p2']) {
        let a = 0, w = 0, bl = 0;
        for (let k = 0; k < state.entities.count; k++) {
          if (state.entities.dead[k]) continue;
          if (state.entities.ownerId(state.entities.ownerIndex[k]!) !== pid) continue;
          if (state.entities.kind[k] === KIND_UNIT) {
            const d = reg.units.get(state.entities.extras[k]!.defId)!;
            if (d.isHarvester) w++; else if (d.weapon) a++;
          } else if (state.entities.kind[k] === KIND_BUILDING) bl++;
        }
        s.push(`${pid} a${a}/w${w}/b${bl}`);
      }
      trail.push(`${m}m[${s.join(' ')}]`);
    }
  }
  console.log(`seed ${seed} ended=${state.ended} winner=${state.winnerTeam} at ${(state.tick / 1200).toFixed(1)}m`);
  console.log('  ' + trail.slice(-7).join(' '));
}
restore();
console.log('restored');
