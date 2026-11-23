// Neither side ever produces a combat unit. Why?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
const notes: Record<string, string[]> = { p1: [], p2: [] };
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services, { onDecision: (p, t, n) => { if (t % (60*20) === 0) for (const x of n) (notes[p] ??= []).push(x); } });
for (let t = 0; t < 8 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
const st = state.entities;
for (const p of state.players) {
  const mine = Array.from({ length: st.count }, (_, s) => s).filter((s) => !st.dead[s] && st.ownerId(st.ownerIndex[s]!) === p.id);
  const blds = mine.filter((s) => st.kind[s] === 0).map((s) => st.extras[s]!.defId);
  const counts = new Map<string, number>();
  for (const b of blds) counts.set(b, (counts.get(b) ?? 0) + 1);
  const units = mine.filter((s) => st.kind[s] === 1).map((s) => st.extras[s]!.defId);
  const ucounts = new Map<string, number>();
  for (const u of units) ucounts.set(u, (ucounts.get(u) ?? 0) + 1);
  console.log(`\n${p.id} mana=${Math.round(p.mana)}`);
  console.log(`  buildings: ${[...counts.entries()].map(([k, v]) => `${k}x${v}`).join(' ')}`);
  console.log(`  units: ${[...ucounts.entries()].map(([k, v]) => `${k}x${v}`).join(' ')}`);
  const uniq = [...new Set(notes[p.id] ?? [])];
  console.log(`  sampled notes: ${uniq.slice(0, 14).join(' | ')}`);
}
