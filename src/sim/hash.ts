// Stable hash of gameplay-relevant state. Two runs with identical inputs must match.
// Used by the headless determinism/replay tests and lockstep desync detection.
import type { GameState } from './types';

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

export function hashState(state: GameState): string {
  const parts: string[] = [
    `t${state.tick}`,
    `rng${state.rngState}`,
    `w${state.winnerTeam}`,
    `e${state.ended ? 1 : 0}`,
  ];
  for (const p of [...state.players].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    parts.push(`P${p.id}:${r(p.mana)}:${p.defeated ? 1 : 0}:${p.power}/${p.powerUsed}`);
  }
  const ids = [...state.entities.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const e = state.entities.get(id)!;
    const flags = [
      e.kind === 'unit' && e.channeling ? 'C' : '',
      e.kind === 'building' && e.repairing ? 'R' : '',
      e.kind === 'building' && e.buildProgress !== undefined ? `B${r(e.buildProgress)}` : '',
      (e.kind === 'unit' || e.kind === 'building') && e.morphProgress !== undefined ? `M${r(e.morphProgress)}` : '',
    ].join('');
    const stateStr = e.kind === 'resource_node' ? 'node' : e.state;
    const carryStr = e.kind === 'unit' ? r(e.carry ?? 0) : 0;
    const amountStr = e.kind === 'resource_node' ? r(e.amount) : 0;
    const channelStr = e.kind === 'unit' ? (e.channelTicks ?? 0) : 0;
    parts.push(
      `E${id}:${e.defId}:${e.owner}:${r(e.pos.x)},${r(e.pos.y)}:${r(e.hp)}:${stateStr}:${carryStr}:${amountStr}:${channelStr}:${flags}`,
    );
  }
  for (const b of state.beams) {
    parts.push(`SW${b.id}:${b.owner}:${r(b.pos.x)},${r(b.pos.y)}:${b.state}:${b.fireTick}:${b.expiresTick}`);
  }
  const s = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
